import React, { useState, useRef } from 'react';

import type { RecordingFile } from '../../../../shared/types';

interface RecordingListProps {
  recordings: RecordingFile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onRename: (index: number, newName: string) => void;
}

export const RecordingList: React.FC<RecordingListProps> = ({
  recordings, selectedIndex, onSelect, onDelete, onRename,
}) => {
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const startRename = (index: number) => {
    const name = recordings[index].name.replace(/\.wav$/, '');
    setEditingIndex(index);
    setEditValue(name);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = (index: number) => {
    if (editValue.trim() && editValue.trim() !== recordings[index].name.replace(/\.wav$/, '')) {
      onRename(index, editValue.trim());
    }
    setEditingIndex(-1);
  };

  if (recordings.length === 0) {
    return (
      <div className="recording-list-empty">
        <span className="empty-label">no recordings yet</span>
        <span className="empty-hint">Ctrl+Shift+Left to record</span>
      </div>
    );
  }

  return (
    <div className="recording-list">
      {recordings.map((rec, i) => (
        <div
          key={rec.path}
          className={`recording-item${i === selectedIndex ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
          onDoubleClick={() => startRename(i)}
        >
          <div className="recording-item-content">
            {editingIndex === i ? (
              <input
                ref={inputRef}
                className="recording-rename-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(i);
                  if (e.key === 'Escape') setEditingIndex(-1);
                }}
              />
            ) : (
              <>
                <div className="recording-name">{rec.name.replace(/\.wav$/, '')}</div>
                <div className="recording-meta">
                  <span>{formatDate(rec.date)}</span>
                  <span>{formatSize(rec.size)}</span>
                </div>
              </>
            )}
          </div>
          <button className="recording-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(i); }}>×</button>
        </div>
      ))}
    </div>
  );
};
