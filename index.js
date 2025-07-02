import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { Ollama } from 'ollama'
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ollama = new Ollama({ host: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434' })
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

class LLMChat {
  constructor() {
    this.systemMessage = {
      role: 'system',
      content: 'You are an LLM having a conversation with another LLM. Keep responses concise and engaging.'
    };
    this.chat1 = [];
    this.chat2 = [];
    this.isRunning = false;
    this.clients = new Set();
    this.messageCount = 0;
    this.model = process.env.MODEL || 'llama3.2';
  }

  addClient(ws) {
    this.clients.add(ws);
    // Send current state to new client
    ws.send(JSON.stringify({
      type: 'init',
      chat1: this.chat1,
      chat2: this.chat2,
      isRunning: this.isRunning
    }));
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  async startConversation() {
    if (this.isRunning) return;

    const model = this.model;
    console.log(`downloading ${model}...`)
    let currentDigestDone = false
    const stream = await ollama.pull({ model: model, stream: true })
    for await (const part of stream) {
      if (part.digest) {
        let percent = 0;
        if (part.completed && part.total) {
          percent = Math.round((part.completed / part.total) * 100);
        }
        if (process.stdout.clearLine && process.stdout.cursorTo) {
          process.stdout.clearLine(0); // Clear the current line
          process.stdout.cursorTo(0); // Move cursor to the beginning of the line
          process.stdout.write(`${part.status} ${percent}%...`); // Write the new text
        } else {
          // Fallback for environments like Bun where these functions are not available
          console.log(`${part.status} ${percent}%...`);
        }
        if (percent === 100 && !currentDigestDone) {
          console.log(); // Output to a new line
          currentDigestDone = true;
        } else {
          currentDigestDone = false;
        }
      } else {
        console.log(part.status);
      }
    }

    this.isRunning = true;
    this.messageCount = 0;
    this.broadcast({ type: 'status', isRunning: true });

    try {
      await this.chatAs1();
    } catch (error) {
      console.error('Chat error:', error);
      this.broadcast({ type: 'error', message: error.message });
      this.stopConversation();
    }
  }

  stopConversation() {
    this.isRunning = false;
    this.broadcast({ type: 'status', isRunning: false });
  }

  resetConversation() {
    this.stopConversation();
    this.chat1 = [];
    this.chat2 = [];
    this.messageCount = 0;
    this.broadcast({ type: 'reset' });
  }

  async chatAs1() {
    if (!this.isRunning) {
      this.stopConversation();
      return;
    }

    this.broadcast({ type: 'thinking', llm: 1 });

    let content = '';
    const res = await ollama.chat({
      model: this.model,
      messages: [this.systemMessage, ...this.chat1],
      stream: true
    });

    for await (const part of res) {
      if (!this.isRunning) break;
      content += part.message.content;
      this.broadcast({
        type: 'stream',
        llm: 1,
        content: part.message.content,
        fullContent: content
      });
    }

    if (!this.isRunning) return;

    this.chat1.push({ role: 'assistant', content });
    this.chat2.push({ role: 'user', content });
    this.messageCount++;

    this.broadcast({
      type: 'message_complete',
      llm: 1,
      content,
      messageCount: this.messageCount
    });

    // Small delay before next message
    setTimeout(() => {
      if (this.isRunning) this.chatAs2();
    }, 1000);
  }

  async chatAs2() {
    if (!this.isRunning) {
      this.stopConversation();
      return;
    }

    this.broadcast({ type: 'thinking', llm: 2 });

    let content = '';
    const res = await ollama.chat({
      model: this.model,
      messages: [this.systemMessage, ...this.chat2],
      stream: true
    });

    for await (const part of res) {
      if (!this.isRunning) break;
      content += part.message.content;
      this.broadcast({
        type: 'stream',
        llm: 2,
        content: part.message.content,
        fullContent: content
      });
    }

    if (!this.isRunning) return;

    this.chat2.push({ role: 'assistant', content });
    this.chat1.push({ role: 'user', content });
    this.messageCount++;

    this.broadcast({
      type: 'message_complete',
      llm: 2,
      content,
      messageCount: this.messageCount
    });

    // Small delay before next message
    setTimeout(() => {
      if (this.isRunning) this.chatAs1();
    }, 1000);
  }
}

const llmChat = new LLMChat();

wss.on('connection', (ws) => {
  llmChat.addClient(ws);

  ws.on('close', () => {
    llmChat.removeClient(ws);
  });
});

setTimeout(() => {
  llmChat.startConversation();
}, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});