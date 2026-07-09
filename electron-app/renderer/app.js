const api = window.electronAPI;
const app = document.getElementById('app');

window.onerror = function(msg, url, line) {
  var el = document.getElementById('loading');
  if (el) el.innerHTML = '<div style="background:#5a1d1d;border:1px solid #be1100;color:#f48771;padding:20px;margin:40px;border-radius:4px;font-size:14px;white-space:pre-wrap"><b>JS Error:</b><br>' + msg + '<br><br>File: ' + url + '<br>Line: ' + line + '</div>';
};

let currentUser = null;
let currentMode = 'dev';
let terminalVisible = false;
let activeSidebar = 'explorer';
let simpleTab = 'chat';
let currentFile = { path: null, content: '' };
let openFiles = [];
let activeFilePath = null;
let aiTabOpen = false;
let fileTreeCache = {};
let treeExpanded = {};

const CSS = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1e1e1e;color:#ccc;overflow:hidden}

.login-container{display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1e1e}
.login-box{width:380px;padding:40px;background:#252526;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.4)}
.login-box h1{text-align:center;margin:0 0 4px;color:#fff;font-size:22px}
.login-box .subtitle{text-align:center;margin:0 0 24px;color:#888;font-size:13px}
.form{display:flex;flex-direction:column;gap:14px}.form.hidden{display:none}
.form-group{display:flex;flex-direction:column;gap:4px}
.form-group label{font-size:12px;color:#999}
.form-group input{padding:10px 12px;border:1px solid #3c3c3c;border-radius:4px;background:#1e1e1e;color:#ccc;font-size:14px;outline:none}
.form-group input:focus{border-color:#007acc}
.btn{padding:10px;border:none;border-radius:4px;font-size:14px;cursor:pointer;margin-top:6px}
.btn-primary{background:#007acc;color:#fff}.btn-primary:hover{background:#005a9e}
.error{background:#5a1d1d;border:1px solid #be1100;color:#f48771;padding:8px 12px;border-radius:4px;font-size:13px}.error.hidden{display:none}
.switch-link{text-align:center;font-size:13px;color:#888}.switch-link a{color:#007acc;text-decoration:none;cursor:pointer}

.layout{display:flex;flex-direction:column;height:100vh}
.toolbar{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#323233;border-bottom:1px solid #3c3c3c;min-height:36px}
.toolbar-left{display:flex;align-items:center;gap:8px}
.toolbar-right{display:flex;align-items:center;gap:8px}
.mode-switcher{display:flex;align-items:center;gap:4px;background:#3c3c3c;border-radius:4px;padding:2px}
.mode-btn{background:none;border:1px solid transparent;color:#999;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px}
.mode-btn.active{background:#007acc;color:#fff;border-color:#007acc}
.toolbar-btn{background:none;border:none;color:#ccc;padding:4px 8px;cursor:pointer;font-size:12px;border-radius:3px}
.toolbar-btn:hover{background:#3c3c3c}
.user-info{font-size:12px;color:#888}.user-info span{color:#ccc;font-weight:500}

.main-area{display:flex;flex:1;overflow:hidden}
.activity-bar{width:48px;background:#333;display:flex;flex-direction:column;align-items:center;padding-top:6px;gap:2px;z-index:10}
.activity-bar.hidden{display:none}
.act-btn{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:#858585;font-size:22px;cursor:pointer;border-radius:4px;position:relative}
.act-btn:hover{color:#ccc}.act-btn.active{color:#fff}.act-btn.active::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:2px;background:#fff;border-radius:1px}

.sidebar{width:260px;background:#252526;border-right:1px solid #3c3c3c;display:flex;flex-direction:column;overflow:hidden}
.sidebar.hidden{display:none}
.sidebar-header{padding:10px 12px;font-size:11px;text-transform:uppercase;color:#999;letter-spacing:.5px;border-bottom:1px solid #3c3c3c}
.sidebar-list{flex:1;overflow-y:auto;padding:4px 0}
.tree-item{padding:4px 12px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;white-space:nowrap;user-select:none}
.tree-item:hover{background:#37373d}
.tree-item.dir{color:#4daafc}.tree-item.file{color:#d4d4d4}
.tree-children{padding-left:16px}
.tree-children.hidden{display:none}

.editor-area{flex:1;display:flex;flex-direction:column;overflow:hidden}
.editor-tabs{height:36px;background:#2d2d2d;display:flex;align-items:center;padding:0 4px;border-bottom:1px solid #3c3c3c;gap:1px;overflow-x:auto}
.tab-item{padding:6px 12px;background:#2d2d2d;color:#999;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap;border-right:1px solid #3c3c3c;min-width:100px;max-width:200px}
.tab-item:hover{background:#37373d}
.tab-item.active{background:#1e1e1e;color:#fff}
.tab-item .tab-name{overflow:hidden;text-overflow:ellipsis;flex:1}
.tab-close{margin-left:4px;color:#888;cursor:pointer;font-size:14px;padding:0 2px}.tab-close:hover{color:#fff;background:#555;border-radius:3px}
.tab-plus{padding:4px 8px;color:#999;cursor:pointer;font-size:16px}.tab-plus:hover{color:#fff}

.editor-content{flex:1;overflow:auto;background:#1e1e1e;padding:16px;font-family:'Consolas','Courier New',monospace;font-size:14px;line-height:1.6;color:#d4d4d4;border:none;resize:none;outline:none;width:100%;height:100%}
.editor-content[readonly]{color:#888}

.view-tabs{display:flex;background:#2d2d2d;border-bottom:1px solid #3c3c3c}
.view-tab{background:none;border:none;color:#999;padding:7px 16px;cursor:pointer;font-size:12px;border-bottom:2px solid transparent}
.view-tab.active{color:#fff;border-bottom-color:#007acc}
.view-panel{flex:1;display:flex;flex-direction:column;overflow:hidden}.view-panel.hidden{display:none}

.chat-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.chat-msg{padding:8px 10px;border-radius:6px;font-size:13px;line-height:1.5;max-width:100%;word-break:break-word}
.chat-msg.user{background:#2a4a6b;color:#d4e8ff}.chat-msg.assistant{background:#2d2d2d;color:#d4d4d4;border:1px solid #3c3c3c}
.chat-empty{color:#666;text-align:center;margin-top:20px;font-size:13px}
.chat-input-area{display:flex;gap:6px;padding:10px 12px;border-top:1px solid #3c3c3c}
.chat-input{flex:1;background:#1e1e1e;color:#d4d4d4;border:1px solid #3c3c3c;border-radius:4px;padding:8px;font-size:13px;resize:none;outline:none;font-family:inherit}.chat-input:focus{border-color:#007acc}
.chat-send{background:#007acc;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px}.chat-send:disabled{background:#555;cursor:not-allowed}

.bottom-area{border-top:1px solid #3c3c3c;display:none}.bottom-area.open{display:block;height:200px}
.panel-tabs{display:flex;background:#2d2d2d;padding:0 8px}
.panel-tab{background:none;border:none;color:#999;padding:6px 12px;cursor:pointer;font-size:12px;border-bottom:2px solid transparent}
.panel-tab.active,.panel-tab:hover{color:#fff;border-bottom-color:#007acc}
.panel-content{height:168px;overflow:auto;padding:10px;font-family:'Consolas',monospace;font-size:13px}

.simple-right{flex:1;display:flex;flex-direction:column;overflow:hidden}
.save-btn{background:#007acc;color:#fff;border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px}.save-btn:disabled{background:#555;cursor:not-allowed}

.sash{position:relative;z-index:10;flex-shrink:0}
.sash-vertical{width:4px;cursor:col-resize}.sash-horizontal{height:4px;cursor:row-resize}
.sash-vertical:hover,.sash-vertical.active,.sash-horizontal:hover,.sash-horizontal.active{background:#007acc}

.statusbar{height:22px;background:#007acc;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:12px;color:#fff}
.statusbar-left,.statusbar-right{display:flex;align-items:center;gap:12px}
`;

// === LOGIN ===
function renderLogin() {
  app.innerHTML = `<style>${CSS}</style>
    <div class="login-container"><div class="login-box">
      <h1>AI Editor</h1><p class="subtitle">双模式智能编辑器</p>
      <div id="login-form" class="form">
        <div class="form-group"><label>用户名</label><input type="text" id="login-user" maxlength="32"></div>
        <div class="form-group"><label>密码</label><input type="password" id="login-pass" maxlength="128"></div>
        <div id="login-err" class="error hidden"></div>
        <button class="btn btn-primary" id="login-btn">登录</button>
        <p class="switch-link">还没有账户？<a id="show-reg">使用邀请码注册</a></p>
      </div>
      <div id="reg-form" class="form hidden">
        <div class="form-group"><label>邀请码</label><input type="text" id="reg-invite" maxlength="24"></div>
        <div class="form-group"><label>用户名</label><input type="text" id="reg-user" maxlength="32"></div>
        <div class="form-group"><label>密码</label><input type="password" id="reg-pass" maxlength="128"></div>
        <div id="reg-err" class="error hidden"></div>
        <button class="btn btn-primary" id="reg-btn">注册并登录</button>
        <p class="switch-link"><a id="show-login">返回登录</a></p>
      </div>
    </div></div>`;
  document.getElementById('login-btn').onclick = doLogin;
  document.getElementById('login-pass').onkeydown = e => { if (e.key==='Enter') doLogin(); };
  document.getElementById('reg-btn').onclick = doRegister;
  document.getElementById('show-reg').onclick = ()=>{document.getElementById('login-form').classList.add('hidden');document.getElementById('reg-form').classList.remove('hidden');};
  document.getElementById('show-login').onclick = ()=>{document.getElementById('reg-form').classList.add('hidden');document.getElementById('login-form').classList.remove('hidden');};
}

function showErr(id, msg) { var e=document.getElementById(id);if(e){e.textContent=msg;e.classList.remove('hidden');} }

async function doLogin() {
  var u=document.getElementById('login-user').value.trim(), p=document.getElementById('login-pass').value;
  if(!u||!p){showErr('login-err','请填写用户名和密码');return;}
  try{var r=await api.invoke('auth:login',{username:u,password:p});if(r.error){showErr('login-err',r.message);return}
  await api.invoke('auth:session-save',{accessToken:r.accessToken,user:r.user});currentUser=r.user;renderMain()}catch(e){showErr('login-err','服务器连接失败')}
}
async function doRegister() {
  var inv=document.getElementById('reg-invite').value.trim(),u=document.getElementById('reg-user').value.trim(),p=document.getElementById('reg-pass').value;
  if(!inv||!u||!p){showErr('reg-err','请填写所有字段');return}
  if(p.length<8||!/[a-zA-Z]/.test(p)||!/[0-9]/.test(p)){showErr('reg-err','密码至少8字符，须含字母和数字');return}
  try{var r=await api.invoke('auth:register',{invitationCode:inv,username:u,password:p});if(r.error){showErr('reg-err',r.message);return}
  await api.invoke('auth:session-save',{accessToken:r.accessToken,user:r.user});currentUser=r.user;renderMain()}catch(e){showErr('reg-err','服务器连接失败')}
}

// === FILE TREE ===
async function loadDir(dirPath) {
  if(fileTreeCache[dirPath]) return fileTreeCache[dirPath];
  try{var r=await api.invoke('fs:listdir',{dirPath});fileTreeCache[dirPath]=r.error?[]:r;}catch{fileTreeCache[dirPath]=[];}
  return fileTreeCache[dirPath];
}
function parseTreePath(path) { return path.replace(/\\/g,'/').replace(/\/+/g,'/'); }

function renderFileItem(entry, depth) {
  var ind = depth*16+8, cls = entry.isDirectory?'dir':'file';
  var expanded = treeExpanded[entry.path];
  var html = '<div class="tree-item '+cls+'" data-path="'+escAttr(entry.path)+'" data-isdir="'+entry.isDirectory+'" data-depth="'+depth+'" style="padding-left:'+ind+'px">';
  html += '<span>'+ (entry.isDirectory ? (expanded?'📂':'📁') : '📄') +'</span>';
  html += '<span>'+escHtml(entry.name)+'</span></div>';
  if(entry.isDirectory && expanded && fileTreeCache[entry.path]){
    html += '<div class="tree-children" id="children-'+escAttr(entry.path.replace(/[^a-zA-Z0-9]/g,'_'))+'">';
    var children = fileTreeCache[entry.path];
    for(var i=0;i<children.length;i++){ html += renderFileItem(children[i], depth+1); }
    html += '</div>';
  }else if(entry.isDirectory){
    html += '<div class="tree-children hidden" id="children-'+escAttr(entry.path.replace(/[^a-zA-Z0-9]/g,'_'))+'"></div>';
  }
  return html;
}

async function handleTreeClick(target) {
  var path = target.dataset.path, isDir = target.dataset.isdir === 'true', depth = parseInt(target.dataset.depth||'0');
  if(isDir){
    var childrenId = 'children-' + path.replace(/[^a-zA-Z0-9]/g,'_');
    var container = document.getElementById(childrenId);
    if(treeExpanded[path]){
      treeExpanded[path]=false;
      if(container) container.classList.add('hidden');
      var icon = target.querySelector('span');
      if(icon) icon.textContent = '📁';
    }else{
      treeExpanded[path]=true;
      var icon = target.querySelector('span');
      if(icon) icon.textContent = '📂';
      var entries = await loadDir(path);
      entries.sort((a,b)=>{if(a.isDirectory!==b.isDirectory)return a.isDirectory?-1:1;return a.name.localeCompare(b.name)});
      var html = '';
      for(var i=0;i<entries.length;i++){
        html += renderFileItem(entries[i], depth+1);
      }
      if(container){container.innerHTML=html;container.classList.remove('hidden');}
    }
  }else{
    openFile(path);
  }
}

// === EDITOR TABS ===
function renderEditorTabs() {
  var tabs = '';
  for(var i=0;i<openFiles.length;i++){
    var f=openFiles[i], name=f.path.split(/[\\/]/).pop(), active=f.path===activeFilePath;
    tabs += '<div class="tab-item'+(active?' active':'')+'" data-tab="file" data-path="'+escAttr(f.path)+'"><span class="tab-name">📄 '+escHtml(name)+'</span><span class="tab-close" data-path="'+escAttr(f.path)+'">&times;</span></div>';
  }
  if(aiTabOpen){
    tabs += '<div class="tab-item'+(activeFilePath===null&&aiTabOpen?' active':'')+'" data-tab="ai"><span class="tab-name">💬 AI 对话</span><span class="tab-close" data-tab="ai">&times;</span></div>';
  }
  if(!tabs) return '<span style="padding:0 8px;color:#888">打开文件或AI对话</span>';
  return tabs;
}

function renderEditorContent() {
  if(activeFilePath){
    return '<textarea class="editor-content" id="editor-text" placeholder="" style="width:100%;height:100%">'+escHtml(currentFile.content)+'</textarea>';
  }
  if(aiTabOpen){
    return renderChatPanelContent();
  }
  return '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888">选择文件或打开 AI 对话</div>';
}

function renderChatPanelContent() {
  return '<div class="chat-messages" id="chat-msgs"><div class="chat-empty">有问题随时问我</div></div>'+
    '<div class="chat-input-area"><textarea class="chat-input" id="chat-input" rows="2" placeholder="输入消息... (Enter发送)"></textarea><button class="chat-send" id="chat-send">发送</button></div>';
}

// === DEV MODE ===
function renderDevLayout(fileList) {
  return `
    <div class="activity-bar" id="activity-bar">
      <button class="act-btn ${activeSidebar==='explorer'?'active':''}" data-sidebar="explorer" title="资源管理器">📁</button>
      <button class="act-btn ${activeSidebar==='search'?'active':''}" data-sidebar="search" title="搜索">🔍</button>
      <button class="act-btn ${activeSidebar==='git'?'active':''}" data-sidebar="git" title="源代码管理">⎇</button>
      <button class="act-btn ${activeSidebar==='extensions'?'active':''}" data-sidebar="extensions" title="扩展">🧩</button>
      <div style="flex:1"></div>
      <button class="act-btn" data-sidebar="settings" title="设置">⚙</button>
    </div>
    <div class="sidebar ${activeSidebar!=='explorer'?'hidden':''}" id="sidebar-explorer">
      <div class="sidebar-header">资源管理器</div><div class="sidebar-list" id="explorer-list">${fileList}</div>
    </div>
    <div class="sidebar hidden" id="sidebar-search"><div class="sidebar-header">搜索</div><div style="padding:8px"><input type="text" placeholder="搜索文件..." style="width:100%;background:#1e1e1e;color:#ccc;border:1px solid #3c3c3c;padding:6px;border-radius:3px"></div></div>
    <div class="sidebar hidden" id="sidebar-git"><div class="sidebar-header">源代码管理</div><div style="padding:12px;color:#888;font-size:13px">暂无 Git 仓库</div></div>
    <div class="sidebar hidden" id="sidebar-extensions"><div class="sidebar-header">扩展</div><div style="padding:12px;color:#888;font-size:13px">扩展功能建设中...</div></div>
    <div class="editor-area">
      <div class="editor-tabs" id="editor-tabs">${renderEditorTabs()}</div>
      <div id="editor-panel" style="flex:1;overflow:hidden;display:flex;flex-direction:column">${renderEditorContent()}</div>
    </div>`;
}

// === SIMPLE MODE ===
function renderSimpleLayout(fileList) {
  return `
    <div class="sidebar" id="simple-sidebar"><div class="sidebar-header">文件</div><div class="sidebar-list" id="explorer-list">${fileList}</div></div>
    <div class="simple-right">
      <div class="view-tabs">
        <button class="view-tab ${simpleTab==='chat'?'active':''}" data-view="chat">AI 对话</button>
        <button class="view-tab ${simpleTab==='file'?'active':''}" data-view="file">${currentFile.path ? '📄 '+currentFile.path.split(/[\\/]/).pop() : '文件视图'}</button>
      </div>
      <div class="view-panel ${simpleTab==='chat'?'':'hidden'}" id="chat-view">${renderChatPanelContent()}</div>
      <div class="view-panel ${simpleTab==='file'?'':'hidden'}" id="file-panel" style="flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#2d2d2d;font-size:12px">
          <span id="simple-filename">${currentFile.path?currentFile.path.split(/[\\/]/).pop():'未打开文件'}</span>
          <button class="save-btn" id="simple-save" ${!currentFile.path?'disabled':''}>保存</button>
        </div>
        <textarea class="editor-content" id="simple-text" placeholder="点击左侧文件查看内容" style="flex:1" readonly>${escHtml(currentFile.content||'')}</textarea>
      </div>
    </div>`;
}

// === MAIN RENDER ===
async function renderMain() {
  try{var m=await api.invoke('mode:get');if(m&&m.mode)currentMode=m.mode;}catch{}
  var rootDir = 'D:/AI_prejoct/My_code';
  if(!fileTreeCache[rootDir]){
    var rootFiles = await loadDir(rootDir);
    fileTreeCache[rootDir] = rootFiles.sort((a,b)=>{if(a.isDirectory!==b.isDirectory)return a.isDirectory?-1:1;return a.name.localeCompare(b.name)});
  }
  var rootEntries = fileTreeCache[rootDir]||[];
  var fileList = '';
  for(var i=0;i<rootEntries.length;i++){
    fileList += renderFileItem(rootEntries[i], 0);
  }

  app.innerHTML = `<style>${CSS}</style>
    <div class="layout">
      <div class="toolbar">
        <div class="toolbar-left">
          <span style="font-weight:600;color:#fff;margin-right:12px">AI Editor</span>
          <div class="mode-switcher">
            <button class="mode-btn ${currentMode==='dev'?'active':''}" id="mode-dev">开发</button>
            <button class="mode-btn ${currentMode==='simple'?'active':''}" id="mode-simple">简约</button>
          </div>
          <button class="toolbar-btn" id="toggle-ai-btn">💬 AI对话</button>
        </div>
        <div class="toolbar-right">
          <span class="user-info">用户: <span>${currentUser?.username||''}</span></span>
          <button class="toolbar-btn" id="logout-btn">登出</button>
        </div>
      </div>
      <div class="main-area" id="main-area">
        ${currentMode==='dev'?renderDevLayout(fileList):renderSimpleLayout(fileList)}
      </div>
      <div class="bottom-area ${currentMode==='dev'&&terminalVisible?'open':''}" id="bottom-area">
        <div class="panel-tabs">
          <button class="panel-tab ${terminalVisible?'active':''}" id="tab-terminal">终端</button>
          <button class="panel-tab" id="tab-search">搜索</button>
        </div>
        <div class="panel-content" id="panel-content">${terminalVisible?'<span style="color:#4caf50">$ </span>':''}</div>
      </div>
      <div class="statusbar">
        <div class="statusbar-left"><span>⎇ main</span><span>行 1, 列 1</span></div>
        <div class="statusbar-right"><span>${currentMode==='dev'?'开发模式':'简约模式'}</span><span>UTF-8</span></div>
      </div>
    </div>`;

  bindToolbarEvents();
  bindLayoutEvents();
  initSashes();

  if(currentMode==='simple'&&currentFile.path){
    var st=document.getElementById('simple-text');
    if(st){st.value=currentFile.content;st.readOnly=false;}
  }
  setupTabDrag();
}

function bindToolbarEvents() {
  document.getElementById('mode-dev').onclick = ()=>switchMode('dev');
  document.getElementById('mode-simple').onclick = ()=>switchMode('simple');
  document.getElementById('logout-btn').onclick = doLogout;
  document.getElementById('tab-terminal').onclick = ()=>{terminalVisible=!terminalVisible;renderMain();};
  document.getElementById('tab-search').onclick = ()=>{/*searchVisible*/renderMain();};
  document.getElementById('toggle-ai-btn').onclick = toggleAiTab;
}

function toggleAiTab(){
  aiTabOpen = !aiTabOpen;
  renderMain();
}

function bindLayoutEvents() {
  // Activity bar
  document.querySelectorAll('.act-btn').forEach(btn=>{btn.addEventListener('click',function(){
    var s=this.dataset.sidebar;if(s==='settings')return;activeSidebar=s;
    document.querySelectorAll('.act-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');
    document.querySelectorAll('.sidebar').forEach(sb=>sb.classList.add('hidden'));
    var t=document.getElementById('sidebar-'+s);if(t)t.classList.remove('hidden');
  })});

  // Note: tree + tab events handled by global delegator (registered once at boot)

  // Simple mode view tabs
  document.querySelectorAll('.view-tab').forEach(tab=>{tab.addEventListener('click',function(){
    simpleTab=this.dataset.view;
    document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');
    document.querySelectorAll('.view-panel').forEach(p=>p.classList.add('hidden'));
    document.getElementById(simpleTab+'-view')?.classList.remove('hidden');
  })});

  // Chat bindings
  var cs = document.getElementById('chat-send'), ci = document.getElementById('chat-input');
  if(cs) cs.onclick = sendMessage;
  if(ci) ci.onkeydown = e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} };

  // Simple save
  var sb = document.getElementById('simple-save'), st = document.getElementById('simple-text');
  if(sb) sb.onclick = async ()=>{
    if(!currentFile.path)return;
    try{var r=await api.invoke('file:save',{filePath:currentFile.path,content:st.value});if(r.success){sb.disabled=true;currentFile.content=st.value;}}catch(e){alert('失败')}
  };
  if(st) st.oninput = ()=>{var b=document.getElementById('simple-save');if(b)b.disabled=false;};
}

// === FILE OPS ===
async function openFile(path) {
  try{
    var res = await api.invoke('file:open',{filePath:path});
    if(res.error){alert('无法打开文件: '+res.error);return}
    currentFile = { path, content: res.content };
    if(currentMode==='dev'){
      var ex = openFiles.find(f=>f.path===path);
      if(!ex) openFiles.push({path});
      activeFilePath = path;
    }else{ simpleTab='file'; }
    renderMain();
  }catch(e){alert('打开失败')}
}

// === AI CHAT ===
async function sendMessage() {
  var input=document.getElementById('chat-input'), msgs=document.getElementById('chat-msgs');
  if(!input||!msgs)return;
  var text=input.value.trim();if(!text)return;input.value='';
  var btn=document.getElementById('chat-send');if(btn)btn.disabled=true;
  msgs.querySelector('.chat-empty')?.remove();
  msgs.innerHTML+='<div class="chat-msg user">'+escHtml(text)+'</div>';
  var aiDiv=document.createElement('div');aiDiv.className='chat-msg assistant';aiDiv.id='ai-stream';msgs.appendChild(aiDiv);
  msgs.scrollTop=msgs.scrollHeight;
  api.on('chat:chunk',(chunk)=>{var d=document.getElementById('ai-stream');if(d&&chunk){if(chunk.done)d.removeAttribute('id');else d.textContent+=chunk.chunk||'';msgs.scrollTop=msgs.scrollHeight;}});
  try{await api.invoke('chat:send',{message:text});}catch(e){var d=document.getElementById('ai-stream');if(d)d.textContent='错误: '+e.message;}
  api.removeAllListeners('chat:chunk');if(btn)btn.disabled=false;
}

// === SASH SYSTEM ===
function initSashes() {
  document.querySelectorAll('.sash').forEach(s=>s.remove());
  var ma=document.getElementById('main-area');if(!ma)return;
  if(currentMode==='dev'){
    var sb=ma.querySelector('.sidebar:not(.hidden)');if(sb){var s=makeSash('sash-sidebar','v');sb.after(s);makeDraggable(s,sb,170,500,1);}
  }else{
    var sb=ma.querySelector('.sidebar');var r=ma.querySelector('.simple-right');if(sb&&r){var s=makeSash('sash-sidebar','v');sb.after(s);makeDraggable(s,sb,160,400,1);}
  }
  var bt=document.getElementById('bottom-area');if(bt&&currentMode==='dev'){var s=makeSash('sash-bottom','h');bt.before(s);makeDraggable(s,bt,80,500,-1);}
}
function makeSash(id,dir){var s=document.createElement('div');s.className='sash sash-'+(dir==='v'?'vertical':'horizontal');s.id=id;s.style[dir==='v'?'width':'height']='4px';return s;}
function makeDraggable(sash,target,min,max,inv){var start,base,active=false,isH=sash.classList.contains('sash-horizontal');
  sash.addEventListener('mousedown',e=>{e.preventDefault();active=true;start=isH?e.clientY:e.clientX;base=parseInt(getComputedStyle(target)[isH?'height':'width']);sash.classList.add('active');document.body.style.cursor=sash.style.cursor;document.body.style.userSelect='none'});
  document.addEventListener('mousemove',e=>{if(!active)return;var d=(isH?e.clientY:e.clientX)-start;target.style[isH?'height':'width']=Math.max(min,Math.min(max,base+d*inv))+'px'});
  document.addEventListener('mouseup',()=>{if(!active)return;active=false;sash.classList.remove('active');document.body.style.cursor='';document.body.style.userSelect=''});}

// === SWITCH ===
async function switchMode(mode){currentMode=mode;if(mode==='simple')simpleTab='chat';await api.invoke('mode:save-pref',{mode});renderMain();}
async function doLogout(){try{await api.invoke('auth:session-save',{accessToken:'',user:null})}catch(e){}currentUser=null;renderLogin();}

function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return String(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');}

// === TAB DRAG & DROP ===
function setupTabDrag() {
  var tabs = document.querySelectorAll('#editor-tabs .tab-item[data-tab="file"]');
  tabs.forEach(function(tab) {
    tab.setAttribute('draggable', 'true');
    tab.addEventListener('dragstart', function(e) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tab.dataset.path);
      tab.style.opacity = '0.5';
    });
    tab.addEventListener('dragend', function() { tab.style.opacity = '1'; });
    tab.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    tab.addEventListener('drop', function(e) {
      e.preventDefault();
      var from = e.dataTransfer.getData('text/plain');
      var to = tab.dataset.path;
      if (from && to && from !== to) {
        var fi = -1, ti = -1;
        for (var i = 0; i < openFiles.length; i++) {
          if (openFiles[i].path === from) fi = i;
          if (openFiles[i].path === to) ti = i;
        }
        if (fi >= 0 && ti >= 0) {
          var item = openFiles.splice(fi, 1)[0];
          openFiles.splice(ti, 0, item);
          renderMain();
        }
      }
    });
  });
}

// === GLOBAL EVENT DELEGATOR (survives DOM rebuilds) ===
document.addEventListener('click', function(e) {
  var item = e.target.closest('.tree-item');
  if (item) { e.preventDefault(); handleTreeClick(item); return; }

  var closeBtn = e.target.closest('.tab-close');
  if (closeBtn) {
    e.stopPropagation();
    var p = closeBtn.dataset.path, t = closeBtn.dataset.tab;
    if (t === 'ai') { aiTabOpen = false; if (activeFilePath === null) activeFilePath = openFiles.length > 0 ? openFiles[openFiles.length - 1].path : null; }
    else if (p) { openFiles = openFiles.filter(function(f) { return f.path !== p; }); if (activeFilePath === p) activeFilePath = openFiles.length > 0 ? openFiles[openFiles.length - 1].path : null; if (!activeFilePath) currentFile = { path: null, content: '' }; }
    renderMain(); return;
  }

  var tab = e.target.closest('.tab-item');
  if (tab) {
    var tp = tab.dataset.path, tt = tab.dataset.tab;
    if (tt === 'ai') { activeFilePath = null; aiTabOpen = true; }
    else if (tp) { activeFilePath = tp; }
    renderMain(); return;
  }
});

// === BOOT ===
(function boot(){
  var safety = setTimeout(function(){ if(document.getElementById('loading')) renderLogin(); }, 3000);
  api.invoke('auth:session-restored').then(function(session){
    clearTimeout(safety);
    if(session&&session.restored){currentUser=session.user;renderMain();}else{renderLogin();}
  }).catch(function(){clearTimeout(safety);renderLogin();});
})();
