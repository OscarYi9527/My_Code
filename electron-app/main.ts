import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';

let mainWindow: BrowserWindow | null = null;

// ============================================================
// File Service (inline to avoid cross-package electron mismatch)
// ============================================================
function openFile(filePath: string) {
  const content = readFileSync(filePath, 'utf-8');
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || 'untitled';
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  return { content, fileName, language: ext };
}

function saveFile(filePath: string, content: string) { writeFileSync(filePath, content, 'utf-8'); }

// ============================================================
// IPC Handlers (inline — no ../app/ imports)
// ============================================================
function registerAllHandlers() {
  ipcMain.handle('mode:switch', async (_e, args: { mode: string }) => {
    return { success: args.mode === 'dev' || args.mode === 'simple', mode: args.mode };
  });

  ipcMain.handle('file:open', async (_e, args: { filePath: string }) => {
    try { return openFile(args.filePath); } catch (e) { return { error: (e as Error).message }; }
  });

  ipcMain.handle('file:save', async (_e, args: { filePath: string; content: string }) => {
    try { saveFile(args.filePath, args.content); return { success: true }; } catch (e) { return { success: false, error: (e as Error).message }; }
  });

  ipcMain.handle('fs:listdir', async (_e, args: { dirPath: string }) => {
    try {
      const entries = readdirSync(args.dirPath, { withFileTypes: true });
      return entries.map(d => ({ name: d.name, isDirectory: d.isDirectory(), path: join(args.dirPath, d.name) }));
    } catch (e) { return { error: (e as Error).message }; }
  });

  ipcMain.handle('fs:getcwd', async () => ({ cwd: process.cwd() }));

  ipcMain.handle('auth:login', async (_e, args: { username: string; password: string }) => {
    try {
      const res = await fetch('http://localhost:3001/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      return await res.json();
    } catch (e) { return { error: 'server_error', message: (e as Error).message }; }
  });

  ipcMain.handle('auth:register', async (_e, args: { invitationCode: string; username: string; password: string }) => {
    try {
      const res = await fetch('http://localhost:3001/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      return await res.json();
    } catch (e) { return { error: 'server_error', message: (e as Error).message }; }
  });

  ipcMain.handle('auth:session-restored', async () => {
    try {
      const tokenPath = join(app.getPath('userData'), 'session.json');
      if (existsSync(tokenPath)) {
        const data = JSON.parse(readFileSync(tokenPath, 'utf-8'));
        if (data.accessToken) {
          const res = await fetch('http://localhost:3001/api/auth/me', { headers: { Authorization: `Bearer ${data.accessToken}` } });
          if (res.ok) return { restored: true, user: await res.json() };
        }
      }
    } catch { /* no session */ }
    return { restored: false };
  });

  ipcMain.handle('auth:session-save', async (_e, args: { accessToken: string; user: unknown }) => {
    writeFileSync(join(app.getPath('userData'), 'session.json'), JSON.stringify(args));
  });

  ipcMain.handle('mode:get', async () => {
    try { return JSON.parse(readFileSync(join(app.getPath('userData'), 'preferences.json'), 'utf-8')); } catch { return { mode: 'dev' }; }
  });

  ipcMain.handle('mode:save-pref', async (_e, args: { mode: string }) => {
    writeFileSync(join(app.getPath('userData'), 'preferences.json'), JSON.stringify(args));
    return { success: true };
  });

  ipcMain.handle('chat:send', async (_e, args: { message: string; conversationId?: string }) => {
    try {
      const res = await fetch('http://localhost:3000/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content: args.message }], stream: true }),
      });
      if (!res.ok) throw new Error(`Claude proxy returned ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let cid = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.type === 'content_block_delta' && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('chat:chunk', { conversationId: cid, chunk: json.delta?.text || '', done: false });
              }
              if (json.conversation_id) cid = json.conversation_id;
            } catch { /* skip */ }
          }
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('chat:chunk', { conversationId: cid, chunk: '', done: true });
      return { conversationId: cid };
    } catch (e) { return { error: (e as Error).message }; }
  });

  ipcMain.handle('update:check', async () => {
    try { return await (await fetch('http://localhost:3001/api/update/check')).json(); } catch { return { hasUpdate: false }; }
  });
}

// ============================================================
// Window
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 800, minHeight: 600, title: 'AI Editor', webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.openDevTools({ mode: 'bottom' });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerAllHandlers();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
