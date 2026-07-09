import { ipcMain, BrowserWindow } from 'electron';
import { openFile, saveFile } from './file-service';
import { sendToCodex } from './codex-proxy-bridge';

let mainWindowGetter: () => BrowserWindow | null = () => null;

export function setMainWindowGetter(fn: () => BrowserWindow | null): void {
  mainWindowGetter = fn;
}

export function registerAllHandlers(): void {
  ipcMain.handle('mode:switch', async (_event, args: { mode: string }) => {
    if (args.mode !== 'dev' && args.mode !== 'simple') {
      return { success: false, mode: args.mode };
    }
    return { success: true, mode: args.mode };
  });

  ipcMain.handle('file:open', async (_event, args: { filePath: string }) => {
    try {
      const result = openFile(args.filePath);
      return result;
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

  ipcMain.handle('file:save', async (_event, args: { filePath: string; content: string }) => {
    try {
      saveFile(args.filePath, args.content);
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('auth:login', async (_event, args: { username: string; password: string }) => {
    try {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      return await res.json();
    } catch (e) {
      return { error: 'server_error', message: (e as Error).message };
    }
  });

  ipcMain.handle('auth:register', async (_event, args: { invitationCode: string; username: string; password: string }) => {
    try {
      const res = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      return await res.json();
    } catch (e) {
      return { error: 'server_error', message: (e as Error).message };
    }
  });

  // T067: chat:send with SSE streaming via ipcMain event emitter
  ipcMain.handle('chat:send', async (_event, args: { message: string; conversationId?: string; contextFiles?: string[] }) => {
    const win = mainWindowGetter();
    try {
      let conversationId = '';
      await sendToCodex(
        { message: args.message, conversationId: args.conversationId, contextFiles: args.contextFiles },
        (chunk) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('chat:chunk', {
              conversationId: conversationId,
              chunk: chunk.chunk,
              done: chunk.done,
            });
          }
        },
      ).then((cid) => {
        conversationId = cid;
      });
      return { conversationId };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

  ipcMain.handle('chat:open-file', async (_event, args: { filePath: string; openInMode: string }) => {
    try {
      const result = openFile(args.filePath);
      return { ...result, openInMode: args.openInMode };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

  ipcMain.handle('update:check', async () => {
    try {
      const res = await fetch('http://localhost:3001/api/update/check');
      return await res.json();
    } catch {
      return { hasUpdate: false };
    }
  });
}
