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
        this.sessionId = null;
        this.isConnected = false;
        this.pollInterval = null;
        this.API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
        this.MODEL_NAME = 'gemini-2.0-flash-exp';
        this.streamingResponses = new Map();

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

        await this.startSession();
    }

    async startSession() {
        try {
            const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL_ID}:streamGenerateContent`;
            
            const response = await fetch(`${API_ENDPOINT}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "初始化会话"
                        }]
                    }],
                    safety_settings: [{
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }]
                })
            });

            if (!response.ok) {
                throw new Error('初始化会话失败');
            }

            this.isConnected = true;
            this.startPolling();
        } catch (error) {
            console.error('初始化会话失败:', error);
            setTimeout(() => this.startSession(), 3000);
        }
    }

    startPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        this.pollInterval = setInterval(() => this.pollMessages(), 1000);
    }

    async pollMessages() {
        if (!this.isConnected) return;

        try {
            const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL_ID}:streamGenerateContent`;
            const response = await fetch(`${API_ENDPOINT}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "_poll"
                        }]
                    }]
                })
            });

            if (!response.ok) {
                throw new Error('轮询失败');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                                const text = data.candidates[0].content.parts[0].text;
                                if (text !== "_poll") {
                                    this.addMessage(text, false);
                                }
                            }
                        } catch (e) {
                            console.error('解析响应数据错误:', e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('轮询错误:', error);
            this.isConnected = false;
            setTimeout(() => this.startSession(), 3000);
        }
    }

    async sendMessage(message, options = {}) {
        if (!this.isConnected) {
            throw new Error('未连接到API');
        }

        const requestId = Date.now().toString();
        const endpoint = `${this.API_ENDPOINT}/${this.MODEL_NAME}:streamGenerateContent?key=${this.API_KEY}`;
        
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: message
                        }]
                    }],
                    safety_settings: [{
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }],
                    generation_config: {
                        temperature: 0.9,
                        top_p: 1,
                        top_k: 1,
                        max_output_tokens: 2048,
                    },
                    ...options
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let messageDiv = null;
            let contentDiv = null;

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const data = JSON.parse(line);
                        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) continue;

                        const text = data.candidates[0].content.parts[0].text;
                        
                        if (!messageDiv) {
                            messageDiv = document.createElement('div');
                            messageDiv.className = 'message bot';
                            contentDiv = document.createElement('div');
                            contentDiv.className = 'message-content';
                            messageDiv.appendChild(contentDiv);
                            this.chatMessages.appendChild(messageDiv);
                        }

                        contentDiv.textContent += text;
                        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
                    } catch (e) {
                        console.warn('解析响应数据时出错:', e);
                    }
                }
            }
        } catch (error) {
            console.error('发送消息时出错:', error);
            this.addMessage(`��送消息失败: ${error.message}`, false);
            throw error;
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
        // 如果是音频流，启动音频可视化
        if (stream.getAudioTracks().length > 0) {
            this.startAudioVisualization(stream);
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
        this.stopAudioVisualization();
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

            await this.sendMessage("请描述这个场景中的内容，使用简短的语言", {
                contents: [{
                    parts: [
                        {
                            text: "请描述这个场景中的内容，使用简短的语言"
                        },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64Data
                            }
                        }
                    ]
                }]
            });
        } catch (error) {
            console.error('处理视频帧时出错:', error);
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

    async toggleAudio() {
        try {
            if (this.mediaStream && this.mediaStream.getAudioTracks().length > 0) {
                this.stopMediaStream();
                this.startAudioBtn.classList.remove('active');
                this.stopAudioVisualization();
            } else {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100
                    }
                });
                this.startMediaStream(stream);
                this.startAudioBtn.classList.add('active');
                this.startAudioVisualization(stream);
            }
        } catch (error) {
            console.error('音频流错误:', error);
            this.addMessage('无法访问麦克风。请确保已授予权限。', false);
        }
    }

    startAudioVisualization(stream) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 创建音频分析器
        this.audioAnalyser = this.audioContext.createAnalyser();
        this.audioAnalyser.fftSize = 2048;
        
        // 创建音频源
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.audioAnalyser);

        // 创建音频处理器
        const bufferSize = 2048;
        this.audioProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        this.audioAnalyser.connect(this.audioProcessor);
        this.audioProcessor.connect(this.audioContext.destination);

        // 设置音频可视化画布
        const canvas = this.audioVisualizer;
        const canvasCtx = canvas.getContext('2d');
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;

        // 音频处理和可视化
        this.audioProcessor.onaudioprocess = (e) => {
            const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
            this.audioAnalyser.getByteFrequencyData(dataArray);

            // 清除画布
            canvasCtx.fillStyle = 'rgb(0, 0, 0)';
            canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

            // 绘制频谱
            const barWidth = (WIDTH / dataArray.length) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < dataArray.length; i++) {
                barHeight = dataArray[i] / 2;

                canvasCtx.fillStyle = `rgb(${barHeight + 100},50,50)`;
                canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }

            // 收集音频数据
            const inputData = e.inputBuffer.getChannelData(0);
            this.audioData.push(...Array.from(inputData));

            // 如果收集了足够的数据，进行处理
            if (this.audioData.length >= 44100) { // 1秒的数据
                this.processAudioData();
                this.audioData = [];
            }
        };
    }

    async processAudioData() {
        if (!this.isConnected) return;

        try {
            // 将音频数据转换为Base64
            const audioBlob = new Blob([Float32Array.from(this.audioData)], { type: 'audio/wav' });
            const base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(audioBlob);
            });

            // 发送音频数据到API
            await this.sendMessage("请分析这段音频内容", {
                contents: [{
                    parts: [
                        {
                            text: "请分析这段音频内容"
                        },
                        {
                            inline_data: {
                                mime_type: "audio/wav",
                                data: base64Data
                            }
                        }
                    ]
                }]
            });
        } catch (error) {
            console.error('处理音频数据时出错:', error);
        }
    }

    stopAudioVisualization() {
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        if (this.audioAnalyser) {
            this.audioAnalyser.disconnect();
            this.audioAnalyser = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.audioData = [];

        // 清除可视化画布
        const canvas = this.audioVisualizer;
        const canvasCtx = canvas.getContext('2d');
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
}); 