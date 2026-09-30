import React, { useState, useEffect, useCallback, useRef } from 'react';
import './settings.css';

interface SettingsPanelProps {
  onClose: () => void;
  currentTheme: string;
  currentUiFontSize: number;
  onThemeChange: (theme: string, size: number) => void;
}

const THEMES = [
  { id: 'dark-red', label: 'Dark Red', group: 'dark' },
  { id: 'dark-blue', label: 'Dark Blue', group: 'dark' },
  { id: 'dark-green', label: 'Dark Green', group: 'dark' },
  { id: 'dark-purple', label: 'Dark Purple', group: 'dark' },
  { id: 'dark-amber', label: 'Dark Amber', group: 'dark' },
  { id: 'light', label: 'Light', group: 'light' },
  { id: 'light-blue', label: 'Light Blue', group: 'light' },
  { id: 'light-green', label: 'Light Green', group: 'light' },
];

const POSITIONS = [
  { id: 'top-left', label: 'TL', row: 0, col: 0 },
  { id: 'top-center', label: 'TC', row: 0, col: 1 },
  { id: 'top-right', label: 'TR', row: 0, col: 2 },
  { id: 'middle-left', label: 'ML', row: 1, col: 0 },
  { id: 'middle-right', label: 'MR', row: 1, col: 2 },
  { id: 'bottom-left', label: 'BL', row: 2, col: 0 },
  { id: 'bottom-center', label: 'BC', row: 2, col: 1 },
  { id: 'bottom-right', label: 'BR', row: 2, col: 2 },
];

