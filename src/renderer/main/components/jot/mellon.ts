// Easter egg: the Doors of Durin. Typing "Speak friend and" on a line in a note
// and pressing Enter opens the door and shows the password, "Mellon".
import doorArt from '../../assets/mellon-door.txt?raw';
import mellonSoundUrl from '../../assets/mellon.wav?url';

export const MELLON_WORD = 'Mellon.';
export const MELLON_ART = doorArt.replace(/\r/g, '').replace(/\n+$/, '');

const TRIGGERS = new Set(['speak friend and', 'speak friend and enter']);

/** Lowercase, drop punctuation, and collapse whitespace, so "Speak, friend, and" matches too. */
function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True when a line of text is the door's riddle, however it is capitalised or punctuated. */
export function isMellonPhrase(line: string): boolean {
  return TRIGGERS.has(normalize(line));
}

let sound: HTMLAudioElement | null = null;

export function playMellonSound(): void {
  sound ??= new Audio(mellonSoundUrl);
  sound.currentTime = 0;
  sound.play().catch(() => { /* no audio output available; the door still opens */ });
}
