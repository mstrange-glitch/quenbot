import React, { useState, useEffect, useCallback } from 'react';

import type { Chip } from '../../../../shared/types';

interface ChipBarProps {
  noteChips: string[];
  onChipToggle: (chipId: string) => void;
}

const CHIP_COLORS = ['#9A2424', '#2463eb', '#22863a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#4a4a4a'];

export const ChipBar: React.FC<ChipBarProps> = ({ noteChips, onChipToggle }) => {
  const [chips, setChips] = useState<Chip[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CHIP_COLORS[0]);

  const loadChips = useCallback(async () => {
    try { const c = await window.quenbot.getChips(); setChips(c); } catch {}
  }, []);

  useEffect(() => { loadChips(); }, [loadChips]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await window.quenbot.addChip(newName.trim(), newColor);
      setNewName('');
      setShowCreate(false);
      loadChips();
    } catch {}
  };

  const handleDeleteChip = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try { await window.quenbot.removeChip(id); loadChips(); } catch {}
  };

  if (chips.length === 0 && !expanded) {
    return (
      <div className="chip-bar-trigger" onMouseEnter={() => setExpanded(true)}>
        <span className="chip-trigger-icon">&#9679;</span>
      </div>
    );
  }

  return (
    <div className={`chip-bar${expanded ? ' expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { if (!showCreate) setExpanded(false); }}>

      {!expanded ? (
        <div className="chip-bar-trigger">
          <span className="chip-trigger-icon">&#9679;</span>
        </div>
      ) : (
        <div className="chip-bar-panel">
          <div className="chip-bar-header">
            <span className="chip-bar-title">Tags</span>
            <button className="chip-bar-add-btn" onClick={() => setShowCreate(!showCreate)}>+</button>
          </div>

          {showCreate && (
            <div className="chip-create-form">
              <input className="chip-name-input" placeholder="Tag name" value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }} />
              <div className="chip-color-picker">
                {CHIP_COLORS.map(c => (
                  <button key={c} className={`chip-color-opt${newColor === c ? ' active' : ''}`}
                    style={{ background: c }} onClick={() => setNewColor(c)} />
                ))}
              </div>
              <button className="chip-create-btn" onClick={handleCreate}>Add</button>
            </div>
          )}

          <div className="chip-bar-list">
            {chips.map(chip => (
              <div key={chip.id} className={`chip-item${noteChips.includes(chip.id) ? ' attached' : ''}`}
                onClick={() => onChipToggle(chip.id)} title={`Click to ${noteChips.includes(chip.id) ? 'remove' : 'add'} tag`}>
                <span className="chip-item-dot" style={{ background: chip.color }} />
                <span className="chip-item-name">{chip.name}</span>
                {noteChips.includes(chip.id) && <span className="chip-item-check">&#10003;</span>}
                <button className="chip-item-delete" onClick={e => handleDeleteChip(e, chip.id)} title="Delete tag">&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
