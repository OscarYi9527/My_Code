export function createAiChatPanel(): string {
  return `
<div class="ai-chat" id="ai-chat">
  <div class="chat-messages" id="chat-messages">
    <div class="chat-empty">有问题随时问我，我会帮你分析代码、解释逻辑、查找问题。</div>
  </div>
  <div class="chat-input-area">
    <textarea class="chat-textarea" id="chat-textarea" rows="3" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" maxlength="8000"></textarea>
    <button class="chat-send-btn" id="chat-send-btn">发送</button>
  </div>
  <div class="chat-error hidden" id="chat-error"></div>
</div>

<style>
.ai-chat { display: flex; flex-direction: column; height: 100%; }
.chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.chat-empty { color: #666; text-align: center; margin-top: 24px; font-size: 13px; }
.chat-message { padding: 10px 12px; border-radius: 6px; font-size: 13px; line-height: 1.6; max-width: 100%; overflow-wrap: break-word; }
.chat-message.user { background: #2a4a6b; color: #d4e8ff; align-self: flex-end; }
.chat-message.assistant { background: #2d2d2d; color: #d4d4d4; border: 1px solid #3c3c3c; }
.chat-message pre { background: #1e1e1e; border: 1px solid #3c3c3c; border-radius: 4px; padding: 12px; overflow-x: auto; font-size: 12px; margin: 8px 0; }
.chat-message code { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; }
.chat-message :not(pre) > code { background: #3c3c3c; padding: 1px 4px; border-radius: 3px; }
.file-link { color: #4daafc; cursor: pointer; text-decoration: underline; }
.file-link:hover { color: #80c4ff; }
.chat-input-area { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #3c3c3c; }
.chat-textarea { flex: 1; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3c3c3c; border-radius: 4px; padding: 8px; font-size: 13px; resize: vertical; outline: none; font-family: inherit; }
.chat-textarea:focus { border-color: #007acc; }
.chat-send-btn { background: #007acc; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; align-self: flex-end; }
.chat-send-btn:hover { background: #005a9e; }
.chat-send-btn:disabled { background: #555; cursor: not-allowed; }
.chat-error { padding: 8px 12px; background: #5a1d1d; color: #f48771; font-size: 12px; border-top: 1px solid #be1100; }
.chat-error.hidden { display: none; }
</style>
`;
}
