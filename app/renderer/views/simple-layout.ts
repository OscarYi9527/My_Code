import { LayoutState } from '../../common/types/mode.types';

export function createSimpleLayout(state: LayoutState): string {
  return `
<div class="simple-layout" id="simple-layout">
  <div class="simple-sidebar" id="simple-sidebar">
    <div class="sidebar-header">文件</div>
    <div id="simple-file-tree"></div>
  </div>
  <div class="simple-right">
    <div class="simple-editor-panel" id="simple-editor-panel">
      <div class="simple-editor-header">
        <span id="simple-editor-filename">未打开文件</span>
        <button class="save-btn" id="simple-save-btn" disabled>保存</button>
      </div>
      <textarea class="simple-editor-textarea" id="simple-editor-textarea" placeholder="点击左侧文件树中的文件以查看内容" readonly></textarea>
    </div>
    <div class="simple-ai-panel">
      <div class="ai-panel-header">
        <span>AI 助手</span>
      </div>
      <div id="simple-ai-chat"></div>
    </div>
  </div>
</div>

<style>
.simple-layout { display: flex; height: 100vh; background: #1e1e1e; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.simple-sidebar { width: 240px; background: #252526; border-right: 1px solid #3c3c3c; display: flex; flex-direction: column; }
.sidebar-header { padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 0.5px; }
#simple-file-tree { flex: 1; overflow-y: auto; padding: 4px 0; }
.simple-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.simple-editor-panel { flex: 1; display: flex; flex-direction: column; border-bottom: 1px solid #3c3c3c; min-height: 0; }
.simple-editor-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #2d2d2d; font-size: 12px; border-bottom: 1px solid #3c3c3c; }
.save-btn { background: #007acc; color: #fff; border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 12px; }
.save-btn:disabled { background: #555; cursor: not-allowed; }
.simple-editor-textarea { flex: 1; background: #1e1e1e; color: #d4d4d4; border: none; padding: 16px; font-family: 'Consolas', 'Courier New', monospace; font-size: 14px; line-height: 1.6; resize: none; outline: none; }
.simple-editor-textarea[readonly] { color: #888; }
.simple-ai-panel { height: 40%; min-height: 200px; background: #252526; display: flex; flex-direction: column; }
.ai-panel-header { padding: 8px 12px; border-bottom: 1px solid #3c3c3c; font-size: 13px; font-weight: 500; }
#simple-ai-chat { flex: 1; overflow-y: auto; padding: 12px; }
</style>
`;
}