const HOTKEY_DEFAULTS = {
  push: 'ArrowLeft', lock: 'ArrowUp', stealth: 'ArrowDown',
  quickNote: 'ArrowRight', vtt: 'ArrowRight',
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, currentTheme, currentUiFontSize, onThemeChange }) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [widgetScale, setWidgetScale] = useState(0.8);
  const [widgetPosition, setWidgetPosition] = useState('bottom-right');
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(currentTheme);
  const [uiFontSize, setUiFontSize] = useState(currentUiFontSize);
  const [pushKey, setPushKey] = useState(HOTKEY_DEFAULTS.push);
  const [lockKey, setLockKey] = useState(HOTKEY_DEFAULTS.lock);
  const [stealthKey, setStealthKey] = useState(HOTKEY_DEFAULTS.stealth);
  const [quickNoteKey, setQuickNoteKey] = useState(HOTKEY_DEFAULTS.quickNote);
  const [vttKey, setVttKey] = useState(HOTKEY_DEFAULTS.vtt);
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [useCustomName, setUseCustomName] = useState(false);
  const hostnameRef = useRef('');
  const [syncPeers, setSyncPeers] = useState<{ name: string; address: string; port: number; lastSeen: number }[]>([]);
  const [vttEnabled, setVttEnabled] = useState(false);
  const [vttAutoTranscribe, setVttAutoTranscribe] = useState(false);
  const [modelStatus, setModelStatus] = useState<'checking' | 'installed' | 'not-installed' | 'error'>('checking');
  const [modelError, setModelError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState(0);
  const [totalMB, setTotalMB] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const initialLoadDone = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch {}
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(allDevices.filter(d => d.kind === 'audioinput'));
      try { hostnameRef.current = await window.quenbot.getHostname() || 'QUENbot-PC'; } catch { hostnameRef.current = 'QUENbot-PC'; }

      const settings = await window.quenbot.getSettings();
      if (settings?.audioDeviceId) setSelectedDevice(settings.audioDeviceId as string);
      if (settings?.widgetScale) setWidgetScale(settings.widgetScale as number);
      if (settings?.widgetPosition) setWidgetPosition(settings.widgetPosition as string);
      if (settings?.theme) setTheme(settings.theme as string);
      if (settings?.uiFontSize) setUiFontSize(settings.uiFontSize as number);
      if (settings?.syncEnabled) setDiscoverable(settings.syncEnabled as boolean);
      if (settings?.deviceName) { setDeviceName(settings.deviceName as string); setUseCustomName(true); }
      if (settings?.sttEnabled) setVttEnabled(settings.sttEnabled as boolean);
      if (settings?.sttAutoTranscribe) setVttAutoTranscribe(settings.sttAutoTranscribe as boolean);
      const hk = settings?.hotkeys;
      if (hk?.pushRecord?.key) setPushKey(hk.pushRecord.key);
      if (hk?.lockRecord?.key) setLockKey(hk.lockRecord.key);
      if (hk?.stealthRecord?.key) setStealthKey(hk.stealthRecord.key);
      if (hk?.quickNote?.key) setQuickNoteKey(hk.quickNote.key);
      if (hk?.transcribe?.key) setVttKey(hk.transcribe.key);
    } catch (err) { console.error('Settings load failed:', err); }
    setLoading(false);
    // Mark initial load done after a tick so the auto-save effect doesn't fire on first render
    setTimeout(() => { initialLoadDone.current = true; }, 100);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Auto-save: persist to IPC whenever any setting changes (debounced)
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      window.quenbot.saveSettings({
        audioDeviceId: selectedDevice || undefined,
        widgetScale, widgetPosition, theme, uiFontSize,
        floatWindow: undefined, // preserve existing
        syncEnabled: discoverable,
        deviceName: useCustomName ? deviceName : undefined,
        sttEnabled: vttEnabled, sttAutoTranscribe: vttAutoTranscribe,
        hotkeys: {
          pushRecord: { modifiers: ['Ctrl', 'Shift'], key: pushKey },
          lockRecord: { modifiers: ['Ctrl', 'Shift'], key: lockKey },
          stealthRecord: { modifiers: ['Ctrl', 'Shift'], key: stealthKey },
          quickNote: { modifiers: ['Ctrl', 'Shift'], key: quickNoteKey },
          transcribe: { modifiers: ['Ctrl'], key: vttKey },
        },
      }).then(() => {
        console.log('[Settings] Auto-saved');
      });
    }, 300);
  }, [selectedDevice, widgetScale, widgetPosition, theme, uiFontSize,
      pushKey, lockKey, stealthKey, quickNoteKey, vttKey,
      discoverable, deviceName, useCustomName, vttEnabled, vttAutoTranscribe]);

  // LAN Sync: start/stop when discoverable changes, listen for peers
  useEffect(() => {
    if (!initialLoadDone.current) return;
    const q = window.quenbot;
    if (discoverable) {
      const name = useCustomName && deviceName ? deviceName : hostnameRef.current || 'QUENbot';
      q.startLanSync?.(name);
      // Load initial peers
      q.getSyncPeers?.().then((p) => setSyncPeers(p || [])).catch(() => {});
    } else {
      q.stopLanSync?.();
      setSyncPeers([]);
    }
  }, [discoverable]);

  useEffect(() => {
    const q = window.quenbot;
    q.onSyncPeersChanged?.((peers) => setSyncPeers(peers || []));
    return () => { window.quenbot.removeAllListeners('sync-peers-changed'); };
  }, []);

  // Check model
  const checkModelStatus = useCallback(async () => {
    try {
      const r = await window.quenbot.getModelStatus();
      setModelStatus(r.status);
      setModelError(r.message || '');
    } catch { setModelStatus('error'); setModelError('Check failed'); }
  }, []);

  useEffect(() => { checkModelStatus(); }, [checkModelStatus]);

  useEffect(() => {
    window.quenbot.onModelDownloadProgress?.((p) => {
      setDownloadPercent(p.percent);
      setDownloadedMB(Math.round(p.downloaded / 1048576));
      setTotalMB(Math.round(p.total / 1048576));
      if (p.currentFile) setCurrentFile(p.currentFile);
    });
    return () => { window.quenbot.removeAllListeners('model-download-progress'); };
  }, []);

  const handleDownloadModel = async () => {
    setDownloading(true); setDownloadPercent(0); setModelError('');
    try { await window.quenbot.downloadModel(); setDownloading(false); await checkModelStatus(); }
    catch { setDownloading(false); setModelStatus('error'); setModelError('Download failed'); }
  };

  // Live preview theme + font size
  useEffect(() => { onThemeChange(theme, uiFontSize); }, [theme, uiFontSize, onThemeChange]);

  // Hotkey capture
  useEffect(() => {
    if (!capturingKey) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      switch (capturingKey) {
        case 'push': setPushKey(e.code); break;
        case 'lock': setLockKey(e.code); break;
        case 'stealth': setStealthKey(e.code); break;
        case 'quickNote': setQuickNoteKey(e.code); break;
        case 'vtt': setVttKey(e.code); break;
      }
      setCapturingKey(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [capturingKey]);

  // Widget preview
  const showPreview = () => { if (!previewVisible) { window.quenbot.showWidgetPreview(); setPreviewVisible(true); } };
  const hidePreview = () => { if (previewVisible) { window.quenbot.hideWidgetPreview(); setPreviewVisible(false); } };
  useEffect(() => { if (previewVisible) window.quenbot.updateWidgetPreview(widgetScale, widgetPosition); }, [widgetScale, widgetPosition, previewVisible]);
  useEffect(() => { return () => { window.quenbot.hideWidgetPreview?.(); }; }, []);

  const handleClose = () => { hidePreview(); onClose(); };

  if (loading) return <div className="settings-panel"><div className="settings-loading">loading...</div></div>;

  const HotkeyRow = ({ label, id, value, setter, defaultVal, prefix = 'Ctrl+Shift' }: {
    label: string; id: string; value: string; setter: (v: string) => void; defaultVal: string; prefix?: string;
  }) => (
    <div className="hotkey-field">
      <span className="hotkey-label">{label}</span>
      <div className="hotkey-controls">
        <button className={`hotkey-btn${capturingKey === id ? ' capturing' : ''}`} onClick={() => setCapturingKey(id)}>
          {capturingKey === id ? 'press key...' : `${prefix}+${value}`}
        </button>
        {value !== defaultVal && <button className="hotkey-reset" onClick={() => setter(defaultVal)} title="Reset">&#x21a9;</button>}
      </div>
    </div>
  );

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span className="settings-title">settings</span>
        <button className="settings-close-btn" onClick={handleClose}>&times;</button>
      </div>

      <div className="settings-section-label">appearance</div>
      <div className="settings-group">
        <div className="settings-label"><span>theme</span></div>
        <select className="settings-select" value={theme} onChange={e => setTheme(e.target.value)}>
          <optgroup label="Dark">{THEMES.filter(t => t.group === 'dark').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>
          <optgroup label="Light">{THEMES.filter(t => t.group === 'light').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>
        </select>
      </div>
      <div className="settings-group">
        <div className="settings-label"><span>ui text size</span><span className="settings-value">{uiFontSize}px</span></div>
        <input type="range" className="settings-range" min="10" max="18" step="1" value={uiFontSize} onChange={e => setUiFontSize(parseInt(e.target.value))} />
      </div>

      <div className="settings-section-label">audio</div>
      <div className="settings-group">
        <div className="settings-label"><span>microphone</span></div>
        <select className="settings-select" value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}>
          <option value="">System Default</option>
          {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 8)}`}</option>)}
        </select>
      </div>

      <div className="settings-section-label">widget</div>
      <div className="settings-group">
        <div className="settings-label"><span>size</span><span className="settings-value">{Math.round(widgetScale * 100)}%</span></div>
        <input type="range" className="settings-range" min="0.5" max="1.5" step="0.1"
          value={widgetScale} onChange={e => { setWidgetScale(parseFloat(e.target.value)); showPreview(); }} />
        <div className="settings-label" style={{ marginTop: 8 }}><span>position</span></div>
        <div className="position-row-wrapper">
          <div className="position-grid" onClick={showPreview}>
            {[0, 1, 2].map(row => (
              <div key={row} className="position-row">
                {[0, 1, 2].map(col => {
                  const pos = POSITIONS.find(p => p.row === row && p.col === col);
                  if (!pos) return <div key={col} className="position-cell position-empty" />;
                  return (
                    <button key={col} className={`position-cell${widgetPosition === pos.id ? ' active' : ''}`}
                      onClick={() => { setWidgetPosition(pos.id); showPreview(); }} title={pos.id}>{pos.label}</button>
                  );
                })}
              </div>
            ))}
          </div>
          {previewVisible && <button className="settings-btn settings-btn-small" onClick={hidePreview}>hide preview</button>}
        </div>
      </div>

      <div className="settings-section-label">hotkeys</div>
      <div className="settings-group">
        <HotkeyRow label="push record" id="push" value={pushKey} setter={setPushKey} defaultVal={HOTKEY_DEFAULTS.push} />
        <HotkeyRow label="lock record" id="lock" value={lockKey} setter={setLockKey} defaultVal={HOTKEY_DEFAULTS.lock} />
        <HotkeyRow label="stealth record" id="stealth" value={stealthKey} setter={setStealthKey} defaultVal={HOTKEY_DEFAULTS.stealth} />
        <HotkeyRow label="quick note" id="quickNote" value={quickNoteKey} setter={setQuickNoteKey} defaultVal={HOTKEY_DEFAULTS.quickNote} />
        <HotkeyRow label="voice-to-text" id="vtt" value={vttKey} setter={setVttKey} defaultVal={HOTKEY_DEFAULTS.vtt} prefix="Ctrl" />
      </div>

      <div className="settings-section-label">voice-to-text</div>
      <div className="settings-group">
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">enable vtt (parakeet v3)</span>
          <label className="settings-switch"><input type="checkbox" checked={vttEnabled} onChange={e => setVttEnabled(e.target.checked)} /><span className="settings-switch-slider" /></label>
        </div>
        {vttEnabled && (
          <>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">auto-transcribe recordings</span>
              <label className="settings-switch"><input type="checkbox" checked={vttAutoTranscribe} onChange={e => setVttAutoTranscribe(e.target.checked)} /><span className="settings-switch-slider" /></label>
            </div>
            <div className="settings-model-info">
              <div className="settings-model-header">
                <span className="settings-model-name">Parakeet TDT v3 0.6B</span>
                <span className={`model-status-badge ${modelStatus}`}>
                  {modelStatus === 'checking' && 'checking...'}
                  {modelStatus === 'installed' && 'up to date'}
                  {modelStatus === 'not-installed' && 'not installed'}
                  {modelStatus === 'error' && 'error'}
                </span>
              </div>
              <span className="settings-model-detail">NVIDIA / ONNX INT8 / ~670MB / 25 languages</span>
              {modelError && <span className="settings-model-error">{modelError}</span>}
              {downloading ? (
                <div className="model-download-progress">
                  <div className="model-progress-bar"><div className="model-progress-fill" style={{ width: `${downloadPercent}%` }} /></div>
                  <span className="model-progress-text">
                    {currentFile && <>{currentFile} — </>}{downloadedMB}MB / {totalMB}MB ({downloadPercent}%)
                  </span>
                </div>
              ) : (
                <>
                  {modelStatus === 'not-installed' && <button className="settings-btn settings-btn-small" onClick={handleDownloadModel}>download model</button>}
                  {modelStatus === 'error' && <button className="settings-btn settings-btn-small" onClick={handleDownloadModel}>re-download model</button>}
                  {modelStatus === 'installed' && <button className="settings-btn settings-btn-small" onClick={checkModelStatus}>check for updates</button>}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="settings-section-label">network sync</div>
      <div className="settings-group">
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">discoverable on lan</span>
          <label className="settings-switch"><input type="checkbox" checked={discoverable} onChange={e => setDiscoverable(e.target.checked)} /><span className="settings-switch-slider" /></label>
        </div>
        {discoverable && (
          <>
            <div className="settings-group" style={{ marginTop: 6 }}>
              <div className="settings-toggle-row">
                <span className="settings-toggle-label">custom name</span>
                <label className="settings-switch"><input type="checkbox" checked={useCustomName} onChange={e => setUseCustomName(e.target.checked)} /><span className="settings-switch-slider" /></label>
              </div>
              {useCustomName ? (
                <input type="text" className="settings-text-input" placeholder="Enter custom name" value={deviceName} onChange={e => setDeviceName(e.target.value)} />
              ) : (
                <div className="settings-hint">Broadcasting as: {hostnameRef.current}</div>
              )}
            </div>
            <div className="settings-group" style={{ marginTop: 6 }}>
              <div className="settings-label"><span>discovered peers</span><span className="settings-value">{syncPeers.length}</span></div>
              {syncPeers.length === 0 ? (
                <div className="settings-hint">Scanning LAN for other QUENbot instances...</div>
              ) : (
                <div className="sync-peer-list">
                  {syncPeers.map(p => (
                    <div key={`${p.address}:${p.port}`} className="sync-peer-row">
                      <span className="sync-peer-dot" />
                      <span className="sync-peer-name">{p.name}</span>
                      <span className="sync-peer-addr">{p.address}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ height: 16 }} />
    </div>
  );
};
