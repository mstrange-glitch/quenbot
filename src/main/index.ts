import { app, ipcMain, BrowserWindow, session, net, clipboard } from 'electron';
import { readdir, stat, readFile, appendFile, writeFile, unlink, rename as fsRename, mkdir } from 'fs/promises';
import { join, dirname, extname, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, createWriteStream } from 'fs';
import { createTray } from './tray';
import { createMainWindow, getMainWindow, setOnWidgetClosed, setAlwaysOnTop, setMiniMode, showWidgetPreview, hideWidgetPreview, updateWidgetPreview } from './windows';
import { ensureRecordingsDir, getRecordingsDir, saveRecording } from './audio-saver';
import { initShortcuts, stopShortcuts, setStealthCallbacks, loadHotkeyConfig, resetRecordingState, setQuickNoteCallback, setTranscribeCallbacks } from './shortcuts';
import * as notesStore from './notes-store';
import * as feedStore from './feed-store';
import * as chipStore from './chip-store';
import * as lanSync from './lan-sync';

const isDev = process.env.NODE_ENV === 'development';
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const logFile = join(app.getPath('userData'), 'quenbot.log');

async function log(msg: string): Promise<void> {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  try { await appendFile(logFile, line); } catch { /* ignore */ }
}

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT: ${err.message}\n${err.stack}`);
});
process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason}`);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  const mainWin = getMainWindow();
  if (mainWin) {
    mainWin.show();
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
});

// Stealth recording
let stealthWindow: BrowserWindow | null = null;

