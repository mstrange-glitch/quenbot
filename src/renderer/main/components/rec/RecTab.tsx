import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Player } from './Player';
import { RecordingList } from './RecordingList';
import './rec.css';

import type { RecordingFile } from '../../../../shared/types';
import { shouldIgnoreShortcut } from '../../lib/keys';

export const RecTab: React.FC = () => {
  const [recordings, setRecordings] = useState<RecordingFile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [isManualRecording, setIsManualRecording] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(44100);

  const loadRecordings = useCallback(async () => {
    const recs = await window.quenbot.getRecordings();
    setRecordings(recs);
    if (recs.length > 0 && selectedIndex === -1) {
      setSelectedIndex(0);
    }
  }, [selectedIndex]);

  const loadAudio = useCallback(async (path: string) => {
    setLoading(true);
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const arrayBuffer = await window.quenbot.readAudioFile(path);
      const decoded = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
    } catch (err) {
      console.error('Failed to load audio:', err);
      setAudioBuffer(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  useEffect(() => {
    window.quenbot.onRecordingsUpdated(() => { loadRecordings(); });
    return () => { window.quenbot.removeAllListeners('recordings-updated'); };
  }, [loadRecordings]);

  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < recordings.length) {
      loadAudio(recordings[selectedIndex].path);
    } else {
      setAudioBuffer(null);
    }
  }, [selectedIndex, recordings, loadAudio]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(recordings.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recordings.length]);

  const handleDelete = useCallback(async (index: number) => {
    const rec = recordings[index];
    if (!confirm(`Delete "${rec.name}"?`)) return;
    try {
      await window.quenbot.deleteRecording(rec.path);
      setSelectedIndex((prev) => {
        if (prev >= recordings.length - 1) return Math.max(0, recordings.length - 2);
        return prev;
      });
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [recordings]);

  const handleRename = useCallback(async (index: number, newName: string) => {
    const rec = recordings[index];
    try {
      await window.quenbot.renameRecording(rec.path, newName);
    } catch (err) {
      console.error('Rename failed:', err);
    }
  }, [recordings]);

  const startManualRecording = useCallback(async () => {
    try {
      let deviceId: string | undefined;
      try {
        const settings = await window.quenbot.getSettings();
        if (settings?.audioDeviceId) deviceId = settings.audioDeviceId as string;
      } catch { /* default */ }

      const constraints: MediaTrackConstraints = {
        echoCancellation: false, noiseSuppression: false, autoGainControl: true,
      };
      if (deviceId) constraints.deviceId = { exact: deviceId };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        });
      }
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      recContextRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const scriptNode = ctx.createScriptProcessor(8192, 1, 1);
      scriptNodeRef.current = scriptNode;
      chunksRef.current = [];
      scriptNode.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(scriptNode);
      scriptNode.connect(ctx.destination);
      setIsManualRecording(true);
    } catch (err) {
      console.error('Manual recording failed:', err);
    }
  }, []);

  const stopManualRecording = useCallback(async () => {
    setIsManualRecording(false);
    if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }

    const chunks = chunksRef.current;
    if (chunks.length > 0) {
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      try {
        await window.quenbot.sendAudioData(merged.buffer, sampleRateRef.current, 1);
      } catch (err) {
        console.error('Failed to save manual recording:', err);
      }
    }
    chunksRef.current = [];
    if (recContextRef.current && recContextRef.current.state !== 'closed') {
      try { await recContextRef.current.close(); } catch { /* ok */ }
      recContextRef.current = null;
    }
  }, []);

  const selectedName = selectedIndex >= 0 && selectedIndex < recordings.length
    ? recordings[selectedIndex].name : '';

  return (
    <div className="rec-tab">
      <div className="player-section">
        <Player audioBuffer={audioBuffer} fileName={selectedName} />
        {loading && <div className="loading-indicator">loading...</div>}
      </div>
      <div className="divider" />
      <div className="list-section">
        <div className="list-header">
          <span className="list-title">recordings</span>
          <div className="list-header-right">
            <button
              className={`rec-btn${isManualRecording ? ' recording' : ''}`}
              onClick={isManualRecording ? stopManualRecording : startManualRecording}
              title={isManualRecording ? 'Stop recording' : 'Start recording'}
            >
              <span className="rec-btn-dot" />
              <span className="rec-btn-label">{isManualRecording ? 'STOP' : 'REC'}</span>
            </button>
            <span className="list-count">{recordings.length}</span>
          </div>
        </div>
        <RecordingList
          recordings={recordings}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      </div>
    </div>
  );
};
