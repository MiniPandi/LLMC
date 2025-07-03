class LLMChatViewer {
    constructor() {
        this.ws = null
        this.reconnectDelay = 1000
        this.maxReconnectDelay = 30000
        this.currentMessages = { llm1: "", llm2: "" }
        this.isVisible = true
        this.currentTab = "chat"

        this.elements = {
            status: document.getElementById("status"),
            connectionStatus: document.getElementById("connectionStatus"),
            llm1Messages: document.getElementById("llm1Messages"),
            llm2Messages: document.getElementById("llm2Messages"),
            llm1Details: document.getElementById("llm1Details"),
            llm2Details: document.getElementById("llm2Details"),
        }

        this.setupTabs()
        this.setupVisibilityHandling()
        this.connect()
        this.fetchModelInfo()
        this.fetchChat()
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll(".tab-button")
        const tabContents = document.querySelectorAll(".tab-content")

        tabButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const tabName = button.dataset.tab

                // Update active states
                tabButtons.forEach((btn) => btn.classList.remove("active"))
                tabContents.forEach((content) => content.classList.remove("active"))

                button.classList.add("active")
                document.getElementById(`${tabName}-tab`).classList.add("active")

                this.currentTab = tabName

                // Fetch model info when models tab is opened
                if (tabName === "models") {
                    this.fetchModelInfo()
                } else if (tabName == "download") {
                    this.fetchChat()
                }
            })
        })
    }

    setupVisibilityHandling() {
        document.addEventListener("visibilitychange", () => {
            this.isVisible = !document.hidden
        })
    }

    async fetchModelInfo() {
        try {
            const response = await fetch("/modelInfo")
            const data = await response.json()

            if (data.info) {
                this.displayModelInfo(data)
            }
        } catch (error) {
            console.error("Failed to fetch model info:", error)
        }
    }

    async fetchChat() {
        try {
            const response = await fetch("/getConversation")
            const data = await response.json()

            if (data) {
                this.displayRawChat(data)
            }
        } catch (error) {
            console.error("Failed to fetch raw chat:", error)
        }
    }

    displayRawChat(chatData) {
        const element = document.getElementById("rawChat")
        if (chatData) {
            const pre = document.createElement("pre")
            pre.textContent = JSON.stringify(chatData, null, 2)
            element.innerHTML = ""
            element.appendChild(pre)
        }
    }

    displayModelInfo(modelInfo) {
        const element = document.getElementById("llmDetails")
        if (modelInfo.info) {
            const pre = document.createElement("pre")
            pre.textContent = JSON.stringify(modelInfo.info, null, 2)
            element.innerHTML = ""
            element.appendChild(pre)
        } else {
            element.textContent = "No model info available"
        }
    }

    connect() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        const wsUrl = `${protocol}//${window.location.host}`

        try {
            this.ws = new WebSocket(wsUrl)
            this.setupWebSocketHandlers()
        } catch (error) {
            console.error("WebSocket connection failed:", error)
            this.scheduleReconnect()
        }
    }

    setupWebSocketHandlers() {
        this.ws.onopen = () => {
            console.log("Connected to server")
            this.updateConnectionStatus(true)
            this.updateStatus("Connected - Waiting for conversation...", "connecting")
            this.reconnectDelay = 1000
        }

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                this.handleMessage(data)
            } catch (error) {
                console.error("Error parsing message:", error)
            }
        }

        this.ws.onclose = () => {
            console.log("Disconnected from server")
            this.updateConnectionStatus(false)
            this.updateStatus("Disconnected from server", "stopped")
            this.scheduleReconnect()
        }

        this.ws.onerror = (error) => {
            console.error("WebSocket error:", error)
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case "init":
                this.initializeChat(data)
                break
            case "status":
                this.updateRunningStatus(data.isRunning)
                break
            case "thinking":
                this.showThinking(data.llm)
                break
            case "stream":
                this.updateStreamingMessage(data)
                break
            case "message_complete":
                this.completeMessage(data)
                break
            case "reset":
                this.resetChat()
                break
            case "error":
                this.showError(data.message)
                break
        }
    }

    initializeChat(data) {
        this.displayMessages(data.chat1, "llm1")
        this.displayMessages(data.chat2, "llm2")
        this.updateRunningStatus(data.isRunning)
    }

    displayMessages(messages, llm) {
        const container = llm === "llm1" ? this.elements.llm1Messages : this.elements.llm2Messages
        container.innerHTML = ""
        messages.forEach((msg) => {
            if (msg.role === "assistant") {
                this.addMessage(container, msg.content, false)
            }
        })
    }

    updateRunningStatus(isRunning) {
        if (isRunning) {
            this.updateStatus("Conversation in progress...", "running")
        } else {
            this.updateStatus("Conversation paused", "stopped")
        }
    }

    showThinking(llm) {
        const container = llm === 1 ? this.elements.llm1Messages : this.elements.llm2Messages
        this.removeThinking(container)
        const thinkingDiv = document.createElement("div")
        thinkingDiv.className = "thinking"
        thinkingDiv.textContent = "Thinking..."
        container.appendChild(thinkingDiv)
        this.scrollToBottom(container)
    }

    updateStreamingMessage(data) {
        const container = data.llm === 1 ? this.elements.llm1Messages : this.elements.llm2Messages
        this.removeThinking(container)
        let streamingMessage = container.querySelector(".message.streaming")
        if (!streamingMessage) {
            streamingMessage = document.createElement("div")
            streamingMessage.className = "message streaming"
            container.appendChild(streamingMessage)
        }
        streamingMessage.innerHTML = this.processMessageContent(data.fullContent)
        this.scrollToBottom(container)
    }

    completeMessage(data) {
        const container = data.llm === 1 ? this.elements.llm1Messages : this.elements.llm2Messages
        const streamingMessage = container.querySelector(".message.streaming")
        if (streamingMessage) {
            streamingMessage.classList.remove("streaming")
        }
        this.scrollToBottom(container)
    }

    addMessage(container, content, isStreaming = false) {
        const messageDiv = document.createElement("div")
        messageDiv.className = `message ${isStreaming ? "streaming" : ""}`
        messageDiv.innerHTML = this.processMessageContent(content)
        container.appendChild(messageDiv)
        this.scrollToBottom(container)
    }

    processMessageContent(content) {
        // Process <Thinking> sections
        content = content.replace(/<think>([\s\S]*?)<\/think>/gi, (match, thinkContent) => {
            const id = "think-" + Math.random().toString(36).substr(2, 9)
            return `
        <div class="think-section">
          <div class="think-header" onclick="toggleThink('${id}')">
            <span class="think-toggle">▶</span>
            <span>Thinking...</span>
          </div>
          <div class="think-content" id="${id}">
            ${thinkContent.trim()}
          </div>
        </div>
      `
        })

        // Process code blocks
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || "text"
            let highlightedCode
            try {
                highlightedCode = window.hljs.highlightAuto(code.trim(), [lang]).value
            } catch (e) {
                highlightedCode = code.trim()
            }
            return `
        <div class="code-block">
          <div class="code-header">${lang}</div>
          <pre><code class="hljs">${highlightedCode}</code></pre>
        </div>
      `
        })

        // Process inline code
        content = content.replace(/`([^`]+)`/g, "<code>$1</code>")

        return content
    }

    removeThinking(container) {
        const thinking = container.querySelector(".thinking")
        if (thinking) {
            thinking.remove()
        }
    }

    resetChat() {
        this.elements.llm1Messages.innerHTML = ""
        this.elements.llm2Messages.innerHTML = ""
        this.updateStatus("Chat reset", "connecting")
    }

    showError(message) {
        this.updateStatus(`Error: ${message}`, "stopped")
    }

    updateStatus(text, className) {
        const statusSpan = this.elements.status.querySelector("span")
        statusSpan.textContent = text
        this.elements.status.className = `status ${className}`
    }

    updateConnectionStatus(connected) {
        this.elements.connectionStatus.textContent = connected ? "🟢 Connected" : "🔴 Disconnected"
        this.elements.connectionStatus.className = `connection-status ${connected ? "connected" : "disconnected"}`
    }

    scrollToBottom(container) {
        if (this.isVisible) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight
            })
        }
    }

    scheduleReconnect() {
        setTimeout(() => {
            console.log("Attempting to reconnect...")
            this.connect()
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay)
        }, this.reconnectDelay)
    }
}

// Global function for think section toggling
function toggleThink(id) {
    const content = document.getElementById(id)
    const toggle = content.previousElementSibling.querySelector(".think-toggle")

    if (content.classList.contains("expanded")) {
        content.classList.remove("expanded")
        toggle.classList.remove("expanded")
    } else {
        content.classList.add("expanded")
        toggle.classList.add("expanded")
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new LLMChatViewer()
})