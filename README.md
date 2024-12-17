# Gemini 聊天机器人

这是一个基于 Google Gemini 2.0 Flash API 的多模态聊天机器人应用。支持文本对话和图片上传功能。

## 功能特点

- 支持文本对话
- 支持图片上传和预览
- 现代化的用户界面
- 响应式设计
- 实时消息显示

## 使用方法

1. 获取 Gemini API 密钥
   - 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
   - 创建新的 API 密钥

2. 配置 API 密钥
   - 打开 `app.js` 文件
   - 找到 `API_KEY = 'YOUR_API_KEY'` 这一行
   - 将 `YOUR_API_KEY` 替换为你的实际 API 密钥

3. 运行应用
   - 使用本地服务器运行项目（例如 Live Server）
   - 打开浏览器访问对应地址

## 使用说明

1. 文本对话
   - 在输入框中输入文字
   - 点击发送按钮或按回车键发送消息

2. 图片上传
   - 点击上传按钮选择图片
   - 支持多图片上传
   - 可以预览和删除已选择的图片

## 技术栈

- HTML5
- CSS3
- JavaScript (ES6+)
- Google Gemini API

## 注意事项

- 请确保 API 密钥的安全性，不要将其暴露在公共环境中
- 图片上��支持常见的图片格式（JPG、PNG、GIF等）
- 建议使用现代浏览器以获得最佳体验 