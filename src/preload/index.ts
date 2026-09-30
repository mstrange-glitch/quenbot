import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings, Chip, FeedItem, ModelDownloadProgress, ModelStatus, Note, RecordingFile, SyncPeer,
} from '../shared/types';

const api = {
  // Recording
  onStartRecording: (callback: (mode: string) => void) => {
    ipcRenderer.on('start-recording', (_event, mode) => callback(mode));
  },
  onStopRecording: (callback: () => void) => {
    ipcRenderer.on('stop-recording', () => callback());
  },
  sendAudioData: (buffer: ArrayBuffer, sampleRate: number, channels: number): Promise<string> => {
    return ipcRenderer.invoke('save-audio', buffer, sampleRate, channels);
  },
  signalSaveComplete: () => {
    ipcRenderer.send('save-complete');
  },

  // Transcription
  onStartTranscription: (callback: () => void) => {
    ipcRenderer.on('start-transcription', () => callback());
  },
  onStopTranscription: (callback: () => void) => {
    ipcRenderer.on('stop-transcription', () => callback());
  },
  sendTranscriptionResult: (text: string) => {
    ipcRenderer.send('transcription-result', text);
  },
  transcribeAudio: (buffer: ArrayBuffer, sampleRate: number): Promise<string> =>
    ipcRenderer.invoke('transcribe-audio', buffer, sampleRate),

  // Playback
  getRecordings: (): Promise<RecordingFile[]> => ipcRenderer.invoke('get-recordings'),
  readAudioFile: (path: string): Promise<ArrayBuffer> => ipcRenderer.invoke('read-audio-file', path),

  // File management
  deleteRecording: (path: string): Promise<boolean> => ipcRenderer.invoke('delete-recording', path),
  renameRecording: (oldPath: string, newName: string): Promise<string> => ipcRenderer.invoke('rename-recording', oldPath, newName),

  // Notes
  getNotes: (): Promise<Note[]> => ipcRenderer.invoke('get-notes'),
  saveNote: (note: Note, isNew?: boolean): Promise<void> => ipcRenderer.invoke('save-note', note, isNew),
  deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('delete-note', id),
  reorderNotes: (ids: string[]): Promise<void> => ipcRenderer.invoke('reorder-notes', ids),

  // Feed
  getFeed: (limit?: number, before?: string, filter?: string, sortBy?: string): Promise<FeedItem[]> =>
    ipcRenderer.invoke('get-feed', limit, before, filter, sortBy),
  deleteFeedItem: (id: string): Promise<void> => ipcRenderer.invoke('delete-feed-item', id),
  clearFeed: (): Promise<void> => ipcRenderer.invoke('clear-feed'),
  exportFeedItem: (item: FeedItem, format: 'md' | 'txt'): Promise<string> => ipcRenderer.invoke('export-feed-item', item, format),
  openFeedItemFile: (refId: string): Promise<void> => ipcRenderer.invoke('open-feed-item-file', refId),

  // Chips
  getChips: (): Promise<Chip[]> => ipcRenderer.invoke('get-chips'),
  addChip: (name: string, color: string): Promise<Chip> => ipcRenderer.invoke('add-chip', name, color),
  removeChip: (id: string): Promise<boolean> => ipcRenderer.invoke('remove-chip', id),
  updateChip: (id: string, name: string, color: string): Promise<boolean> => ipcRenderer.invoke('update-chip', id, name, color),

  // Window
  onWidgetMode: (callback: (mode: string) => void) => {
    ipcRenderer.on('set-widget-mode', (_event, mode) => callback(mode));
  },
  getWidgetMode: (): Promise<string> => ipcRenderer.invoke('get-widget-mode'),
  onRecordingsUpdated: (callback: () => void) => {
    ipcRenderer.on('recordings-updated', () => callback());
  },
  onNotesUpdated: (callback: () => void) => {
    ipcRenderer.on('notes-updated', () => callback());
  },
  onRecordingTick: (callback: (seconds: number) => void) => {
    ipcRenderer.on('recording-tick', (_event, seconds) => callback(seconds));
  },
  showJotTab: (callback: () => void) => {
    ipcRenderer.on('show-jot-tab', () => callback());
  },

  // Window controls
  setAlwaysOnTop: (value: boolean): Promise<void> => ipcRenderer.invoke('set-always-on-top', value),
  setMiniMode: (mini: boolean): Promise<void> => ipcRenderer.invoke('set-mini-mode', mini),
  showWidgetPreview: (): Promise<void> => ipcRenderer.invoke('show-widget-preview'),
  hideWidgetPreview: (): Promise<void> => ipcRenderer.invoke('hide-widget-preview'),
  updateWidgetPreview: (scale: number, position: string): Promise<void> => ipcRenderer.invoke('update-widget-preview', scale, position),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('hide-window'),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('minimize-window'),

  // Settings
  getAudioDevices: (): Promise<null> => ipcRenderer.invoke('get-audio-devices'),
  getSettings: (): Promise<Partial<AppSettings>> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Partial<AppSettings>): Promise<boolean> => ipcRenderer.invoke('save-settings', settings),

  // System
  getHostname: (): Promise<string> => ipcRenderer.invoke('get-hostname'),

  // LAN Sync
  getSyncPeers: (): Promise<SyncPeer[]> => ipcRenderer.invoke('get-sync-peers'),
  sendNoteToPeer: (address: string, port: number, note: Note): Promise<boolean> =>
    ipcRenderer.invoke('send-note-to-peer', address, port, note),
  startLanSync: (name: string, port?: number): Promise<void> => ipcRenderer.invoke('start-lan-sync', name, port),
  stopLanSync: (): Promise<void> => ipcRenderer.invoke('stop-lan-sync'),
  onSyncPeersChanged: (callback: (peers: SyncPeer[]) => void) => {
    ipcRenderer.on('sync-peers-changed', (_event, peers) => callback(peers));
  },
  onNoteReceived: (callback: (data: { note: Note; from: string }) => void) => {
    ipcRenderer.on('note-received', (_event, data) => callback(data));
  },

  // Model
  getModelStatus: (): Promise<ModelStatus> => ipcRenderer.invoke('get-model-status'),
  downloadModel: (): Promise<string> => ipcRenderer.invoke('download-model'),
  onModelDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => {
    ipcRenderer.on('model-download-progress', (_event, progress) => callback(progress));
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

export type QuenbotAPI = typeof api;

contextBridge.exposeInMainWorld('quenbot', api);
