import React, { useState, useRef, useEffect } from 'react';

import type { SyncPeer } from '../../../../shared/types';

interface ShareButtonProps {
  peers: SyncPeer[];
  onShare: (peer: SyncPeer) => void;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ peers, onShare }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="share-btn-wrapper" ref={ref}>
      <button
        className={`share-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Share note to LAN peer"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
          <path d="M11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.5 2.5 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5z"/>
        </svg>
      </button>
      {open && (
        <div className="share-dropdown">
          <div className="share-dropdown-header">send to</div>
          {peers.map(p => (
            <button
              key={`${p.address}:${p.port}`}
              className="share-dropdown-item"
              onClick={() => { onShare(p); setOpen(false); }}
            >
              <span className="share-peer-dot" />
              <span className="share-peer-name">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
