import { Tray, Menu, nativeImage, shell, app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { createMainWindow } from './windows';
import { getRecordingsDir } from './audio-saver';

let tray: Tray | null = null;

function getAssetPath(filename: string): string {
  const prodPath = join(process.resourcesPath, 'assets', filename);
  if (existsSync(prodPath)) return prodPath;
  const devPath = join(app.getAppPath(), 'assets', filename);
  if (existsSync(devPath)) return devPath;
  return '';
}

function createTrayIcon(recording: boolean): Electron.NativeImage {
  const pngFile = recording ? 'tray-icon-rec.png' : 'tray-icon.png';
  const pngPath = getAssetPath(pngFile);
  if (pngPath) {
    const img = nativeImage.createFromPath(pngPath);
    if (!img.isEmpty()) return img;
  }
  // Fallback: programmatic 16x16 icon
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = x - size / 2 + 0.5;
      const cy = y - size / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist <= 6) {
        if (recording) {
          canvas[idx] = 0x9A; canvas[idx+1] = 0x24; canvas[idx+2] = 0x24; canvas[idx+3] = 255;
        } else {
          canvas[idx] = 0xE0; canvas[idx+1] = 0xE0; canvas[idx+2] = 0xE0; canvas[idx+3] = 255;
        }
      } else if (dist <= 7) {
        canvas[idx] = 0x4A; canvas[idx+1] = 0x4A; canvas[idx+2] = 0x4A; canvas[idx+3] = 255;
      } else {
        canvas[idx] = 0; canvas[idx+1] = 0; canvas[idx+2] = 0; canvas[idx+3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function createTray(): Tray {
  const icon = createTrayIcon(false);
  tray = new Tray(icon);
  tray.setToolTip('QUENbot');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open QUENbot', click: () => createMainWindow() },
    { label: 'Recordings Folder', click: () => shell.openPath(getRecordingsDir()) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => createMainWindow());
  tray.on('double-click', () => createMainWindow());
  return tray;
}

export function setTrayRecording(recording: boolean): void {
  if (tray) {
    tray.setImage(createTrayIcon(recording));
    tray.setToolTip(recording ? 'QUENbot - Recording...' : 'QUENbot');
  }
}

export function getTray(): Tray | null { return tray; }
