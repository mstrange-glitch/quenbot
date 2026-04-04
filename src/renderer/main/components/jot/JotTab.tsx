import React, { useState, useEffect, useCallback } from 'react';
import { NoteEditor } from './NoteEditor';
import { NoteTabs } from './NoteTabs';
import { ChipBar } from './ChipBar';
import './jot.css';
import './chipbar.css';

interface Note {
  id: string;
  title: string;
  content: string;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  order: number;
  chips?: string[];
}

export const JotTab: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentId, setCurrentId] = useState<string>('');

  const loadNotes = useCallback(async () => {
    const loaded = await window.quenbot.getNotes();
    setNotes(loaded);
    if (loaded.length > 0 && (!currentId || !loaded.find((n: Note) => n.id === currentId))) {
      setCurrentId(loaded[0].id);
    }
  }, [currentId]);

  useEffect(() => { loadNotes(); }, []);

  useEffect(() => {
    window.quenbot.onNotesUpdated(() => { loadNotes(); });
    return () => { window.quenbot.removeAllListeners('notes-updated'); };
  }, [loadNotes]);

  const currentNote = notes.find(n => n.id === currentId) || notes[0] || null;

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = React.useRef<Set<string>>(new Set());

  const handleContentChange = useCallback((content: string) => {
    if (!currentNote) return;

    // Skip the initial onUpdate from TipTap when content is first loaded
    if (!initialLoadRef.current.has(currentNote.id)) {
      initialLoadRef.current.add(currentNote.id);
      return;
    }

    const updated = { ...currentNote, content, updatedAt: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === currentNote.id ? updated : n));

    // Debounce saves — only persist after 800ms of inactivity
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      window.quenbot.saveNote(updated as any);
    }, 800);
  }, [currentNote]);

  const handleAddNote = useCallback(() => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: '',
      content: '<p></p>',
      locked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: notes.length,
    };
    setNotes(prev => [...prev, newNote]);
    setCurrentId(newNote.id);
    window.quenbot.saveNote(newNote as any, true);
  }, [notes.length]);

  const handleDeleteNote = useCallback((id: string) => {
    if (notes.length <= 1) return;
    const noteToDelete = notes.find(n => n.id === id);
    if (noteToDelete?.locked) return;
    setNotes(prev => prev.filter(n => n.id !== id));
    if (currentId === id) {
      const remaining = notes.filter(n => n.id !== id);
      setCurrentId(remaining[remaining.length - 1]?.id || '');
    }
    window.quenbot.deleteNote(id);
  }, [notes, currentId]);

  const handleRenameNote = useCallback((id: string, title: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, title, updatedAt: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
    window.quenbot.saveNote(updated as any);
  }, [notes]);

  const handleToggleLock = useCallback((id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, locked: !note.locked, updatedAt: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
    window.quenbot.saveNote(updated as any);
  }, [notes]);

  const handleReorder = useCallback((reordered: Note[]) => {
    const updated = reordered.map((n, i) => ({ ...n, order: i }));
    setNotes(updated);
    window.quenbot.reorderNotes(updated.map(n => n.id));
  }, []);

  const handleChipToggle = useCallback((chipId: string) => {
    if (!currentNote) return;
    const currentChips = currentNote.chips || [];
    const newChips = currentChips.includes(chipId)
      ? currentChips.filter(c => c !== chipId)
      : [...currentChips, chipId];
    const updated = { ...currentNote, chips: newChips, updatedAt: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === currentNote.id ? updated : n));
    window.quenbot.saveNote(updated as any);
  }, [currentNote]);

  return (
    <div className="jot-tab">
      <div className="jot-editor-area">
        {currentNote ? (
          <NoteEditor
            key={currentNote.id}
            content={currentNote.content}
            locked={currentNote.locked}
            onChange={handleContentChange}
          />
        ) : (
          <div className="jot-empty">Create a note to get started</div>
        )}
      </div>
      {currentNote && (
        <ChipBar noteChips={currentNote.chips || []} onChipToggle={handleChipToggle} />
      )}
      <NoteTabs
        notes={notes}
        currentId={currentId}
        onSelect={setCurrentId}
        onAdd={handleAddNote}
        onDelete={handleDeleteNote}
        onRename={handleRenameNote}
        onToggleLock={handleToggleLock}
        onReorder={handleReorder}
      />
    </div>
  );
};
