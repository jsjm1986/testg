class ChatApp {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.fileInput = document.getElementById('fileInput');
        this.imagePreview = document.getElementById('imagePreview');
        this.videoPreview = document.getElementById('videoPreview');
        this.videoCanvas = document.getElementById('videoCanvas');
        this.audioVisualizer = document.getElementById('audioVisualizer');
        this.startVideoBtn = document.getElementById('startVideo');
        this.startAudioBtn = document.getElementById('startAudio');
        this.clearChatBtn = document.getElementById('clearChat');
        
        this.selectedFiles = [];
        this.mediaStream = null;
        this.audioContext = null;
        this.audioAnalyser = null;
        this.audioProcessor = null;
        this.isProcessingFrame = false;
        this.processingInterval = null;
        this.currentController = null;
        this.audioData = [];

        this.API_KEY = 'AIzaSyCKaip6ZqpieBp-9LelZZJ-1WXTUPZi3H0';
        this.MODEL_ID = 'gemini-2.0-flash-exp';
        this.ws = null;
        this.isConnected = false;

        this.init();
    }

    async init() {
        this.sendButton.addEventListener('click', () => this.handleSend());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = this.userInput.scrollHeight + 'px';
        });

        this.startVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.startAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.clearChatBtn.addEventListener('click', () => this.clearChat());

        // 移除欢迎消息
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }

        await this.initWebSocket();
    }

    async initWebSocket() {
        try {
            const wsUrl = `wss://generativelanguage.googleapis.com/v1alpha/models/${this.MODEL_ID}:live?key=${this.API_KEY}`;
            
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket连接已建立');
                this.isConnected = true;
                
                // 发送初始配置
                const config = {
                    type: 'config',
                    config: {
                        response_modalities: ['TEXT']
                    }
                };
                this.ws.send(JSON.stringify(config));
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.text) {
                        this.addMessage(data.text, false);
                    }
                } catch (error) {
                    console.error('解析WebSocket消息错误:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket错误:', error);
                this.isConnected = false;
            };

            this.ws.onclose = () => {
                console.log('WebSocket连接已关闭');
                this.isConnected = false;
                // 尝试重新连接
                setTimeout(() => this.initWebSocket(), 3000);
            };
        } catch (error) {
            console.error('初始化WebSocket失败:', error);
        }
    }

    async sendMessage(message, isEndOfTurn = true) {
        if (!this.isConnected) {
            console.error('WebSocket未连接');
            return;
        }

        try {
            const messageData = {
                type: 'message',
                message: {
                    text: message
                },
                end_of_turn: isEndOfTurn
            };
            this.ws.send(JSON.stringify(messageData));
        } catch (error) {
            console.error('发送消息失败:', error);
        }
    }

    clearChat() {
        this.chatMessages.innerHTML = '';
    }

    async toggleVideo() {
        try {
            if (this.mediaStream && this.mediaStream.getVideoTracks().length > 0) {
                this.stopMediaStream();
                this.startVideoBtn.classList.remove('active');
                document.querySelector('.video-overlay').style.display = 'flex';
            } else {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } 
                });
                this.startMediaStream(stream);
                this.startVideoBtn.classList.add('active');
                document.querySelector('.video-overlay').style.display = 'none';
                this.startVideoProcessing();
            }
        } catch (error) {
            console.error('视频流错误:', error);
            this.addMessage('无法访问摄像头。请确保已授予权限。', false);
        }
    }

    startMediaStream(stream) {
        this.mediaStream = stream;
        if (stream.getVideoTracks().length > 0) {
            this.videoPreview.srcObject = stream;
        }
    }

    stopMediaStream() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        this.videoPreview.srcObject = null;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
        }
    }

    startVideoProcessing() {
        if (!this.processingInterval) {
            this.processingInterval = setInterval(() => this.processVideoFrame(), 1000); // 每秒处理一帧
        }
    }

    async processVideoFrame() {
        if (this.isProcessingFrame || !this.mediaStream || !this.isConnected) return;
        this.isProcessingFrame = true;

        try {
            const context = this.videoCanvas.getContext('2d');
            this.videoCanvas.width = this.videoPreview.videoWidth;
            this.videoCanvas.height = this.videoPreview.videoHeight;
            context.drawImage(this.videoPreview, 0, 0);

            const base64Data = this.videoCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

            const messageData = {
                type: 'message',
                message: {
                    text: "请描述这个场景中的内容，使用简短的语言",
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: base64Data
                    }
                },
                end_of_turn: true
            };

            this.ws.send(JSON.stringify(messageData));
        } catch (error) {
            console.error('处理视频帧错误:', error);
            this.addMessage('处理视频时出错: ' + error.message, false);
        } finally {
            this.isProcessingFrame = false;
        }
    }

    handleSend() {
        const message = this.userInput.value.trim();
        if (!message) return;

        // 添加用户消息
        this.addMessage(message, true);
        
        // 清空输入
        this.userInput.value = '';
        this.userInput.style.height = 'auto';

        // 发送消息
        this.sendMessage(message);
    }

    addMessage(message, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = message;
        
        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
}); 