function startStealthRecording(): void {
  stealthWindow = new BrowserWindow({
    width: 1, height: 1, show: false, skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (isDev && rendererUrl) {
    stealthWindow.loadURL(`${rendererUrl}/widget/index.html`);
  } else {
    stealthWindow.loadFile(join(__dirname, '..', 'renderer', 'widget', 'index.html'));
  }
  stealthWindow.webContents.once('did-finish-load', () => {
    stealthWindow!.webContents.send('set-widget-mode', 'stealth');
    stealthWindow!.webContents.send('start-recording', 'stealth');
  });
  stealthWindow.on('closed', () => { stealthWindow = null; });
}

function stopStealthRecording(): void {
  if (!stealthWindow || stealthWindow.isDestroyed()) return;
  const win = stealthWindow;
  const cleanup = (): void => {
    ipcMain.removeListener('save-complete', onSaveComplete);
    clearTimeout(fallback);
    if (!win.isDestroyed()) win.close();
  };
  const onSaveComplete = (event: Electron.IpcMainEvent): void => {
    if (event.sender === win.webContents) cleanup();
  };
  ipcMain.on('save-complete', onSaveComplete);
  win.webContents.send('stop-recording');
  const fallback = setTimeout(cleanup, 15000);
}

// Push-to-transcribe (Handy-style)
let transcribeWindow: BrowserWindow | null = null;

function startTranscription(): void {
  transcribeWindow = new BrowserWindow({
    width: 200, height: 44,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, show: false,
    x: 100, y: 100,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Position bottom-center of primary display
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  transcribeWindow.setPosition(Math.round(screenW / 2 - 100), screenH - 80);

  if (isDev && rendererUrl) {
    transcribeWindow.loadURL(`${rendererUrl}/widget/index.html`);
  } else {
    transcribeWindow.loadFile(join(__dirname, '..', 'renderer', 'widget', 'index.html'));
  }

  transcribeWindow.once('ready-to-show', () => {
    transcribeWindow!.show();
    transcribeWindow!.webContents.send('set-widget-mode', 'transcribe');
    transcribeWindow!.webContents.send('start-transcription');
  });

  transcribeWindow.on('closed', () => { transcribeWindow = null; });
}

function stopTranscription(): void {
  if (!transcribeWindow || transcribeWindow.isDestroyed()) return;
  const win = transcribeWindow;

  const cleanup = (): void => {
    ipcMain.removeListener('transcription-result', onResult);
    clearTimeout(fallback);
    if (!win.isDestroyed()) win.close();
  };

  const onResult = (_event: Electron.IpcMainEvent, text: string): void => {
    if (text && text.trim()) {
      clipboard.writeText(text.trim());
      log(`VTT to clipboard: "${text.trim().substring(0, 80)}"`);

      // Simulate Ctrl+V paste via PowerShell
      try {
        const { execSync } = require('child_process');
        execSync('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 200; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"', {
          windowsHide: true,
          timeout: 3000,
        });
      } catch { /* paste simulation failed, text is still on clipboard */ }
    }
    cleanup();
  };

  ipcMain.once('transcription-result', onResult);
  win.webContents.send('stop-transcription');
  const fallback = setTimeout(cleanup, 30000);
}

// Settings
const settingsPath = join(app.getPath('userData'), 'settings.json');

function loadSettings(): Record<string, unknown> {
  try {
    if (existsSync(settingsPath)) {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  await writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

// Show JOT tab helper
function showJotTab(): void {
  const mainWin = getMainWindow();
  if (!mainWin) {
    const win = createMainWindow();
    win.once('ready-to-show', () => {
      win.webContents.send('show-jot-tab');
    });
  } else {
    mainWin.show();
    mainWin.focus();
    mainWin.webContents.send('show-jot-tab');
  }
}

function registerIPC(): void {
  // Audio save
  ipcMain.handle('save-audio', async (_event, audioData: ArrayBuffer, sampleRate: number, channels: number) => {
    try {
      const filepath = await saveRecording(audioData, sampleRate, channels);
      await log(`Recording saved: ${filepath}`);
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('recordings-updated');
      }
      // Add to feed
      const name = filepath.split(/[/\\]/).pop() || 'Recording';
      const recStat = await stat(filepath);
      feedStore.addItem({ type: 'recording', title: name, preview: '', refId: filepath, size: recStat.size });
      return filepath;
    } catch (err) {
      await log(`Failed to save: ${err}`);
      throw err;
    }
  });

  ipcMain.handle('get-recordings', async () => {
    const dir = getRecordingsDir();
    try {
      const files = await readdir(dir);
      const wavFiles = files.filter(f => f.endsWith('.wav'));
      const recordings = await Promise.all(
        wavFiles.map(async (name) => {
          const filepath = join(dir, name);
          const fileStat = await stat(filepath);
          return { name, path: filepath, size: fileStat.size, date: fileStat.mtime.toISOString() };
        })
      );
      recordings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return recordings;
    } catch { return []; }
  });

  ipcMain.handle('read-audio-file', async (_event, filepath: string) => {
    const buffer = await readFile(filepath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  ipcMain.handle('get-widget-mode', () => 'push');

  ipcMain.handle('hide-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.hide();
  });

  ipcMain.handle('minimize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.hide();
  });

  ipcMain.handle('get-audio-devices', async () => null);

  ipcMain.handle('set-always-on-top', (_event, value: boolean) => {
    setAlwaysOnTop(value);
  });

  ipcMain.handle('set-mini-mode', (_event, mini: boolean) => {
    setMiniMode(mini);
  });

  ipcMain.handle('show-widget-preview', () => {
    showWidgetPreview();
  });

  ipcMain.handle('hide-widget-preview', () => {
    hideWidgetPreview();
  });

  ipcMain.handle('update-widget-preview', (_event, scale: number, position: string) => {
    updateWidgetPreview(scale, position);
  });

  ipcMain.handle('get-settings', () => loadSettings());

  ipcMain.handle('save-settings', async (_event, patch: Record<string, unknown>) => {
    // Merge into existing settings: undefined keeps the stored value, null removes the key.
    const merged: Record<string, unknown> = { ...loadSettings() };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    await saveSettings(merged);
    if (merged.hotkeys) {
      loadHotkeyConfig(merged.hotkeys as any);
    }
    return true;
  });

  ipcMain.handle('delete-recording', async (_event, filepath: string) => {
    const recDir = getRecordingsDir();
    if (!resolve(filepath).toLowerCase().startsWith(resolve(recDir).toLowerCase())) {
      throw new Error('Invalid file path');
    }
    await unlink(filepath);
    await log(`Recording deleted: ${filepath}`);
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('recordings-updated');
    return true;
  });

  ipcMain.handle('rename-recording', async (_event, oldPath: string, newName: string) => {
    const recDir = getRecordingsDir();
    if (!resolve(oldPath).toLowerCase().startsWith(resolve(recDir).toLowerCase())) {
      throw new Error('Invalid file path');
    }
    const ext = extname(newName) === '.wav' ? '' : '.wav';
    const newPath = join(dirname(oldPath), newName + ext);
    if (existsSync(newPath)) throw new Error('A recording with that name already exists');
    await fsRename(oldPath, newPath);
    await log(`Recording renamed: ${oldPath} -> ${newPath}`);
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('recordings-updated');
    return newPath;
  });

  // Notes
  ipcMain.handle('get-notes', () => notesStore.getAll());
  ipcMain.handle('save-note', async (_event, note: any, isNew?: boolean) => {
    notesStore.save(note);
    
    const title = note.title || 'Untitled note';
    const preview = (note.content || '').replace(/<[^>]*>/g, '').substring(0, 80);

    if (isNew) {
      feedStore.addItem({ type: 'note', title, preview, refId: note.id });
    } else {
      const updated = feedStore.updateItemByRefId('note', note.id, { title, preview });
      if (!updated) {
        feedStore.addItem({ type: 'note', title, preview, refId: note.id });
      }
    }
    
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('notes-updated');
  });
  ipcMain.handle('delete-note', async (_event, id: string) => {
    notesStore.remove(id);
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('notes-updated');
  });
  ipcMain.handle('reorder-notes', async (_event, ids: string[]) => {
    notesStore.reorder(ids);
  });

  // Feed
  ipcMain.handle('get-feed', (_event, limit?: number, before?: string, filter?: string, sortBy?: string) => {
    return feedStore.getItems(limit, before, filter, sortBy);
  });

  ipcMain.handle('delete-feed-item', async (_event, id: string) => {
    feedStore.removeItem(id);
    return true;
  });

  ipcMain.handle('clear-feed', async () => {
    feedStore.clearAll();
    return true;
  });

  ipcMain.handle('export-feed-item', async (_event, item: any, format: 'md' | 'txt') => {
    return feedStore.exportItemAsFile(item, format);
  });

  ipcMain.handle('open-feed-item-file', async (_event, refId: string) => {
    return feedStore.openItemFile(refId);
  });

  // Chips
  ipcMain.handle('get-chips', () => chipStore.getAll());
  ipcMain.handle('add-chip', (_event, name: string, color: string) => chipStore.add(name, color));
  ipcMain.handle('remove-chip', (_event, id: string) => { chipStore.remove(id); return true; });
  ipcMain.handle('update-chip', (_event, id: string, name: string, color: string) => { chipStore.update(id, name, color); return true; });

  // LAN Sync
  ipcMain.handle('get-sync-peers', () => lanSync.getPeers());

  ipcMain.handle('send-note-to-peer', async (_event, address: string, port: number, note: any) => {
    return lanSync.sendNoteToPeer({ name: '', address, port, lastSeen: 0 }, note);
  });

  ipcMain.handle('start-lan-sync', (_event, name: string, port?: number) => {
    if (lanSync.isRunning()) lanSync.stop();
    lanSync.start({
      name,
      port,
      onNote: (note, fromName) => {
        // Save incoming note
        notesStore.save(note);
        // Add to feed
        const title = note.title || 'Untitled note';
        const preview = (note.content || '').replace(/<[^>]*>/g, '').substring(0, 80);
        feedStore.addItem({ type: 'note', title: `[${fromName}] ${title}`, preview, refId: note.id });
        // Notify renderer
        const mainWin = getMainWindow();
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('note-received', { note, from: fromName });
          mainWin.webContents.send('notes-updated');
        }
        log(`Note received from ${fromName}: "${title}"`);
      },
      onPeers: (peers) => {
        const mainWin = getMainWindow();
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('sync-peers-changed', peers);
        }
      },
      log: (msg) => log(`[LAN] ${msg}`),
    });
  });

  ipcMain.handle('stop-lan-sync', () => {
    lanSync.stop();
  });

  // Show JOT tab
  ipcMain.handle('show-jot', () => {
    showJotTab();
  });

  // Transcription via Python onnx-asr
  // Persistent Python VTT daemon — model loads once, stays in memory
  const vttDaemonPath = join(app.getPath('userData'), 'vtt_daemon.py');
  const { spawn } = require('child_process');
  let vttProcess: any = null;
  let vttReady = false;
  let vttPending: { resolve: (text: string) => void; reject: (err: Error) => void } | null = null;

  const vttDaemonScript = `
import onnx_asr, wave, numpy as np, sys, json, os
sys.stdout.reconfigure(line_buffering=True)
print(json.dumps({"status": "loading"}), flush=True)
model = onnx_asr.load_model("istupakov/parakeet-tdt-0.6b-v3-onnx", quantization="int8")
print(json.dumps({"status": "ready"}), flush=True)
while True:
    try:
        line = input()
        req = json.loads(line)
        wav_path = req["wav"]
        wf = wave.open(wav_path, "rb")
        sr = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
        wf.close()
        samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        result = model.recognize(samples, sample_rate=sr)
        print(json.dumps({"text": result}), flush=True)
        try: os.unlink(wav_path)
        except: pass
    except EOFError:
        break
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
`.trim();
  try { writeFileSync(vttDaemonPath, vttDaemonScript); } catch {}

  function startVttDaemon(): void {
    if (vttProcess) return;
    vttReady = false;
    vttProcess = spawn('python', [vttDaemonPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let buffer = '';
    vttProcess.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.status === 'ready') {
            vttReady = true;
            log('VTT daemon ready (model loaded)');
          } else if (msg.status === 'loading') {
            log('VTT daemon loading model...');
          } else if (msg.text !== undefined && vttPending) {
            vttPending.resolve(msg.text || '');
            vttPending = null;
          } else if (msg.error && vttPending) {
            vttPending.reject(new Error(msg.error));
            vttPending = null;
          }
        } catch { /* ignore parse errors */ }
      }
    });

    vttProcess.stderr.on('data', (data: Buffer) => {
      // Ignore stderr noise from model loading
    });

    vttProcess.on('exit', () => {
      vttProcess = null;
      vttReady = false;
      if (vttPending) {
        vttPending.reject(new Error('VTT daemon exited'));
        vttPending = null;
      }
    });
  }

  // Start daemon on app launch so model is pre-loaded
  startVttDaemon();

  ipcMain.handle('transcribe-audio', async (_event, audioData: ArrayBuffer, sampleRate: number) => {
    const os = require('os');
    const tempWav = join(os.tmpdir(), `quenbot_vtt_${Date.now()}.wav`);

    // Encode as WAV
    const samples = new Float32Array(audioData);
    const bytesPerSample = 2;
    const dataSize = samples.length * bytesPerSample;
    const wavBuf = Buffer.alloc(44 + dataSize);
    wavBuf.write('RIFF', 0);
    wavBuf.writeUInt32LE(36 + dataSize, 4);
    wavBuf.write('WAVE', 8);
    wavBuf.write('fmt ', 12);
    wavBuf.writeUInt32LE(16, 16);
    wavBuf.writeUInt16LE(1, 20);
    wavBuf.writeUInt16LE(1, 22);
    wavBuf.writeUInt32LE(sampleRate, 24);
    wavBuf.writeUInt32LE(sampleRate * 2, 28);
    wavBuf.writeUInt16LE(2, 32);
    wavBuf.writeUInt16LE(16, 34);
    wavBuf.write('data', 36);
    wavBuf.writeUInt32LE(dataSize, 40);
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      wavBuf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7FFF), offset);
      offset += 2;
    }
    writeFileSync(tempWav, wavBuf);

    // Ensure daemon is running
    if (!vttProcess) startVttDaemon();

    // Wait for daemon to be ready (max 30s)
    if (!vttReady) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => { if (vttReady) { clearInterval(check); resolve(); } }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 30000);
      });
    }

    if (!vttProcess || !vttReady) {
      throw new Error('VTT daemon not available');
    }

    return new Promise<string>((resolve, reject) => {
      vttPending = { resolve, reject };
      vttProcess.stdin.write(JSON.stringify({ wav: tempWav }) + '\n');
      // Timeout after 15s
      setTimeout(() => {
        if (vttPending) {
          vttPending.reject(new Error('Transcription timeout'));
          vttPending = null;
        }
      }, 15000);
    });
  });

  // Model management — Parakeet TDT v3 0.6B INT8
  const modelsDir = join(app.getPath('userData'), 'models');
  const MODEL_FILES = [
    { name: 'encoder-model.int8.onnx', minSize: 100_000_000 },
    { name: 'decoder_joint-model.int8.onnx', minSize: 1_000_000 },
    { name: 'nemo128.onnx', minSize: 10_000 },
    { name: 'vocab.txt', minSize: 1_000 },
  ];

  ipcMain.handle('get-model-status', async () => {
    for (const mf of MODEL_FILES) {
      const fp = join(modelsDir, mf.name);
      if (!existsSync(fp)) return { status: 'not-installed', path: '' };
      try {
        const s = await stat(fp);
        if (s.size < mf.minSize) {
          try { await unlink(fp); } catch { /* ignore */ }
          return { status: 'not-installed', path: '' };
        }
      } catch {
        return { status: 'error', path: fp, message: `Cannot read ${mf.name}` };
      }
    }
    return { status: 'installed', path: modelsDir };
  });

  ipcMain.handle('get-hostname', () => {
    const os = require('os');
    return os.hostname();
  });

  ipcMain.handle('download-model', async () => {
    if (!existsSync(modelsDir)) {
      await mkdir(modelsDir, { recursive: true });
    }

    const baseUrl = 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main';
    const files = [
      { name: 'encoder-model.int8.onnx', url: `${baseUrl}/encoder-model.int8.onnx` },
      { name: 'decoder_joint-model.int8.onnx', url: `${baseUrl}/decoder_joint-model.int8.onnx` },
      { name: 'nemo128.onnx', url: `${baseUrl}/nemo128.onnx` },
      { name: 'vocab.txt', url: `${baseUrl}/vocab.txt` },
    ];

    const https = require('https');
    const http = require('http');

    const downloadFile = (fileUrl: string, destPath: string): Promise<void> => {
      return new Promise((res, rej) => {
        const dl = (url: string, redir = 0): void => {
          if (redir > 5) { rej(new Error('Too many redirects')); return; }
          const client = url.startsWith('https') ? https : http;
          client.get(url, (response: any) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              response.resume();
              // Resolve relative redirect URLs against the original
              let redirectUrl = response.headers.location;
              if (!redirectUrl.startsWith('http')) {
                const parsed = new (require('url').URL)(url);
                redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
              }
              dl(redirectUrl, redir + 1);
              return;
            }
            if (response.statusCode !== 200) {
              response.resume();
              rej(new Error(`HTTP ${response.statusCode}`));
              return;
            }
            const total = parseInt(response.headers['content-length'] || '0', 10);
            let downloaded = 0;
            const fs = createWriteStream(destPath);
            response.on('data', (chunk: Buffer) => {
              downloaded += chunk.length;
              fs.write(chunk);
              const mainWin = getMainWindow();
              if (mainWin && !mainWin.isDestroyed()) {
                mainWin.webContents.send('model-download-progress', {
                  downloaded, total,
                  percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
                });
              }
            });
            response.on('end', () => { fs.end(() => res()); });
            response.on('error', (err: Error) => { fs.end(); rej(err); });
          }).on('error', (err: Error) => rej(err));
        };
        dl(fileUrl);
      });
    };

    // Known approximate sizes for progress calculation (INT8 model)
    const fileSizes: Record<string, number> = {
      'encoder-model.int8.onnx': 652_000_000,
      'decoder_joint-model.int8.onnx': 18_200_000,
      'nemo128.onnx': 140_000,
      'vocab.txt': 94_000,
    };
    const totalAllFiles = Object.values(fileSizes).reduce((a, b) => a + b, 0);
    let completedBytes = 0;

    for (const f of files) {
      await log(`Downloading ${f.name}...`);

      // Send file name progress
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('model-download-progress', {
          downloaded: completedBytes,
          total: totalAllFiles,
          percent: Math.round((completedBytes / totalAllFiles) * 100),
          currentFile: f.name,
        });
      }

      await downloadFile(f.url, join(modelsDir, f.name));
      completedBytes += fileSizes[f.name] || 0;
      await log(`Downloaded ${f.name}`);
    }

    return modelsDir;
  });
}

