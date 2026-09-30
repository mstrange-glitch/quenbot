import React, { useState, useEffect, useRef, useCallback } from 'react';

export const Widget: React.FC = () => {
  const [mode, setMode] = useState<'push' | 'lock' | 'stealth' | 'transcribe'>('push');
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const transcriptRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(44100);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recordingRef = useRef(false);
  const deviceIdRef = useRef<string | undefined>(undefined);

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const drawWaveform = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
      canvas.width = canvas.offsetWidth || 180;
      canvas.height = canvas.offsetHeight || 28;
    }
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    if (recordingRef.current) {
      animFrameRef.current = requestAnimationFrame(drawWaveform);
    }
  }, []);

  const startRecording = useCallback(async () => {
    console.log('[Widget] startRecording called');
    setError('');
    try {
      try {
        const settings = await window.quenbot.getSettings();
        if (settings?.audioDeviceId) {
          deviceIdRef.current = settings.audioDeviceId as string;
        }
      } catch { /* use default */ }

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false, noiseSuppression: false, autoGainControl: true,
      };
      if (deviceIdRef.current) {
        audioConstraints.deviceId = { exact: deviceIdRef.current };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (deviceErr: any) {
        if (deviceIdRef.current) {
          console.warn('[Widget] Saved device failed, falling back to default:', deviceErr.message);
          deviceIdRef.current = undefined;
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
          });
        } else {
          throw deviceErr;
        }
      }
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const scriptNode = audioContext.createScriptProcessor(8192, 1, 1);
      scriptNodeRef.current = scriptNode;
      chunksRef.current = [];
      scriptNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(inputData));
      };
      source.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      recordingRef.current = true;
      setIsRecording(true);
      setDuration(0);
      animFrameRef.current = requestAnimationFrame(drawWaveform);
      timerRef.current = setInterval(() => { setDuration((d) => d + 1); }, 1000);
    } catch (err: any) {
      console.error('[Widget] Failed to start recording:', err);
      setError(err.message || 'Mic access failed');
    }
  }, [drawWaveform]);

  const stopRecording = useCallback(async () => {
    console.log('[Widget] stopRecording called, chunks:', chunksRef.current.length);
    recordingRef.current = false;
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }

    const chunks = chunksRef.current;
    if (chunks.length > 0) {
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const path = await window.quenbot.sendAudioData(merged.buffer, sampleRateRef.current, 1);
          console.log('[Widget] Audio saved to:', path);
          break;
        } catch (err) {
          console.error(`[Widget] Save attempt ${attempt + 1} failed:`, err);
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    chunksRef.current = [];
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { await audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }
    setIsRecording(false);
    try { window.quenbot.signalSaveComplete(); } catch { /* ignore */ }
  }, []);

  // Transcription (VTT — record audio, send to main for onnx-asr)
  const startTranscription = useCallback(async () => {
    console.log('[Widget] Starting VTT recording...');
    setTranscriptText('');
    setError('');
    try {
      let deviceId: string | undefined;
      try {
        const settings = await window.quenbot.getSettings();
        if (settings?.audioDeviceId) deviceId = settings.audioDeviceId as string;
      } catch {}

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
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const scriptNode = audioContext.createScriptProcessor(8192, 1, 1);
      scriptNodeRef.current = scriptNode;
      chunksRef.current = [];
      scriptNode.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      recordingRef.current = true;
      setIsRecording(true);
      animFrameRef.current = requestAnimationFrame(drawWaveform);
    } catch (err: any) {
      console.error('[Widget] VTT recording failed:', err);
      setError(err.message || 'Mic access failed');
    }
  }, [drawWaveform]);

  const stopTranscription = useCallback(async () => {
    console.log('[Widget] Stopping VTT, processing audio...');
    recordingRef.current = false;
    setIsRecording(false);

    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }

    const chunks = chunksRef.current;
    if (chunks.length > 0) {
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

      try {
        const result = await window.quenbot.transcribeAudio(merged.buffer, sampleRateRef.current);
        transcriptRef.current = result || '';
        console.log('[Widget] Transcript:', result);
      } catch (err) {
        console.error('[Widget] Transcription failed:', err);
      }
    }

    chunksRef.current = [];
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { await audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }

    // Send result to main for clipboard
    try {
      window.quenbot.sendTranscriptionResult(transcriptRef.current);
    } catch {}
  }, []);

  useEffect(() => {
    window.quenbot.onWidgetMode((m: string) => { setMode(m as 'push' | 'lock' | 'stealth' | 'transcribe'); });
    window.quenbot.onStartRecording(() => { startRecording(); });
    window.quenbot.onStopRecording(() => { stopRecording(); });

    // Transcription listeners
    window.quenbot.onStartTranscription?.(() => { startTranscription(); });
    window.quenbot.onStopTranscription?.(() => { stopTranscription(); });

    return () => {
      window.quenbot.removeAllListeners('set-widget-mode');
      window.quenbot.removeAllListeners('start-recording');
      window.quenbot.removeAllListeners('stop-recording');
      window.quenbot.removeAllListeners('start-transcription');
      window.quenbot.removeAllListeners('stop-transcription');
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startRecording, stopRecording, startTranscription, stopTranscription]);

  if (mode === 'stealth') return null;

  if (mode === 'transcribe') {
    return (
      <div className="widget-container">
        <canvas ref={canvasRef} className="widget-waveform" width="180" height="28" />
      </div>
    );
  }

  return (
    <div className="widget-container">
      {mode === 'lock' && (
        <div className="widget-header">
          <div className="rec-indicator">
            <div className="rec-dot" />
            <span className="rec-label">REC</span>
          </div>
          <span className="timer">{formatTime(duration)}</span>
        </div>
      )}
      <canvas ref={canvasRef} className="widget-waveform" width="180" height="28" />
      {error && <div style={{ color: '#9A2424', fontSize: '9px', textAlign: 'center' }}>{error}</div>}
    </div>
  );
};
