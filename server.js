const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);

// WebSocket 服务器配置
const wss = new WebSocket.Server({ 
    server,
    path: '/ws',  // 指定WebSocket路径
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
    }
});

const PORT = 3000;
const API_KEY = 'AIzaSyCKaip6ZqpieBp-9LelZZJ-1WXTUPZi3H0';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// 启用 CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// 存储活动连接
const clients = new Set();

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
    console.log('新的WebSocket连接已建立');
    ws.isAlive = true;
    clients.add(ws);

    // 发送欢迎消息
    ws.send(JSON.stringify({
        type: 'system',
        message: '连接成功'
    }));

    let mediaStream = null;

    // 心跳响应
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('收到WebSocket消息类型:', data.type);
            
            switch (data.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;

                case 'media-stream-start':
                    if (mediaStream) {
                        // 清理现有的媒体流
                        console.log('清理现有的媒体流会话');
                        mediaStream = null;
                    }
                    mediaStream = {
                        type: data.mediaType,
                        chunks: [],
                        startTime: Date.now()
                    };
                    console.log(`开始新的${data.mediaType}流会话`);
                    break;

                case 'media-chunk':
                    if (!mediaStream) {
                        throw new Error('没有活动的媒体流会话');
                    }
                    
                    try {
                        console.log(`处理${mediaStream.type}数据块`);
                        // 发送到 Gemini API
                        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{
                                        inlineData: {
                                            mimeType: data.mimeType,
                                            data: data.chunk
                                        }
                                    }]
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
                            const errorData = await response.json();
                            console.error('Gemini API 媒体处理错误:', errorData);
                            throw new Error(errorData.error?.message || `API响应错误: ${response.status}`);
                        }

                        const result = await response.json();
                        console.log('Gemini API 媒体处理响应:', result);

                        if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                            ws.send(JSON.stringify({
                                type: 'ai-response',
                                text: result.candidates[0].content.parts[0].text
                            }));
                        } else {
                            throw new Error('API返回了无效的响应格式');
                        }
                    } catch (error) {
                        console.error('处理媒体块时出错:', error);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: '处理媒体数据时出错: ' + error.message
                        }));
                    }
                    break;

                case 'media-stream-end':
                    if (mediaStream) {
                        console.log(`结束${mediaStream.type}流会话，持续时间: ${(Date.now() - mediaStream.startTime) / 1000}秒`);
                        mediaStream = null;
                    }
                    break;

                default:
                    console.log('未知的WebSocket消息类型:', data.type);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: '未知的消息类型'
                    }));
            }
        } catch (error) {
            console.error('处理WebSocket消息时出错:', error);
            try {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: '消息处理错误: ' + error.message
                }));
            } catch (e) {
                console.error('发送错误消息失败:', e);
            }
        }
    });

    // 错误处理
    ws.on('error', (error) => {
        console.error('WebSocket连接错误:', error);
        try {
            ws.send(JSON.stringify({
                type: 'error',
                message: '连接错误: ' + error.message
            }));
        } catch (e) {
            console.error('发送错误消息失败:', e);
        }
    });

    // 连接关闭处理
    ws.on('close', () => {
        console.log('WebSocket连接已关闭');
        ws.isAlive = false;
        clients.delete(ws);
        if (mediaStream) {
            console.log('清理未完成的媒体流会话');
            mediaStream = null;
        }
    });
});

// 定期清理断开的连接
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('终止不活跃的连接');
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// 服务器关闭时清理
wss.on('close', () => {
    clearInterval(interval);
});

// 文本聊天 API 请求
app.post('/api/chat', async (req, res) => {
    try {
        console.log('发送到 Gemini API 的请求数据:', req.body);
        
        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: req.body.contents,
                generationConfig: {
                    ...req.body.generationConfig,
                    stopSequences: [],
                    maxOutputTokens: 2048,
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_DANGEROUS",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API 错误响应:', errorData);
            throw new Error(errorData.error?.message || `API响应错误: ${response.status}`);
        }

        const data = await response.json();
        console.log('Gemini API 响应数据:', data);
        res.json(data);
    } catch (error) {
        console.error('处理聊天请求时出错:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message,
            details: error.stack
        });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`WebSocket 服务器运行在 ws://localhost:${PORT}/ws`);
}); 