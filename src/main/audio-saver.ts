import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const RECORDINGS_DIR = join(homedir(), 'Music', 'quenbot');

export async function ensureRecordingsDir(): Promise<string> {
  if (!existsSync(RECORDINGS_DIR)) {
    await mkdir(RECORDINGS_DIR, { recursive: true });
  }
  return RECORDINGS_DIR;
}

export function getRecordingsDir(): string { return RECORDINGS_DIR; }

function encodeWAV(samples: Float32Array, sampleRate: number, numChannels: number): Buffer {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(val), offset);
    offset += 2;
  }
  return buffer;
}

export async function saveRecording(audioData: ArrayBuffer, sampleRate: number, channels: number): Promise<string> {
  await ensureRecordingsDir();
  const samples = new Float32Array(audioData);
  const wavBuffer = encodeWAV(samples, sampleRate, channels);
  const now = new Date();
  const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\.(\d{3})Z$/, '-$1');
  const filename = `REC_${timestamp}.wav`;
  const filepath = join(RECORDINGS_DIR, filename);
  await writeFile(filepath, wavBuffer);
  return filepath;
}
