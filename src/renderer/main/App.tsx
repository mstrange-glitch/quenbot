import React, { useState, useEffect, useRef } from 'react';
import { RecTab } from './components/rec/RecTab';
import { JotTab } from './components/jot/JotTab';
import { FeedTab } from './components/feed/FeedTab';
import { SettingsPanel } from './components/settings/SettingsPanel';

type TabId = 'rec' | 'jot' | 'log';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('rec');
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState('dark-red');
  const [uiFontSize, setUiFontSize] = useState(12);
  const [floatWindow, setFloatWindow] = useState(false);
  const [miniMode, setMiniMode] = useState(false);
  const [jotFocusRequest, setJotFocusRequest] = useState(0);

  useEffect(() => {
    window.quenbot.getSettings().then((s) => {
      if (s?.theme) setTheme(s.theme);
      if (s?.uiFontSize) setUiFontSize(s.uiFontSize);
      if (s?.floatWindow) setFloatWindow(s.floatWindow);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--ui-font-size', `${uiFontSize}px`);
  }, [theme, uiFontSize]);

  // Quick Note hotkey: open JOT with the cursor in the editor. Kept in a ref so the listener
  // below is registered once and still sees the current miniMode.
  const openJotForQuickNote = useRef(() => {});
  openJotForQuickNote.current = () => {
    setActiveTab('jot');
    setShowSettings(false);
    setJotFocusRequest((n) => n + 1);
    if (miniMode) { setMiniMode(false); window.quenbot.setMiniMode(false); }
  };

  useEffect(() => {
    window.quenbot.showJotTab(() => {
      window.quenbot.consumePendingJotTab();
      openJotForQuickNote.current();
    });
    // A Quick Note pressed while this window was still loading is waiting in main.
    window.quenbot.consumePendingJotTab().then((pending) => {
      if (pending) openJotForQuickNote.current();
    }).catch(() => {});
    return () => { window.quenbot.removeAllListeners('show-jot-tab'); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('rec'); setShowSettings(false); }
        if (e.key === '2') { e.preventDefault(); setActiveTab('jot'); setShowSettings(false); }
        if (e.key === '3') { e.preventDefault(); setActiveTab('log'); setShowSettings(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTabClick = (tab: TabId) => { setActiveTab(tab); setShowSettings(false); };

  const toggleFloat = () => {
    const v = !floatWindow;
    setFloatWindow(v);
    window.quenbot.setAlwaysOnTop(v);
    window.quenbot.saveSettings({ floatWindow: v });
  };

  const toggleMiniMode = () => {
    const v = !miniMode;
    setMiniMode(v);
    window.quenbot.setMiniMode(v);
    if (v) setShowSettings(false);
  };

  if (miniMode) {
    return (
      <div className="app mini-mode">
        <div className="mini-bar">
          <span className="mini-brand">Q</span>
          <div className="mini-drag" />
          <button className="mini-btn" onClick={() => { toggleMiniMode(); handleTabClick('rec'); }} title="REC">
            <span className="mini-rec-dot" />
          </button>
          <button className="mini-btn mini-btn-text" onClick={() => { toggleMiniMode(); handleTabClick('jot'); }} title="JOT">J</button>
          <button className="mini-btn mini-btn-text" onClick={() => { toggleMiniMode(); handleTabClick('log'); }} title="LOG">L</button>
          <div className="mini-drag" />
          <button className="mini-btn mini-expand" onClick={toggleMiniMode} title="Expand">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707z"/></svg>
          </button>
          <button className="mini-btn mini-close" onClick={() => window.quenbot.hideWindow()} title="Hide">&times;</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-brand">QUENbot</span>
        <div className="titlebar-controls">
          <button className={`titlebar-btn titlebar-pin${floatWindow ? ' active' : ''}`}
            onClick={toggleFloat} title={floatWindow ? 'Unpin' : 'Pin on top'}>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5H8.5v5.543a.5.5 0 0 1-1 0V10H3.5a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A6 6 0 0 1 5 6.708V2.277a3 3 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
            </svg>
          </button>
          <button className="titlebar-btn" onClick={toggleMiniMode} title="Mini mode">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
              <path d="M3 7h10v2H3z"/>
            </svg>
          </button>
          <button className={`titlebar-btn titlebar-settings${showSettings ? ' active' : ''}`}
            onClick={() => setShowSettings(!showSettings)} title="Settings">&#9881;</button>
          <button className="titlebar-btn titlebar-minimize" onClick={() => window.quenbot.minimizeWindow()} title="Minimize">&ndash;</button>
          <button className="titlebar-btn titlebar-close" onClick={() => window.quenbot.hideWindow()} title="Hide to tray">&times;</button>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-bar-btn${activeTab === 'rec' && !showSettings ? ' active' : ''}`}
          onClick={() => handleTabClick('rec')}>REC</button>
        <button className={`tab-bar-btn${activeTab === 'jot' && !showSettings ? ' active' : ''}`}
          onClick={() => handleTabClick('jot')}>JOT</button>
        <button className={`tab-bar-btn${activeTab === 'log' && !showSettings ? ' active' : ''}`}
          onClick={() => handleTabClick('log')}>LOG</button>
      </div>

      <div className="tab-content">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)}
            currentTheme={theme} currentUiFontSize={uiFontSize}
            onThemeChange={(t, s) => { setTheme(t); setUiFontSize(s); }} />
        ) : (
          <>
            {activeTab === 'rec' && <RecTab />}
            {activeTab === 'jot' && <JotTab focusRequest={jotFocusRequest} />}
            {activeTab === 'log' && <FeedTab onNavigate={(tab) => setActiveTab(tab)} />}
          </>
        )}
      </div>

      <div className="app-footer">
        <span>
          {activeTab === 'rec' && '\u2191\u2193 select \u00b7 space play \u00b7 \u2190\u2192 seek'}
          {activeTab === 'jot' && 'ctrl+shift+\u2192 quick note \u00b7 right-click tab to lock'}
          {activeTab === 'log' && 'ctrl+1/2/3 switch tabs'}
        </span>
      </div>
    </div>
  );
};
