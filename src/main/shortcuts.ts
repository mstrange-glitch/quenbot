import { uIOhook, UiohookKey } from 'uiohook-napi';
import { getKeycode } from './keycode-map';
import { createWidget, destroyWidget } from './windows';
import { setTrayRecording } from './tray';

let isPushRecording = false;
let isLockRecording = false;
let isStealthRecording = false;
let isTranscribing = false;

let ctrlDown = false;
let shiftDown = false;
let pushKeyDown = false;
let transcribeKeyDown = false;

let lastPushDown = 0;
let lastLockToggle = 0;
let lastStealthToggle = 0;
let lastQuickNote = 0;
let lastTranscribe = 0;
const DEBOUNCE_MS = 300;

let pushKeycode: number = UiohookKey.ArrowLeft;
let lockKeycode: number = UiohookKey.ArrowUp;
let stealthKeycode: number = UiohookKey.ArrowDown;
let quickNoteKeycode: number = UiohookKey.ArrowRight;
let transcribeKeycode: number = UiohookKey.ArrowRight; // Ctrl+Right (no Shift)

let stealthStartCallback: (() => void) | null = null;
let stealthStopCallback: (() => void) | null = null;
let quickNoteCallback: (() => void) | null = null;
let transcribeStartCallback: (() => void) | null = null;
let transcribeStopCallback: (() => void) | null = null;

export function setStealthCallbacks(onStart: () => void, onStop: () => void): void {
  stealthStartCallback = onStart;
  stealthStopCallback = onStop;
}

export function setQuickNoteCallback(cb: () => void): void {
  quickNoteCallback = cb;
}

export function setTranscribeCallbacks(onStart: () => void, onStop: () => void): void {
  transcribeStartCallback = onStart;
  transcribeStopCallback = onStop;
}

export function isAnyRecording(): boolean {
  return isPushRecording || isLockRecording || isStealthRecording;
}

export function resetRecordingState(): void {
  isPushRecording = false;
  isLockRecording = false;
  pushKeyDown = false;
  setTrayRecording(false);
}

export function loadHotkeyConfig(hotkeys?: {
  pushRecord?: { modifiers: string[]; key: string };
  lockRecord?: { modifiers: string[]; key: string };
  stealthRecord?: { modifiers: string[]; key: string };
  quickNote?: { modifiers: string[]; key: string };
  transcribe?: { modifiers: string[]; key: string };
}): void {
  if (!hotkeys) return;
  if (hotkeys.pushRecord?.key) { const c = getKeycode(hotkeys.pushRecord.key); if (c !== undefined) pushKeycode = c; }
  if (hotkeys.lockRecord?.key) { const c = getKeycode(hotkeys.lockRecord.key); if (c !== undefined) lockKeycode = c; }
  if (hotkeys.stealthRecord?.key) { const c = getKeycode(hotkeys.stealthRecord.key); if (c !== undefined) stealthKeycode = c; }
  if (hotkeys.quickNote?.key) { const c = getKeycode(hotkeys.quickNote.key); if (c !== undefined) quickNoteKeycode = c; }
  if (hotkeys.transcribe?.key) { const c = getKeycode(hotkeys.transcribe.key); if (c !== undefined) transcribeKeycode = c; }
}

export function initShortcuts(): void {
  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) { ctrlDown = true; return; }
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) { shiftDown = true; return; }

    // Ctrl+Right (NO Shift) — Push-to-transcribe (Handy-style)
    if (ctrlDown && !shiftDown && e.keycode === transcribeKeycode) {
      if (transcribeKeyDown) return;
      const now = Date.now();
      if (now - lastTranscribe < DEBOUNCE_MS) return;
      lastTranscribe = now;
      transcribeKeyDown = true;
      if (!isTranscribing && !isAnyRecording()) {
        isTranscribing = true;
        setTrayRecording(true);
        if (transcribeStartCallback) transcribeStartCallback();
      }
      return;
    }

    if (!ctrlDown || !shiftDown) return;
    const now = Date.now();

    // Push-to-record
    if (e.keycode === pushKeycode) {
      if (pushKeyDown) return;
      if (now - lastPushDown < DEBOUNCE_MS) return;
      lastPushDown = now;
      pushKeyDown = true;
      if (!isPushRecording && !isLockRecording && !isStealthRecording && !isTranscribing) {
        isPushRecording = true;
        setTrayRecording(true);
        createWidget('push');
      }
    }

    // Lock-record toggle
    if (e.keycode === lockKeycode) {
      if (now - lastLockToggle < DEBOUNCE_MS) return;
      lastLockToggle = now;
      if (isLockRecording) {
        isLockRecording = false;
        setTrayRecording(false);
        destroyWidget();
      } else if (!isPushRecording && !isStealthRecording && !isTranscribing) {
        isLockRecording = true;
        setTrayRecording(true);
        createWidget('lock');
      }
    }

    // Stealth toggle
    if (e.keycode === stealthKeycode) {
      if (now - lastStealthToggle < DEBOUNCE_MS) return;
      lastStealthToggle = now;
      if (isStealthRecording) {
        isStealthRecording = false;
        setTrayRecording(false);
        if (stealthStopCallback) stealthStopCallback();
      } else if (!isPushRecording && !isLockRecording && !isTranscribing) {
        isStealthRecording = true;
        setTrayRecording(true);
        if (stealthStartCallback) stealthStartCallback();
      }
    }

    // Quick note
    if (e.keycode === quickNoteKeycode) {
      if (now - lastQuickNote < DEBOUNCE_MS) return;
      lastQuickNote = now;
      if (!isAnyRecording() && !isTranscribing && quickNoteCallback) quickNoteCallback();
    }
  });

  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) {
      ctrlDown = false;
      if (isPushRecording) { isPushRecording = false; pushKeyDown = false; setTrayRecording(false); destroyWidget(); }
      if (isTranscribing) { isTranscribing = false; transcribeKeyDown = false; setTrayRecording(false); if (transcribeStopCallback) transcribeStopCallback(); }
      return;
    }
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) {
      shiftDown = false;
      if (isPushRecording) { isPushRecording = false; pushKeyDown = false; setTrayRecording(false); destroyWidget(); }
      return;
    }
    if (e.keycode === pushKeycode) {
      pushKeyDown = false;
      if (isPushRecording) { isPushRecording = false; setTrayRecording(false); destroyWidget(); }
    }
    // Transcribe key released
    if (e.keycode === transcribeKeycode) {
      transcribeKeyDown = false;
      if (isTranscribing) { isTranscribing = false; setTrayRecording(false); if (transcribeStopCallback) transcribeStopCallback(); }
    }
  });

  uIOhook.start();
}

export function stopShortcuts(): void {
  try {
    isPushRecording = false; isLockRecording = false; isStealthRecording = false; isTranscribing = false;
    ctrlDown = false; shiftDown = false; pushKeyDown = false; transcribeKeyDown = false;
    uIOhook.removeAllListeners();
    uIOhook.stop();
  } catch { /* ignore */ }
}
