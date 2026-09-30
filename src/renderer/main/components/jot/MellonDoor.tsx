import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MELLON_ART, MELLON_WORD } from './mellon';
import './mellon.css';

interface MellonDoorProps {
  onClose: () => void;
}

const SHOW_MS = 8000;

export const MellonDoor: React.FC<MellonDoorProps> = ({ onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Chrome keeps typing into a contenteditable that still holds the selection even after
    // focus moves elsewhere, so clear the editor's selection before taking focus.
    window.getSelection()?.removeAllRanges();
    overlayRef.current?.focus();

    // While the door is open, every key belongs to it: nothing reaches the note behind it.
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    const timer = window.setTimeout(onClose, SHOW_MS);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.clearTimeout(timer);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={overlayRef}
      className="mellon-overlay"
      role="dialog"
      aria-label={MELLON_WORD}
      tabIndex={-1}
      onClick={onClose}
    >
      <pre className="mellon-art" aria-hidden="true">{MELLON_ART}</pre>
      <div className="mellon-word">{MELLON_WORD}</div>
    </div>,
    document.body,
  );
};
