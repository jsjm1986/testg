class ChatBot {
    constructor() {
        // DOM 元素初始化
        this.initializeElements();
        // 状态管理
        this.initializeState();
        // 建立WebSocket连接
        this.initializeWebSocket();
        // 设置事件监听
        this.setupEventListeners();
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.startVoiceButton = document.getElementById('startVoice');
        this.startVideoButton = document.getElementById('startVideo');
        this.videoPreview = document.getElementById('videoPreview');
        this.audioIndicator = document.getElementById('audioIndicator');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.querySelector('.status-text');
        this.mediaPreviewContainer = document.querySelector('.media-preview-container');
    }

    initializeState() {
        this.mediaRecorder = null;
        this.isRecording = false;
        this.conversationHistory = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.isConnected = false;
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this.lastMessageTime = Date.now();
        this.messageRateLimit = 1000; // 消息发送最小间隔（毫秒）
    }

    initializeWebSocket() {
        this.connectWebSocket();
    }

    connectWebSocket() {
        try {
            if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                console.log('WebSocket已经在连接中...');
                return;
            }

            this.updateConnectionStatus('connecting');
            this.ws = new WebSocket('ws://localhost:3000/ws');
            this.setupWebSocketHandlers();
            
            // 添加连接超时处理
            this.connectionTimeout = setTimeout(() => {
                if (this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close();
                    this.updateConnectionStatus('timeout');
                    this.attemptReconnect();
                }
            }, 5000);
            
            // 心跳检测
            this.heartbeatInterval = setInterval(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.sendWebSocketMessage({ type: 'ping' });
                }
            }, 25000);
            
        } catch (error) {
            console.error('WebSocket连接创建失败:', error);
            this.updateConnectionStatus('error');
            this.attemptReconnect();
        }
    }

    updateConnectionStatus(status) {
        switch(status) {
            case 'connecting':
                this.statusDot.style.backgroundColor = '#ffd700';
                this.statusText.textContent = '正在连接...';
                break;
            case 'connected':
                this.statusDot.style.backgroundColor = 'var(--success-color)';
                this.statusText.textContent = '在线';
                this.enableInterface();
                break;
            case 'disconnected':
                this.statusDot.style.backgroundColor = '#ff4444';
                this.statusText.textContent = '离线';
                this.disableInterface();
                break;
            case 'error':
                this.statusDot.style.backgroundColor = '#ff4444';
                this.statusText.textContent = '连接错误';
                this.disableInterface();
                break;
            case 'timeout':
                this.statusDot.style.backgroundColor = '#ff4444';
                this.statusText.textContent = '连接超时';
                this.disableInterface();
                break;
        }
    }

    async processMessageQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        while (this.messageQueue.length > 0) {
            const currentTime = Date.now();
            const timeSinceLastMessage = currentTime - this.lastMessageTime;
            
            if (timeSinceLastMessage < this.messageRateLimit) {
                await new Promise(resolve => setTimeout(resolve, 
                    this.messageRateLimit - timeSinceLastMessage));
            }
            
            const message = this.messageQueue.shift();
            try {
                await this.processMessage(message);
                this.lastMessageTime = Date.now();
            } catch (error) {
                console.error('消息处理错误:', error);
                this.addMessage(`系统: 消息处理失败 - ${error.message}`, 'error');
            }
        }
        
        this.isProcessingQueue = false;
    }

    async processMessage(message) {
        if (!this.isConnected) {
            throw new Error('未连接到服务器');
        }
        
        // 根据消息类型处理
        switch(message.type) {
            case 'text':
                await this.sendTextMessage(message.content);
                break;
            case 'media':
                await this.sendMediaChunk(message.content);
                break;
            default:
                throw new Error('未知的消息类型');
        }
    }

    queueMessage(message) {
        this.messageQueue.push(message);
        this.processMessageQueue();
    }

    setupWebSocketHandlers() {
        this.ws.onopen = () => {
            console.log('WebSocket连接已建立');
            clearTimeout(this.connectionTimeout);
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 2000;
            this.updateConnectionStatus('connected');
            
            // 连接成功后处理队列中的消息
            this.processMessageQueue();
        };

        this.ws.onclose = (event) => {
            console.log(`WebSocket连接已关闭 (代码: ${event.code}, 原因: ${event.reason})`);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
            
            clearInterval(this.heartbeatInterval);
            clearTimeout(this.connectionTimeout);
            
            if (!this.isManualClose) {
                this.attemptReconnect();
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('收到消息:', data.type);
                
                switch (data.type) {
                    case 'system':
                        console.log('系统消息:', data.message);
                        break;
                    case 'ai-response':
                        this.addMessage(data.text);
                        break;
                    case 'error':
                        this.addMessage(`错误: ${data.message}`, 'error');
                        break;
                    case 'pong':
                        // 心跳响应
                        break;
                    default:
                        console.log('未知消息类型:', data.type);
                }
            } catch (error) {
                console.error('消息处理错误:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
            this.updateConnectionStatus('error');
        };
    }

    handleWebSocketMessage(data) {
        if (data.type === 'ai-response') {
            this.addMessage(data.text);
        } else if (data.type === 'error') {
            this.addMessage(`错误: ${data.message}`, 'error');
        }
    }

    enableInterface() {
        this.sendButton.disabled = false;
        this.startVoiceButton.disabled = false;
        this.startVideoButton.disabled = false;
        this.userInput.disabled = false;
    }

    disableInterface() {
        this.sendButton.disabled = true;
        this.startVoiceButton.disabled = true;
        this.startVideoButton.disabled = true;
        this.userInput.disabled = true;
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts && !this.isConnected) {
            console.log(`尝试重新连接... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connectWebSocket();
                this.reconnectAttempts++;
                this.reconnectDelay *= 1.5; // 指数退避
            }, this.reconnectDelay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.addMessage('无法连接到服务器，请刷新页面重试。', 'error');
        }
    }

    setupEventListeners() {
        // 文本输入事件
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 自动调整文本框高度
        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = (this.userInput.scrollHeight) + 'px';
        });

        // 媒体控制事件
        this.startVoiceButton.addEventListener('click', () => this.toggleVoiceRecording());
        this.startVideoButton.addEventListener('click', () => this.toggleVideoRecording());

        // 页面关闭前清理
        window.addEventListener('beforeunload', () => {
            if (this.isRecording) {
                this.stopRecording();
            }
            if (this.ws) {
                this.ws.close();
            }
        });
    }

    // 发送WebSocket消息的通用方法
    sendWebSocketMessage(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error('发送消息失败:', error);
                return false;
            }
        } else {
            this.addMessage('连接已断开，请等待重新连接或刷新页面。', 'error');
            return false;
        }
    }

    async requestMediaPermission(constraints) {
        try {
            const result = await navigator.permissions.query({ name: 'camera' });
            if (result.state === 'denied') {
                this.addMessage('请在浏览器设置中允许访问摄像头和麦克风，然后刷新页面重试。', 'error');
                return null;
            }
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            this.handleMediaError(error);
            return null;
        }
    }

    handleMediaError(error) {
        let message = '访问媒体设备时出错';
        if (error.name === 'NotAllowedError') {
            message = '您已拒绝访问摄像头/麦克风。如需使用，请在浏览器设置中允许访问，然后刷新页面。';
        } else if (error.name === 'NotFoundError') {
            message = '未检测到摄像头/麦克风设备，请确保设备已正确连接。';
        } else {
            message = `访问媒体设备时出错: ${error.message}`;
        }
        this.addMessage(message, 'error');
        console.error('Media access error:', error);
    }

    async toggleVoiceRecording() {
        if (this.isRecording) {
            await this.stopRecording();
            this.startVoiceButton.classList.remove('active');
            this.audioIndicator.classList.remove('active');
        } else {
            const stream = await this.requestMediaPermission({ audio: true });
            if (stream) {
                this.audioIndicator.classList.add('active');
                this.startVoiceButton.classList.add('active');
                await this.startRecording(stream, 'audio');
            }
        }
    }

    async toggleVideoRecording() {
        if (this.isRecording) {
            await this.stopRecording();
            this.startVideoButton.classList.remove('active');
            this.videoPreview.classList.remove('active');
            this.removeRecordingIndicator();
        } else {
            const stream = await this.requestMediaPermission({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }, 
                audio: true 
            });
            
            if (stream) {
                this.videoPreview.srcObject = stream;
                this.videoPreview.classList.add('active');
                this.startVideoButton.classList.add('active');
                this.addRecordingIndicator();
                await this.startRecording(stream, 'video');
                this.videoPreview.play();
            }
        }
    }

    addRecordingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'video-recording-indicator';
        indicator.innerHTML = `
            <span class="recording-dot"></span>
            <span>录制中</span>
        `;
        this.mediaPreviewContainer.appendChild(indicator);
    }

    removeRecordingIndicator() {
        const indicator = this.mediaPreviewContainer.querySelector('.video-recording-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async startRecording(stream, mediaType) {
        this.isRecording = true;
        const mimeType = mediaType === 'video' ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';
        
        // 通知服务器开始新的媒体流会话
        this.sendWebSocketMessage({
            type: 'media-stream-start',
            mediaType: mediaType
        });

        this.mediaRecorder = new MediaRecorder(stream, { 
            mimeType: mimeType,
            videoBitsPerSecond: 1000000 // 1 Mbps
        });

        this.mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                // 将媒体数据转换为base64并发送
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result.split(',')[1];
                    this.sendWebSocketMessage({
                        type: 'media-chunk',
                        chunk: base64data,
                        mimeType: mimeType
                    });
                };
                reader.readAsDataURL(event.data);
            }
        };

        // 设置较小的时间片，实现更实时的传输
        this.mediaRecorder.start(100); // 每100ms发送一次数据

        // 自动停止录制
        setTimeout(() => {
            if (this.isRecording) {
                this.stopRecording();
                if (mediaType === 'video') {
                    this.startVideoButton.classList.remove('active');
                    this.videoPreview.classList.remove('active');
                    this.removeRecordingIndicator();
                } else {
                    this.startVoiceButton.classList.remove('active');
                    this.audioIndicator.classList.remove('active');
                }
            }
        }, 30000); // 30秒后自动停止
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.isRecording = false;
            this.mediaRecorder.stop();
            this.sendWebSocketMessage({
                type: 'media-stream-end'
            });

            const tracks = this.mediaRecorder.stream.getTracks();
            tracks.forEach(track => track.stop());

            // 清理视频预览
            if (this.videoPreview.srcObject) {
                this.videoPreview.srcObject = null;
            }
        }
    }

    addMessage(content, type = 'normal') {
        // 限制消息历史记录大小
        if (this.chatMessages.children.length > 100) {
            this.chatMessages.removeChild(this.chatMessages.firstChild);
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type === 'error' ? 'error-message' : 
            (type === 'normal' ? (content.startsWith('用户:') ? 'user-message' : 'bot-message') : type)}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // XSS 防护
        messageContent.textContent = content;
        
        // 添加时间戳
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        
        messageDiv.appendChild(messageContent);
        messageDiv.appendChild(timestamp);
        
        // 添加重试按钮（如果是错误消息）
        if (type === 'error') {
            const retryButton = document.createElement('button');
            retryButton.className = 'retry-button';
            retryButton.textContent = '重试';
            retryButton.onclick = () => {
                const lastUserMessage = Array.from(this.chatMessages.children)
                    .reverse()
                    .find(msg => msg.querySelector('.message-content')?.textContent.startsWith('用户:'));
                
                if (lastUserMessage) {
                    const content = lastUserMessage.querySelector('.message-content').textContent.replace('用户: ', '');
                    this.queueMessage({
                        type: 'text',
                        content: content
                    });
                }
            };
            messageDiv.appendChild(retryButton);
        }
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        // 只保存用户消息到历史记录
        if (type === 'normal' && content.startsWith('用户:')) {
            this.conversationHistory.push({
                role: 'user',
                parts: [{ text: content.substring(4).trim() }]
            });
        }
    }

    async sendMessage() {
        const userMessage = this.userInput.value.trim();
        if (!userMessage) return;

        // 添加到消息队列
        this.queueMessage({
            type: 'text',
            content: userMessage
        });

        // 清理输入
        this.userInput.value = '';
        this.userInput.style.height = 'auto';
    }

    async sendTextMessage(content) {
        // 显示用户消息
        this.addMessage(`用户: ${content}`);

        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'message bot-message typing';
        typingIndicator.innerHTML = '<div class="typing-indicator">AI正在思考...</div>';
        this.chatMessages.appendChild(typingIndicator);

        try {
            console.log('发送消息:', content);
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [{ text: content }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        candidateCount: 1,
                        maxOutputTokens: 2048,
                        topP: 0.8,
                        topK: 40
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API错误响应:', errorData);
                throw new Error(errorData.message || errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('API响应数据:', data);
            
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                const botResponse = data.candidates[0].content.parts[0].text;
                this.addMessage(`AI: ${botResponse}`);
                
                // 保存到对话历史
                this.conversationHistory.push({
                    role: "assistant",
                    parts: [{ text: botResponse }]
                });
            } else {
                console.error('无效的API响应格式:', data);
                throw new Error('API返回了无效的响应格式');
            }
        } catch (error) {
            console.error('发送消息错误:', error);
            this.addMessage(`系统: ${error.message}`, 'error');
        } finally {
            if (typingIndicator.parentNode) {
                this.chatMessages.removeChild(typingIndicator);
            }
        }
    }
}

// 确保DOM完全加载后再初始化
document.addEventListener('DOMContentLoaded', () => {
    window.chatBot = new ChatBot();
}); 