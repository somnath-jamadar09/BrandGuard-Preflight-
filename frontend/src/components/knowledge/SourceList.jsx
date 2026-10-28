import { useState } from 'react';
import SourceCard from './SourceCard';
import './SourceList.css';

const TYPES = ['all', 'guideline', 'fact-sheet', 'glossary', 'past-content'];
const STATUSES = ['all', 'ready', 'processing', 'error', 'expired'];

export default function SourceList({ sources = [], loading, selectedId, onSelect }) {
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOwner, setFilterOwner] = useState('');

  const safeSources = Array.isArray(sources) ? sources : [];
  const owners = [...new Set(safeSources.map((s) => s.ownerName).filter(Boolean))];

  const visible = safeSources.filter((s) => {
    if (filterType !== 'all' && s.type !== filterType) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterOwner && s.ownerName !== filterOwner) return false;
    return true;
  });

  return (
    <div className="source-list">
      <div className="source-list-filters">
        <select
          className="form-input source-list-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          aria-label="Filter by type"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All types' : t}
            </option>
          ))}
        </select>

        <select
          className="form-input source-list-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s}
            </option>
          ))}
        </select>

        {owners.length > 0 && (
          <select
            className="form-input source-list-select"
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            aria-label="Filter by owner"
          >
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="loading-state">
          <span className="spinner" aria-hidden="true" />
          <span>Loading sources…</span>
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="empty-state">
          <p>No sources match your filters.</p>
        </div>
      )}

      <div className="source-list-grid" role="list">
        {visible.map((source) => (
          <div key={source._id} role="listitem">
            <SourceCard
              source={source}
              selected={selectedId === source._id}
              onClick={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
