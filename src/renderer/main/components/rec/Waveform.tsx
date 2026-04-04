import React, { useRef, useEffect, useCallback } from 'react';

interface WaveformProps {
  audioBuffer: AudioBuffer;
  currentTime: number;
  duration: number;
  height?: number;
}

export const Waveform: React.FC<WaveformProps> = ({ audioBuffer, currentTime, duration, height = 80 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barCacheRef = useRef<{ width: number; buffer: AudioBuffer; bars: number[] }>({ width: 0, buffer: null as any, bars: [] });

  const computeBars = useCallback((canvasWidth: number): number[] => {
    // Return cached bars if canvas width and buffer haven't changed
    const cache = barCacheRef.current;
    if (cache.width === canvasWidth && cache.buffer === audioBuffer && cache.bars.length > 0) {
      return cache.bars;
    }

    if (!audioBuffer || canvasWidth <= 0) return [];

    const barWidth = 3;
    const gap = 1;
    const numBars = Math.floor(canvasWidth / (barWidth + gap));
    if (numBars <= 0) return [];

    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.floor(channelData.length / numBars);
    if (samplesPerBar <= 0) return [];

    const bars: number[] = [];
    for (let i = 0; i < numBars; i++) {
      let sumSq = 0;
      const start = i * samplesPerBar;
      for (let j = start; j < start + samplesPerBar && j < channelData.length; j++) {
        sumSq += channelData[j] * channelData[j];
      }
      // RMS gives better visual weight to quiet audio than simple average
      bars.push(Math.sqrt(sumSq / samplesPerBar));
    }
    const max = Math.max(...bars, 0.001);
    // Apply sqrt curve to boost quiet sections visually
    const normalized = bars.map((b) => Math.pow(b / max, 0.6));

    barCacheRef.current = { width: canvasWidth, buffer: audioBuffer, bars: normalized };
    return normalized;
  }, [audioBuffer]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sync canvas pixel size with CSS layout size
    const layoutW = canvas.offsetWidth;
    const layoutH = canvas.offsetHeight;
    if (layoutW <= 0 || layoutH <= 0) return;
    if (canvas.width !== layoutW || canvas.height !== layoutH) {
      canvas.width = layoutW;
      canvas.height = layoutH;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barData = computeBars(w);
    if (barData.length === 0) return;

    const barWidth = 3;
    const gap = 1;
    const progress = duration > 0 ? currentTime / duration : 0;
    const playedBars = Math.floor(progress * barData.length);

    for (let i = 0; i < barData.length; i++) {
      const barH = Math.max(2, barData[i] * (h - 4));
      const x = i * (barWidth + gap);
      const y = (h - barH) / 2;
      if (i < playedBars) {
        ctx.fillStyle = '#9A2424';
      } else if (i === playedBars) {
        ctx.fillStyle = '#C43030';
      } else {
        ctx.fillStyle = '#4A4A4A';
      }
      ctx.fillRect(x, y, barWidth, barH);
    }
  }, [computeBars, currentTime, duration]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => { draw(); });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  return <canvas ref={canvasRef} className="waveform-canvas" style={{ width: '100%', height: `${height}px`, display: 'block' }} />;
};
