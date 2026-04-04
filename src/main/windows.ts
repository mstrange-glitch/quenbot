import { BrowserWindow, screen, nativeImage, app, ipcMain } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

let widgetWindow: BrowserWindow | null = null;
let previewWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let onWidgetClosedCallback: (() => void) | null = null;
let savedBounds: Electron.Rectangle | null = null;

const isDev = process.env.NODE_ENV === 'development';
const rendererUrl = process.env.ELECTRON_RENDERER_URL;

export function setOnWidgetClosed(callback: () => void): void {
  onWidgetClosedCallback = callback;
}

function loadRendererPage(win: BrowserWindow, pagePath: string): void {
  if (isDev && rendererUrl) {
    win.loadURL(`${rendererUrl}/${pagePath}`);
  } else {
    win.loadFile(join(__dirname, '..', 'renderer', pagePath));
  }
}

export function getWidgetWindow(): BrowserWindow | null { return widgetWindow; }
export function getMainWindow(): BrowserWindow | null { return mainWindow; }

function loadSettingsFile(): Record<string, any> {
  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json');
    if (existsSync(settingsPath)) {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* use default */ }
  return {};
}

function getWidgetScale(): number {
  const settings = loadSettingsFile();
  if (settings.widgetScale && settings.widgetScale >= 0.5 && settings.widgetScale <= 1.5) {
    return settings.widgetScale;
  }
  return 0.8;
}

function getWidgetPosition(): string {
  const settings = loadSettingsFile();
  return settings.widgetPosition || 'bottom-right';
}

function calcWidgetXY(widgetW: number, widgetH: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const pad = 20;
  const pos = getWidgetPosition();

  switch (pos) {
    case 'top-left': return { x: pad, y: pad };
    case 'top-center': return { x: Math.round(sw / 2 - widgetW / 2), y: pad };
    case 'top-right': return { x: sw - widgetW - pad, y: pad };
    case 'middle-left': return { x: pad, y: Math.round(sh / 2 - widgetH / 2) };
    case 'middle-right': return { x: sw - widgetW - pad, y: Math.round(sh / 2 - widgetH / 2) };
    case 'bottom-left': return { x: pad, y: sh - widgetH - pad };
    case 'bottom-center': return { x: Math.round(sw / 2 - widgetW / 2), y: sh - widgetH - pad };
    case 'bottom-right': default: return { x: sw - widgetW - pad, y: sh - widgetH - pad };
  }
}

export function createWidget(mode: 'push' | 'lock'): BrowserWindow {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close();

  const scale = getWidgetScale();
  const baseW = 200;
  const baseH = mode === 'push' ? 44 : 70;
  const widgetW = Math.round(baseW * scale);
  const widgetH = Math.round(baseH * scale);
  const { x, y } = calcWidgetXY(widgetW, widgetH);

  widgetWindow = new BrowserWindow({
    width: widgetW, height: widgetH, x, y,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, focusable: true, show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  loadRendererPage(widgetWindow, 'widget/index.html');

  widgetWindow.once('ready-to-show', () => {
    widgetWindow!.show();
    widgetWindow!.webContents.send('set-widget-mode', mode);
    widgetWindow!.webContents.send('start-recording', mode);
  });

  widgetWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Widget] Page failed to load: ${errorCode} ${errorDescription}`);
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close();
  });

  widgetWindow.on('closed', () => {
    widgetWindow = null;
    if (onWidgetClosedCallback) onWidgetClosedCallback();
  });

  return widgetWindow;
}

export function destroyWidget(): void {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const win = widgetWindow;

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

// Widget preview for settings
export function showWidgetPreview(): void {
  hideWidgetPreview();
  const scale = getWidgetScale();
  const widgetW = Math.round(200 * scale);
  const widgetH = Math.round(44 * scale);
  const { x, y } = calcWidgetXY(widgetW, widgetH);

  previewWindow = new BrowserWindow({
    width: widgetW, height: widgetH, x, y,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, focusable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Simple preview content
  previewWindow.loadURL(`data:text/html,
    <html><body style="margin:0;background:rgba(0,0,0,0.85);border:1px solid rgba(154,36,36,0.6);border-radius:6px;display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;">
    <span style="color:#9A2424;font-size:10px;letter-spacing:2px;text-transform:uppercase;">widget preview</span>
    </body></html>`);

  previewWindow.setIgnoreMouseEvents(true);
}

export function hideWidgetPreview(): void {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close();
  }
  previewWindow = null;
}

// Update preview position/size live
export function updateWidgetPreview(scale: number, position: string): void {
  if (!previewWindow || previewWindow.isDestroyed()) return;
  const widgetW = Math.round(200 * scale);
  const widgetH = Math.round(44 * scale);
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const pad = 20;

  let x: number, y: number;
  switch (position) {
    case 'top-left': x = pad; y = pad; break;
    case 'top-center': x = Math.round(sw / 2 - widgetW / 2); y = pad; break;
    case 'top-right': x = sw - widgetW - pad; y = pad; break;
    case 'middle-left': x = pad; y = Math.round(sh / 2 - widgetH / 2); break;
    case 'middle-right': x = sw - widgetW - pad; y = Math.round(sh / 2 - widgetH / 2); break;
    case 'bottom-left': x = pad; y = sh - widgetH - pad; break;
    case 'bottom-center': x = Math.round(sw / 2 - widgetW / 2); y = sh - widgetH - pad; break;
    case 'bottom-right': default: x = sw - widgetW - pad; y = sh - widgetH - pad; break;
  }

  previewWindow.setBounds({ x, y, width: widgetW, height: widgetH });
}

// Always on top
export function setAlwaysOnTop(value: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(value);
  }
}

// Mini mode
export function setMiniMode(mini: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mini) {
    savedBounds = mainWindow.getBounds();
    const display = screen.getPrimaryDisplay();
    const { width: sw } = display.workAreaSize;
    mainWindow.setMinimumSize(340, 48);
    mainWindow.setBounds({ x: Math.round(sw / 2 - 200), y: 0, width: 400, height: 48 });
    mainWindow.setAlwaysOnTop(true);
  } else {
    mainWindow.setMinimumSize(480, 600);
    if (savedBounds) {
      mainWindow.setBounds(savedBounds);
    } else {
      mainWindow.setBounds({ x: 100, y: 100, width: 540, height: 720 });
    }
    // Restore user's always-on-top preference
    const settings = loadSettingsFile();
    mainWindow.setAlwaysOnTop(settings.floatWindow === true);
    savedBounds = null;
  }
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  let appIcon: Electron.NativeImage | undefined;
  const prodIconPath = join(process.resourcesPath, 'assets', 'icon.png');
  const devIconPath = join(app.getAppPath(), 'assets', 'icon.png');
  const iconPath = existsSync(prodIconPath) ? prodIconPath : existsSync(devIconPath) ? devIconPath : '';
  if (iconPath) appIcon = nativeImage.createFromPath(iconPath);

  const settings = loadSettingsFile();

  mainWindow = new BrowserWindow({
    width: 540, height: 720,
    frame: false, resizable: true,
    backgroundColor: '#000000', show: false,
    minWidth: 480, minHeight: 600,
    icon: appIcon,
    alwaysOnTop: settings.floatWindow === true,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  loadRendererPage(mainWindow, 'main/index.html');
  mainWindow.once('ready-to-show', () => { mainWindow!.show(); });
  mainWindow.on('closed', () => { mainWindow = null; });

  return mainWindow;
}
