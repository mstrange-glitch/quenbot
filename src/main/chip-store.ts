import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

interface Chip {
  id: string;
  name: string;
  color: string;
}

let chips: Chip[] = [];
let filePath = '';

const DEFAULT_CHIPS: Chip[] = [
  { id: 'work', name: 'Work', color: '#2463eb' },
  { id: 'personal', name: 'Personal', color: '#22863a' },
  { id: 'idea', name: 'Idea', color: '#d97706' },
  { id: 'urgent', name: 'Urgent', color: '#9A2424' },
];

export function init(): void {
  filePath = join(app.getPath('userData'), 'chips.json');
  if (existsSync(filePath)) {
    try {
      chips = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      chips = [...DEFAULT_CHIPS];
    }
  } else {
    chips = [...DEFAULT_CHIPS];
    persist();
  }
}

function persist(): void {
  try {
    writeFileSync(filePath, JSON.stringify(chips, null, 2));
  } catch (err) {
    console.error('Failed to persist chips:', err);
  }
}

export function getAll(): Chip[] {
  return [...chips];
}

export function add(name: string, color: string): Chip {
  const chip: Chip = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 4),
    name,
    color,
  };
  chips.push(chip);
  persist();
  return chip;
}

export function remove(id: string): void {
  chips = chips.filter(c => c.id !== id);
  persist();
}

export function update(id: string, name: string, color: string): void {
  const chip = chips.find(c => c.id === id);
  if (chip) {
    chip.name = name;
    chip.color = color;
    persist();
  }
}
