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
}

export type WidgetMode = 'push' | 'lock';
export type RecordingMode = 'push' | 'lock' | 'stealth';

export interface HotkeyBinding {
  modifiers: string[];
  key: string;
}

export interface AppSettings {
  audioDeviceId?: string;
  widgetScale: number;
  hotkeys: {
    pushRecord?: HotkeyBinding;
    lockRecord?: HotkeyBinding;
    stealthRecord?: HotkeyBinding;
    quickNote?: HotkeyBinding;
  };
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
  name: string;
  address: string;
  port: number;
  lastSeen: number;
}

export interface QuenbotAPI {
  // Recording
  onStartRecording: (cb: (mode: string) => void) => void;
  onStopRecording: (cb: () => void) => void;
  sendAudioData: (buffer: ArrayBuffer, sampleRate: number, channels: number) => Promise<string>;
  signalSaveComplete: () => void;
  getRecordings: () => Promise<RecordingFile[]>;
  readAudioFile: (path: string) => Promise<ArrayBuffer>;
  deleteRecording: (path: string) => Promise<boolean>;
  renameRecording: (oldPath: string, newName: string) => Promise<string>;

  // Notes
  getNotes: () => Promise<Note[]>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  reorderNotes: (ids: string[]) => Promise<void>;

  // Feed
  getFeed: (limit?: number, before?: string) => Promise<FeedItem[]>;

  // Widget
  onWidgetMode: (cb: (mode: string) => void) => void;
  getWidgetMode: () => Promise<string>;
  onRecordingsUpdated: (cb: () => void) => void;
  onRecordingTick: (cb: (seconds: number) => void) => void;

  // Window
  hideWindow: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  showJotTab: (cb: () => void) => void;

  // Settings
  getAudioDevices: () => Promise<null>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Record<string, unknown>) => Promise<boolean>;

  // LAN Sync
  getSyncPeers: () => Promise<SyncPeer[]>;
  sendNoteToPeer: (peerAddress: string, peerPort: number, note: Note) => Promise<boolean>;
  onSyncPeersChanged: (cb: (peers: SyncPeer[]) => void) => void;
  onNoteReceived: (cb: (data: { note: Note; from: string }) => void) => void;

  // Listeners
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    quenbot: QuenbotAPI;
  }
}