app.whenReady().then(async () => {
  await log('QUENbot starting...');

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  await ensureRecordingsDir();
  notesStore.init();
  chipStore.init();
  feedStore.init();
  registerIPC();
  createTray();
  await log('Tray created');

  setStealthCallbacks(startStealthRecording, stopStealthRecording);
  setOnWidgetClosed(resetRecordingState);
  setQuickNoteCallback(showJotTab);
  setTranscribeCallbacks(startTranscription, stopTranscription);

  const settings = loadSettings();
  if (settings.hotkeys) loadHotkeyConfig(settings.hotkeys as any);

  // Auto-start LAN sync if enabled
  if (settings.syncEnabled) {
    const os = require('os');
    const syncName = settings.deviceName || os.hostname() || 'QUENbot';
    try {
      lanSync.start({
        name: syncName as string,
        port: (settings.syncPort as number) || undefined,
        onNote: (note, fromName) => {
          notesStore.save(note);
          const title = note.title || 'Untitled note';
          const preview = (note.content || '').replace(/<[^>]*>/g, '').substring(0, 80);
          feedStore.addItem({ type: 'note', title: `[${fromName}] ${title}`, preview, refId: note.id });
          const mainWin = getMainWindow();
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('note-received', { note, from: fromName });
            mainWin.webContents.send('notes-updated');
          }
          log(`Note received from ${fromName}: "${title}"`);
        },
        onPeers: (peers) => {
          const mainWin = getMainWindow();
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('sync-peers-changed', peers);
          }
        },
        log: (msg) => log(`[LAN] ${msg}`),
      });
      await log('LAN sync auto-started');
    } catch (err) {
      await log(`LAN sync auto-start failed: ${err}`);
    }
  }

  try {
    initShortcuts();
    await log('Shortcuts initialized');
  } catch (err) {
    await log(`Shortcuts init FAILED: ${err}`);
  }

  await log('QUENbot ready. Log: ' + logFile);
});

app.on('window-all-closed', () => { /* tray app */ });

app.on('before-quit', () => {
  try { lanSync.stop(); } catch { /* ignore */ }
  try { stopShortcuts(); } catch { /* ignore */ }
  BrowserWindow.getAllWindows().forEach((w) => {
    try { w.destroy(); } catch { /* ignore */ }
  });
});
