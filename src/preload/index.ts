import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('quenbot', {
  // Recording
  onStartRecording: (callback: (mode: string) => void) => {
    ipcRenderer.on('start-recording', (_event, mode) => callback(mode));
  },
  onStopRecording: (callback: () => void) => {
    ipcRenderer.on('stop-recording', () => callback());
  },
  sendAudioData: (buffer: ArrayBuffer, sampleRate: number, channels: number) => {
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
  transcribeAudio: (buffer: ArrayBuffer, sampleRate: number) => ipcRenderer.invoke('transcribe-audio', buffer, sampleRate),

  // Playback
  getRecordings: () => ipcRenderer.invoke('get-recordings'),
  readAudioFile: (path: string) => ipcRenderer.invoke('read-audio-file', path),

  // File management
  deleteRecording: (path: string) => ipcRenderer.invoke('delete-recording', path),
  renameRecording: (oldPath: string, newName: string) => ipcRenderer.invoke('rename-recording', oldPath, newName),

  // Notes
  getNotes: () => ipcRenderer.invoke('get-notes'),
  saveNote: (note: Record<string, unknown>, isNew?: boolean) => ipcRenderer.invoke('save-note', note, isNew),
  deleteNote: (id: string) => ipcRenderer.invoke('delete-note', id),
  reorderNotes: (ids: string[]) => ipcRenderer.invoke('reorder-notes', ids),

  // Feed
  getFeed: (limit?: number, before?: string, filter?: string, sortBy?: string) => ipcRenderer.invoke('get-feed', limit, before, filter, sortBy),
  deleteFeedItem: (id: string) => ipcRenderer.invoke('delete-feed-item', id),
  clearFeed: () => ipcRenderer.invoke('clear-feed'),
  exportFeedItem: (item: any, format: 'md' | 'txt') => ipcRenderer.invoke('export-feed-item', item, format),
  openFeedItemFile: (refId: string) => ipcRenderer.invoke('open-feed-item-file', refId),

  // Chips
  getChips: () => ipcRenderer.invoke('get-chips'),
  addChip: (name: string, color: string) => ipcRenderer.invoke('add-chip', name, color),
  removeChip: (id: string) => ipcRenderer.invoke('remove-chip', id),
  updateChip: (id: string, name: string, color: string) => ipcRenderer.invoke('update-chip', id, name, color),

  // Window
  onWidgetMode: (callback: (mode: string) => void) => {
    ipcRenderer.on('set-widget-mode', (_event, mode) => callback(mode));
  },
  getWidgetMode: () => ipcRenderer.invoke('get-widget-mode'),
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
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('set-always-on-top', value),
  setMiniMode: (mini: boolean) => ipcRenderer.invoke('set-mini-mode', mini),
  showWidgetPreview: () => ipcRenderer.invoke('show-widget-preview'),
  hideWidgetPreview: () => ipcRenderer.invoke('hide-widget-preview'),
  updateWidgetPreview: (scale: number, position: string) => ipcRenderer.invoke('update-widget-preview', scale, position),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),

  // Settings
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('save-settings', settings),

  // System
  getHostname: () => ipcRenderer.invoke('get-hostname'),

  // LAN Sync
  getSyncPeers: () => ipcRenderer.invoke('get-sync-peers'),
  sendNoteToPeer: (address: string, port: number, note: any) => ipcRenderer.invoke('send-note-to-peer', address, port, note),
  startLanSync: (name: string, port?: number) => ipcRenderer.invoke('start-lan-sync', name, port),
  stopLanSync: () => ipcRenderer.invoke('stop-lan-sync'),
  onSyncPeersChanged: (callback: (peers: any[]) => void) => {
    ipcRenderer.on('sync-peers-changed', (_event, peers) => callback(peers));
  },
  onNoteReceived: (callback: (data: { note: any; from: string }) => void) => {
    ipcRenderer.on('note-received', (_event, data) => callback(data));
  },

  // Model
  getModelStatus: () => ipcRenderer.invoke('get-model-status'),
  downloadModel: () => ipcRenderer.invoke('download-model'),
  onModelDownloadProgress: (callback: (progress: { downloaded: number; total: number; percent: number }) => void) => {
    ipcRenderer.on('model-download-progress', (_event, progress) => callback(progress));
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
