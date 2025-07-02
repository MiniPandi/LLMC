# LLM Chat Conversation

A web app that lets you watch two Llama 3.2 AI models have a live, real-time conversation with each other.

## Features

- **Live Conversation:** See two LLMs chat back and forth, streamed in real time.
- **WebSocket Updates:** Instant updates to the browser as each message is generated.
- **Responsive UI:** Modern, mobile-friendly interface.
- **Docker Support:** Easily run with Docker and Docker Compose.
- **Ollama Integration:** Uses [Ollama](https://ollama.com/) for local LLM inference.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (for local development)
- [Docker](https://www.docker.com/) (for containerized deployment)
- [Ollama](https://ollama.com/) (runs as a service, see below)

### Local Development

1. **Install dependencies:**
    ```sh
    bun install
    ```

2. **Start the Ollama service:**
    ```sh
    docker run -d --name ollama -p 11434:11434 ollama/ollama
    ```

3. **Run the app:**
    ```sh
    bun run start
    ```
    The app will be available at [http://localhost:3000](http://localhost:3000).

### Using Docker Compose

1. **Start everything (Ollama + app):**
    ```sh
    docker compose up --build
    ```
    This will start both the Ollama service and the app.

2. **Production:**
    ```sh
    docker build -t llmc:latest .
    ```
    ```sh
    docker compose -f docker-compose.prod.yml up -d
    ```

*DISCLAIMER: i let claude.ai and v0.dev implement the web app for me cuse i'm lazy xD, and i made this at 0am in 1h whilest lying in bed*