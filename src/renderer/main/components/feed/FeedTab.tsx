import React, { useState, useEffect, useCallback } from 'react';
import './feed.css';

import type { Chip, FeedItem } from '../../../../shared/types';

interface FeedTabProps {
  onNavigate?: (tab: 'rec' | 'jot', refId: string) => void;
}

type FilterType = 'all' | 'recording' | 'note' | 'transcript';
type SortType = 'newest' | 'oldest' | 'title' | 'type';

export const FeedTab: React.FC<FeedTabProps> = ({ onNavigate }) => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [chipFilter, setChipFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortType>('newest');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    const feed = await window.quenbot.getFeed(200, undefined, filter === 'all' ? undefined : filter, sort);
    setItems(feed);
  }, [filter, sort]);

  const loadChips = useCallback(async () => {
    try { const c = await window.quenbot.getChips(); setChips(c); } catch {}
  }, []);

  useEffect(() => { loadFeed(); loadChips(); }, [loadFeed, loadChips]);

  useEffect(() => {
    window.quenbot.onRecordingsUpdated?.(() => loadFeed());
    window.quenbot.onNotesUpdated?.(() => loadFeed());
    return () => {
      window.quenbot.removeAllListeners('recordings-updated');
      window.quenbot.removeAllListeners('notes-updated');
    };
  }, [loadFeed]);

  // Filter by search text (title + preview/content) and chip
  const filtered = items.filter(i => {
    if (search) {
      const q = search.toLowerCase();
      if (!i.title.toLowerCase().includes(q) && !i.preview.toLowerCase().includes(q)) return false;
    }
    if (chipFilter && i.chips && !i.chips.includes(chipFilter)) return false;
    if (chipFilter && !i.chips) return false;
    return true;
  });

  const formatFullDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatRelTime = (iso: string): string => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'recording': return 'Audio Recording';
      case 'note': return 'Text Note';
      case 'transcript': return 'Transcript';
      default: return type;
    }
  };

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'recording': return 'REC';
      case 'note': return 'JOT';
      case 'transcript': return 'VTT';
      default: return '\u2022';
    }
  };

  const getChipById = (id: string): Chip | undefined => chips.find(c => c.id === id);

  const handleClick = (item: FeedItem) => {
    if (onNavigate) onNavigate(item.type === 'recording' ? 'rec' : 'jot', item.refId);
  };

  const handleDelete = async (e: React.MouseEvent, item: FeedItem) => {
    e.stopPropagation();
    setItems(prev => prev.filter(i => i.id !== item.id));
    try { await window.quenbot.deleteFeedItem(item.id); } catch {}
  };

  const handleClearAll = async () => {
    if (!confirm('Clear all log history?')) return;
    setItems([]);
    try { await window.quenbot.clearFeed(); } catch {}
  };

  const handleExport = async (e: React.MouseEvent, item: FeedItem, format: 'md' | 'txt') => {
    e.stopPropagation();
    setExportingId(item.id);
    try { await window.quenbot.exportFeedItem(item, format); } catch {}
    setTimeout(() => setExportingId(null), 1500);
  };

  const handleOpenFolder = async (e: React.MouseEvent, item: FeedItem) => {
    e.stopPropagation();
    try { await window.quenbot.openFeedItemFile(item.refId); } catch {}
  };

  const toggleInfo = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="feed-tab">
      {/* Toolbar */}
      <div className="feed-toolbar">
        <div className="feed-filters">
          {(['all', 'recording', 'note', 'transcript'] as FilterType[]).map(f => (
            <button key={f} className={`feed-filter-btn${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'recording' ? 'Rec' : f === 'note' ? 'Notes' : 'VTT'}
            </button>
          ))}
        </div>
        <div className="feed-toolbar-right">
          <select className="feed-sort" value={sort} onChange={e => setSort(e.target.value as SortType)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
            <option value="type">Type</option>
          </select>
          {items.length > 0 && (
            <button className="feed-clear-btn" onClick={handleClearAll} title="Clear all">Clear</button>
          )}
        </div>
      </div>

      {/* Search + chip filters */}
      <div className="feed-search-bar">
        <input type="text" className="feed-search" placeholder="Search titles &amp; content..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button className="feed-search-clear" onClick={() => setSearch('')}>&times;</button>}
        <span className="feed-count">{filtered.length}</span>
      </div>

      {/* Chip filter pills */}
      {chips.length > 0 && (
        <div className="feed-chip-bar">
          <button className={`feed-chip-pill${chipFilter === null ? ' active' : ''}`}
            onClick={() => setChipFilter(null)} style={{ borderColor: 'var(--border-dim)' }}>All</button>
          {chips.map(c => (
            <button key={c.id} className={`feed-chip-pill${chipFilter === c.id ? ' active' : ''}`}
              onClick={() => setChipFilter(chipFilter === c.id ? null : c.id)}
              style={{ borderColor: c.color, color: chipFilter === c.id ? '#fff' : c.color,
                background: chipFilter === c.id ? c.color : 'transparent' }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="feed-empty">
          <span className="feed-empty-label">{items.length === 0 ? 'no activity yet' : 'no matches'}</span>
          <span className="feed-empty-hint">{items.length === 0 ? 'recordings and notes will appear here' : 'try a different filter'}</span>
        </div>
      ) : (
        <div className="feed-list">
          {filtered.map(item => (
            <div key={item.id} className={`feed-item${expandedId === item.id ? ' expanded' : ''}`}>
              <div className="feed-item-row" onClick={() => handleClick(item)}>
                <span className={`feed-type-badge feed-type-${item.type}`}>{getTypeIcon(item.type)}</span>
                <div className="feed-item-content">
                  <div className="feed-item-header">
                    <span className="feed-item-title">
                      {item.title}
                      {item.chips && item.chips.map(cid => {
                        const c = getChipById(cid);
                        return c ? <span key={cid} className="feed-chip-dot" style={{ background: c.color }} title={c.name} /> : null;
                      })}
                    </span>
                    <span className="feed-item-time">{formatRelTime(item.timestamp)}</span>
                  </div>
                  {item.preview && <div className="feed-item-preview">{item.preview}</div>}
                </div>
                <div className="feed-item-actions">
                  <button className="feed-action-btn" onClick={e => toggleInfo(e, item.id)} title="Info">i</button>
                  <button className="feed-action-btn feed-del-btn" onClick={e => handleDelete(e, item)} title="Delete">&times;</button>
                </div>
              </div>

              {expandedId === item.id && (
                <div className="feed-detail">
                  <div className="feed-detail-grid">
                    <span className="feed-detail-label">Type</span>
                    <span className="feed-detail-value">{getTypeLabel(item.type)}</span>
                    <span className="feed-detail-label">Date</span>
                    <span className="feed-detail-value">{formatFullDate(item.timestamp)}</span>
                    {item.size ? <><span className="feed-detail-label">Size</span><span className="feed-detail-value">{formatSize(item.size)}</span></> : null}
                    {item.refId ? <><span className="feed-detail-label">Path</span><span className="feed-detail-value feed-detail-path">{item.refId}</span></> : null}
                  </div>
                  <div className="feed-detail-actions">
                    {item.type === 'recording' && (
                      <button className="feed-export-btn" onClick={e => handleOpenFolder(e, item)}>Open folder</button>
                    )}
                    <button className={`feed-export-btn${exportingId === item.id ? ' exported' : ''}`}
                      onClick={e => handleExport(e, item, 'md')}>
                      {exportingId === item.id ? 'Saved!' : 'Export .md'}
                    </button>
                    <button className={`feed-export-btn${exportingId === item.id ? ' exported' : ''}`}
                      onClick={e => handleExport(e, item, 'txt')}>
                      {exportingId === item.id ? 'Saved!' : 'Export .txt'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
