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
    // Take focus so keys pressed while the door is open don't type into the note behind it.
    overlayRef.current?.focus();
    const timer = window.setTimeout(onClose, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onClose();
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="mellon-overlay"
      role="dialog"
      aria-label={MELLON_WORD}
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <pre className="mellon-art" aria-hidden="true">{MELLON_ART}</pre>
      <div className="mellon-word">{MELLON_WORD}</div>
    </div>,
    document.body,
  );
};
