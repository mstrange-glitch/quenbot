import type { QuenbotAPI } from '../preload';

export type { QuenbotAPI };

export interface RecordingFile {
  name: string;
  path: string;
  size: number;
  date: string;
  duration?: number;
  transcript?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string; // TipTap HTML
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  order: number;
  chips?: string[];
}

export interface Chip {
  id: string;
  name: string;
  color: string;
}

export type FeedItemType = 'recording' | 'note' | 'transcript';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  preview: string;
  timestamp: string;
  refId: string;
  size?: number;
  duration?: number;
  /** Tag ids of the note this item refers to (attached live by main, not stored). */
  chips?: string[];
}

export type WidgetMode = 'push' | 'lock' | 'stealth' | 'transcribe';
export type RecordingMode = 'push' | 'lock' | 'stealth';

export interface HotkeyBinding {
  modifiers: string[];
  key: string;
}

export interface HotkeyConfig {
  pushRecord?: HotkeyBinding;
  lockRecord?: HotkeyBinding;
  stealthRecord?: HotkeyBinding;
  quickNote?: HotkeyBinding;
  transcribe?: HotkeyBinding;
}

export interface AppSettings {
  audioDeviceId?: string;
  widgetScale: number;
  widgetPosition: string;
  theme: string;
  uiFontSize: number;
  floatWindow: boolean;
  hotkeys: HotkeyConfig;
  editorFontSize: number;
  editorFontFamily: string;
  wordWrap: boolean;
  showLineNumbers: boolean;
  sttEnabled: boolean;
  sttAutoTranscribe: boolean;
  syncEnabled: boolean;
  syncPort: number;
  deviceName: string;
}

export interface SyncPeer {
  id?: string;
  name: string;
  address: string;
  port: number;
  lastSeen: number;
}

export interface ModelStatus {
  status: 'installed' | 'not-installed' | 'error';
  path: string;
  message?: string;
}

export interface ModelDownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  currentFile?: string;
}

declare global {
  interface Window {
    quenbot: QuenbotAPI;
  }
}
