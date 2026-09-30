import React, { useState, useRef } from 'react';

import type { Note } from '../../../../shared/types';

interface NoteTabsProps {
  notes: Note[];
  currentId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onToggleLock: (id: string) => void;
  onReorder: (reordered: Note[]) => void;
}

function getDisplayTitle(note: Note, maxLen = 12): string {
  if (note.title) {
    return note.title.length > maxLen ? note.title.substring(0, maxLen) + '..' : note.title;
  }
  if (!note.content) return 'Untitled';
  const tmp = document.createElement('div');
  tmp.innerHTML = note.content;
  const text = (tmp.textContent || tmp.innerText || '').trim();
  const firstLine = text.split('\n')[0] || 'Untitled';
  return firstLine.length > maxLen ? firstLine.substring(0, maxLen) + '..' : firstLine;
}

export const NoteTabs: React.FC<NoteTabsProps> = ({
  notes, currentId, onSelect, onAdd, onDelete, onRename, onToggleLock, onReorder,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = (note: Note) => {
    setEditingId(note.id);
    setEditValue(note.title || '');
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (isNaN(dragIndex) || dragIndex === dropIndex) return;
    const reordered = [...notes];
    const [dragged] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, dragged);
    onReorder(reordered);
  };

  return (
    <div className="note-tabs-bar">
      <div className="note-tabs-scroll">
        {notes.map((note, index) => (
          <div
            key={note.id}
            className={`note-tab${note.id === currentId ? ' active' : ''}${note.locked ? ' locked' : ''}`}
            onClick={() => onSelect(note.id)}
            onDoubleClick={() => startRename(note)}
            onContextMenu={(e) => { e.preventDefault(); onToggleLock(note.id); }}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => handleDrop(e, index)}
            title={note.locked ? 'Right-click to unlock' : 'Right-click to lock'}
          >
            {editingId === note.id ? (
              <input
                ref={inputRef}
                className="note-tab-edit"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
              />
            ) : (
              <span className="note-tab-title">
                {getDisplayTitle(note)}
                {note.chips && note.chips.length > 0 && (
                  <span className="note-tab-chips">
                    {note.chips.slice(0, 3).map(cid => (
                      <span key={cid} className="note-tab-chip-dot" />
                    ))}
                  </span>
                )}
              </span>
            )}
            {note.locked ? (
              <span className="note-tab-icon lock">&#x1f512;</span>
            ) : (
              notes.length > 1 && editingId !== note.id && (
                <span className="note-tab-icon close" onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}>&times;</span>
              )
            )}
          </div>
        ))}
      </div>
      <div className="note-tab add" onClick={onAdd}>+</div>
    </div>
  );
};
