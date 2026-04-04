import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { Note } from '../shared/types';

let notes: Note[] = [];
let filePath = '';

export function init(): void {
  filePath = join(app.getPath('userData'), 'notes.json');
  if (existsSync(filePath)) {
    try {
      notes = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      notes = [];
    }
  }
  if (notes.length === 0) {
    notes = [{
      id: Date.now().toString(),
      title: '',
      content: '<p></p>',
      locked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: 0,
    }];
    persist();
  }
}

function persist(): void {
  try {
    writeFileSync(filePath, JSON.stringify(notes, null, 2));
  } catch (err) {
    console.error('Failed to persist notes:', err);
  }
}

export function getAll(): Note[] {
  return [...notes].sort((a, b) => a.order - b.order);
}

export function save(note: Note): void {
  const idx = notes.findIndex(n => n.id === note.id);
  note.updatedAt = new Date().toISOString();
  if (idx >= 0) {
    notes[idx] = note;
  } else {
    note.createdAt = note.createdAt || new Date().toISOString();
    note.order = notes.length;
    notes.push(note);
  }
  persist();
}

export function remove(id: string): void {
  notes = notes.filter(n => n.id !== id);
  persist();
}

export function reorder(ids: string[]): void {
  ids.forEach((id, i) => {
    const note = notes.find(n => n.id === id);
    if (note) note.order = i;
  });
  persist();
}
