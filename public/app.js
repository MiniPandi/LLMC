class LLMChatViewer {
    constructor() {
        this.ws = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.currentMessages = { llm1: '', llm2: '' };
        this.messageCount = 0;
        this.isVisible = true;

        this.elements = {
            status: document.getElementById('status'),
            connectionStatus: document.getElementById('connectionStatus'),
            llm1Messages: document.getElementById('llm1Messages'),
            llm2Messages: document.getElementById('llm2Messages'),
            messageCounter: document.getElementById('messageCounter')
        };

        this.setupVisibilityHandling();
        this.connect();
    }

    setupVisibilityHandling() {
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
        });
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketHandlers();
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.scheduleReconnect();
        }
    }

    setupWebSocketHandlers() {
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
            this.updateStatus('Connected - Waiting for conversation...', 'connecting');
            this.reconnectDelay = 1000;
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
            this.updateStatus('Disconnected from server', 'stopped');
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleMessage(data) {
        switch (data.type) {
            case 'init':
                this.initializeChat(data);
                break;
            case 'status':
                this.updateRunningStatus(data.isRunning);
                break;
            case 'thinking':
                this.showThinking(data.llm);
                break;
            case 'stream':
                this.updateStreamingMessage(data);
                break;
            case 'message_complete':
                this.completeMessage(data);
                break;
            case 'reset':
                this.resetChat();
                break;
            case 'error':
                this.showError(data.message);
                break;
        }
    }

    initializeChat(data) {
        this.displayMessages(data.chat1, 'llm1');
        this.displayMessages(data.chat2, 'llm2');
        this.updateRunningStatus(data.isRunning);
    }

    displayMessages(messages, llm) {
        const container = llm === 'llm1' ? this.elements.llm1Messages : this.elements.llm2Messages;
        container.innerHTML = '';

        messages.forEach(msg => {
            if (msg.role === 'assistant') {
                this.addMessage(container, msg.content, false);
            }
        });
    }

    updateRunningStatus(isRunning) {
        if (isRunning) {
            this.updateStatus('Conversation in progress...', 'running');
        } else {
            this.updateStatus('Conversation paused', 'stopped');
        }
    }

    showThinking(llm) {
        const container = llm === 1 ? this.elements.llm1Messages : this.elements.llm2Messages;
        this.removeThinking(container);

        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'thinking';
        thinkingDiv.textContent = 'Thinking...';
        container.appendChild(thinkingDiv);

        this.scrollToBottom(container);
    }

    updateStreamingMessage(data) {
        const container = data.llm === 1 ? this.elements.llm1Messages : this.elements.llm2Messages;
        this.removeThinking(container);

        let streamingMessage = container.querySelector('.message.streaming');
        if (!streamingMessage) {
            streamingMessage = document.createElement('div');
            streamingMessage.className = 'message streaming';
            container.appendChild(streamingMessage);
        }

        streamingMessage.textContent = data.fullContent;
        this.scrollToBottom(container);
    }

    completeMessage(data) {
        const container = data.llm === 1 ? this.elements.llm1Messages : this.elements.llm2Messages;
        const streamingMessage = container.querySelector('.message.streaming');

        if (streamingMessage) {
            streamingMessage.classList.remove('streaming');
        }

        this.messageCount = data.messageCount;
        this.updateMessageCounter();
        this.scrollToBottom(container);

        // Add subtle notification if page is not visible
        if (!this.isVisible) {
            this.showNotification('New message received');
        }
    }

    addMessage(container, content, isStreaming = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isStreaming ? 'streaming' : ''}`;
        messageDiv.textContent = content;
        container.appendChild(messageDiv);
        this.scrollToBottom(container);
    }

    removeThinking(container) {
        const thinking = container.querySelector('.thinking');
        if (thinking) {
            thinking.remove();
        }
    }

    resetChat() {
        this.elements.llm1Messages.innerHTML = '';
        this.elements.llm2Messages.innerHTML = '';
        this.messageCount = 0;
        this.updateMessageCounter();
        this.updateStatus('Chat reset', 'connecting');
    }

    showError(message) {
        this.updateStatus(`Error: ${message}`, 'stopped');
    }

    updateStatus(text, className) {
        const statusSpan = this.elements.status.querySelector('span');
        statusSpan.textContent = text;
        this.elements.status.className = `status ${className}`;
    }

    updateConnectionStatus(connected) {
        this.elements.connectionStatus.textContent = connected ? '🟢 Connected' : '🔴 Disconnected';
        this.elements.connectionStatus.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }

    updateMessageCounter() {
        this.elements.messageCounter.textContent = `📊 Messages: ${this.messageCount}`;
    }

    scrollToBottom(container) {
        if (this.isVisible) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }

    showNotification(message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('LLM Chat', {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    scheduleReconnect() {
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            this.connect();
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
        }, this.reconnectDelay);
    }
}

// Initialize the chat viewer when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    new LLMChatViewer();
});

// Add some performance optimizations
let ticking = false;
function requestTick() {
    if (!ticking) {
        requestAnimationFrame(updateAnimations);
        ticking = true;
    }
}

function updateAnimations() {
    // Perform any animation updates here
    ticking = false;
}

// Optimize scroll performance
const chatMessages = document.querySelectorAll('.chat-messages');
chatMessages.forEach(container => {
    let isScrolling = false;
    container.addEventListener('scroll', () => {
        if (!isScrolling) {
            requestAnimationFrame(() => {
                isScrolling = false;
            });
            isScrolling = true;
        }
    });
});