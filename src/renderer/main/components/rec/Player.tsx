import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Waveform } from './Waveform';

interface PlayerProps {
  audioBuffer: AudioBuffer | null;
  fileName: string;
}

type PlayState = 'stopped' | 'playing' | 'paused' | 'rewinding' | 'forwarding';

function generateClickSound(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * 0.05);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / sr;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.5;
  }
  return buffer;
}

export const Player: React.FC<PlayerProps> = ({ audioBuffer, fileName }) => {
  const [playState, setPlayState] = useState<PlayState>('stopped');
  const [currentTime, setCurrentTime] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const seekIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrubSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const clickBufRef = useRef<AudioBuffer | null>(null);
  const playStateRef = useRef<PlayState>('stopped');

  const duration = audioBuffer?.duration || 0;

  const updatePlayState = useCallback((state: PlayState) => {
    setPlayState(state);
    playStateRef.current = state;
  }, []);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      clickBufRef.current = generateClickSound(audioCtxRef.current);
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playClick = useCallback(() => {
    if (!clickBufRef.current) return;
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = clickBufRef.current;
    source.connect(ctx.destination);
    source.start();
  }, [getAudioContext]);

  // Play actual audio at high speed for reel-to-reel scrub effect
  const startScrubSound = useCallback((direction: 'forward' | 'reverse') => {
    if (!audioBuffer) return;
    const ctx = getAudioContext();

    // Stop previous scrub
    if (scrubSourceRef.current) {
      try { scrubSourceRef.current.stop(); } catch { /* ok */ }
      scrubSourceRef.current = null;
    }

    // Create a scrub buffer: take a chunk of audio around current position and play it sped up
    const sr = audioBuffer.sampleRate;
    const scrubDuration = 2; // seconds of scrub audio to generate
    const scrubLength = Math.floor(sr * scrubDuration);
    const scrubBuf = ctx.createBuffer(1, scrubLength, sr);
    const scrubData = scrubBuf.getChannelData(0);
    const srcData = audioBuffer.getChannelData(0);

    const startSample = Math.floor(offsetRef.current * sr);
    const speed = 4; // 4x playback speed for scrub

    for (let i = 0; i < scrubLength; i++) {
      let srcIdx: number;
      if (direction === 'reverse') {
        srcIdx = startSample - Math.floor(i * speed);
      } else {
        srcIdx = startSample + Math.floor(i * speed);
      }
      if (srcIdx >= 0 && srcIdx < srcData.length) {
        scrubData[i] = srcData[srcIdx] * 0.35; // Lower volume
      } else {
        scrubData[i] = 0;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = scrubBuf;
    source.connect(ctx.destination);
    source.loop = true;
    source.start();
    scrubSourceRef.current = source;
  }, [audioBuffer, getAudioContext]);

  const stopScrubSound = useCallback(() => {
    if (scrubSourceRef.current) {
      try { scrubSourceRef.current.stop(); } catch { /* ok */ }
      scrubSourceRef.current = null;
    }
  }, []);

  const animate = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioBuffer) return;
    const elapsed = ctx.currentTime - startTimeRef.current + offsetRef.current;
    setCurrentTime(Math.min(elapsed, duration));
    if (elapsed >= duration) {
      updatePlayState('stopped');
      offsetRef.current = 0;
      setCurrentTime(0);
      return;
    }
    animRef.current = requestAnimationFrame(animate);
  }, [audioBuffer, duration, updatePlayState]);

  const play = useCallback(() => {
    if (!audioBuffer) return;
    const ctx = getAudioContext();
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* ok */ } }

    const safeOffset = Math.max(0, Math.min(offsetRef.current, audioBuffer.duration - 0.01));
    offsetRef.current = (!isFinite(safeOffset) || safeOffset < 0) ? 0 : safeOffset;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0, offsetRef.current);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;

    source.onended = () => {
      if (playStateRef.current === 'playing') {
        updatePlayState('stopped');
        offsetRef.current = 0;
        setCurrentTime(0);
      }
    };

    updatePlayState('playing');
    animRef.current = requestAnimationFrame(animate);
    playClick();
  }, [audioBuffer, animate, getAudioContext, playClick, updatePlayState]);

  const pause = useCallback(() => {
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* ok */ } sourceRef.current = null; }
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    const ctx = audioCtxRef.current;
    if (ctx) {
      offsetRef.current += ctx.currentTime - startTimeRef.current;
      offsetRef.current = Math.min(offsetRef.current, duration);
    }
    updatePlayState('paused');
    playClick();
  }, [duration, playClick, updatePlayState]);

  const stopSeeking = useCallback(() => {
    if (seekIntervalRef.current) { clearInterval(seekIntervalRef.current); seekIntervalRef.current = null; }
    stopScrubSound();
    playClick();
    updatePlayState('paused');
  }, [playClick, stopScrubSound, updatePlayState]);

  const startRewind = useCallback(() => {
    if (!audioBuffer) return;
    if (seekIntervalRef.current) clearInterval(seekIntervalRef.current);
    pause();
    updatePlayState('rewinding');
    startScrubSound('reverse');
    seekIntervalRef.current = setInterval(() => {
      offsetRef.current = Math.max(0, offsetRef.current - 0.5);
      setCurrentTime(offsetRef.current);
      // Auto-stop at beginning
      if (offsetRef.current <= 0) {
        stopSeeking();
      }
    }, 50);
  }, [audioBuffer, pause, startScrubSound, stopSeeking, updatePlayState]);

  const startForward = useCallback(() => {
    if (!audioBuffer) return;
    if (seekIntervalRef.current) clearInterval(seekIntervalRef.current);
    pause();
    updatePlayState('forwarding');
    startScrubSound('forward');
    seekIntervalRef.current = setInterval(() => {
      offsetRef.current = Math.min(duration, offsetRef.current + 0.5);
      setCurrentTime(offsetRef.current);
      // Auto-stop at end
      if (offsetRef.current >= duration) {
        stopSeeking();
      }
    }, 50);
  }, [audioBuffer, duration, pause, startScrubSound, stopSeeking, updatePlayState]);

  useEffect(() => {
    if (!audioBuffer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (playState === 'playing') pause();
          else if (playState === 'stopped' || playState === 'paused') play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (playState !== 'rewinding') startRewind();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (playState !== 'forwarding') startForward();
          break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' && playState === 'rewinding') stopSeeking();
      if (e.code === 'ArrowRight' && playState === 'forwarding') stopSeeking();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [audioBuffer, playState, play, pause, startRewind, startForward, stopSeeking]);

  useEffect(() => {
    return () => {
      if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* ok */ } }
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (seekIntervalRef.current) clearInterval(seekIntervalRef.current);
      stopScrubSound();
    };
  }, [audioBuffer, stopScrubSound]);

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!audioBuffer) {
    return (<div className="player-empty"><span className="player-empty-text">select a recording</span></div>);
  }

  return (
    <div className="player">
      <Waveform audioBuffer={audioBuffer} currentTime={currentTime} duration={duration} height={80} />
      <div className="player-transport">
        <div className="player-status">
          {playState === 'playing' && <span className="status-playing">▶ PLAY</span>}
          {playState === 'paused' && <span className="status-paused">❚❚ PAUSE</span>}
          {playState === 'stopped' && <span className="status-stopped">■ STOP</span>}
          {playState === 'rewinding' && <span className="status-rw">◀◀ REW</span>}
          {playState === 'forwarding' && <span className="status-ff">▶▶ FF</span>}
        </div>
        <div className="player-time">
          <span className="time-current">{formatTime(currentTime)}</span>
          <span className="time-separator">/</span>
          <span className="time-total">{formatTime(duration)}</span>
        </div>
        <div className="player-file">{fileName}</div>
      </div>
    </div>
  );
};
