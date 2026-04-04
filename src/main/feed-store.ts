import { readFileSync, writeFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { app, shell } from 'electron';
import type { FeedItem, FeedItemType } from '../shared/types';

let items: FeedItem[] = [];
let filePath = '';

export function init(): void {
  filePath = join(app.getPath('userData'), 'feed.json');
  if (existsSync(filePath)) {
    try {
      items = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      items = [];
    }
  }
}

function persist(): void {
  try {
    writeFileSync(filePath, JSON.stringify(items, null, 2));
  } catch (err) {
    console.error('Failed to persist feed:', err);
  }
}

export function addItem(entry: {
  type: FeedItemType;
  title: string;
  preview: string;
  refId: string;
  size?: number;
  duration?: number;
}): void {
  items.unshift({
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    type: entry.type,
    title: entry.title,
    preview: entry.preview,
    timestamp: new Date().toISOString(),
    refId: entry.refId,
    size: entry.size,
    duration: entry.duration,
  });
  if (items.length > 500) items = items.slice(0, 500);
  persist();
}

export function removeItem(id: string): void {
  items = items.filter(i => i.id !== id);
  persist();
}

export function clearAll(): void {
  items = [];
  persist();
}

export function getItems(limit = 100, before?: string, filter?: string, sortBy?: string): FeedItem[] {
  let filtered = [...items];

  if (before) {
    const idx = filtered.findIndex(i => i.id === before);
    if (idx >= 0) filtered = filtered.slice(idx + 1);
  }

  // Type filter
  if (filter && filter !== 'all') {
    filtered = filtered.filter(i => i.type === filter);
  }

  // Sort
  if (sortBy === 'oldest') {
    filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } else if (sortBy === 'title') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'type') {
    filtered.sort((a, b) => a.type.localeCompare(b.type));
  }
  // Default: newest first (already in order from unshift)

  return filtered.slice(0, limit);
}

export async function exportItemAsFile(item: FeedItem, format: 'md' | 'txt'): Promise<string> {
  const downloadsDir = app.getPath('downloads');
  const safeName = item.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
  const ext = format === 'md' ? '.md' : '.txt';
  const filename = `${safeName}_${Date.now()}${ext}`;
  const filepath = join(downloadsDir, filename);

  let content: string;
  if (format === 'md') {
    content = `# ${item.title}\n\n`;
    content += `**Type:** ${item.type}\n`;
    content += `**Date:** ${new Date(item.timestamp).toLocaleString()}\n`;
    if (item.refId) content += `**Reference:** ${item.refId}\n`;
    content += `\n---\n\n`;
    content += item.preview || '(no content)';
  } else {
    content = `${item.title}\n`;
    content += `Type: ${item.type}\n`;
    content += `Date: ${new Date(item.timestamp).toLocaleString()}\n`;
    if (item.refId) content += `Reference: ${item.refId}\n`;
    content += `\n`;
    content += item.preview || '(no content)';
  }

  await writeFile(filepath, content, 'utf-8');
  return filepath;
}

export async function openItemFile(refId: string): Promise<void> {
  if (existsSync(refId)) {
    shell.showItemInFolder(refId);
  }
}
