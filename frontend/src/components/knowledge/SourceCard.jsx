import './SourceCard.css';

const TYPE_LABELS = {
  guideline: 'Guideline',
  'fact-sheet': 'Fact Sheet',
  glossary: 'Glossary',
  'past-content': 'Past Content',
};

function expiryBadgeClass(expiryDate) {
  if (!expiryDate) return '';
  const now = Date.now();
  const expiry = new Date(expiryDate).getTime();
  if (isNaN(expiry)) return '';
  if (expiry < now) return 'badge-status-blocked';
  if (expiry - now < 30 * 24 * 60 * 60 * 1000) return 'badge-status-inreview';
  return 'badge-status-approved';
}

function expiryLabel(expiryDate) {
  if (!expiryDate) return null;
  const now = Date.now();
  const dateObj = new Date(expiryDate);
  const expiry = dateObj.getTime();
  if (isNaN(expiry)) return null;
  if (expiry < now) return 'Expired';
  if (expiry - now < 30 * 24 * 60 * 60 * 1000) return 'Expiring soon';
  return dateObj.toLocaleDateString();
}

export default function SourceCard({ source, selected, onClick }) {
  if (!source) return null;
  const typeBadge = TYPE_LABELS[source.type] || source.type || 'Document';
  const displayName = source.title || source.fileName || 'Untitled source';

  return (
    <button
      type="button"
      className={`source-card card${selected ? ' source-card--selected' : ''}`}
      onClick={() => onClick?.(source)}
      aria-pressed={selected}
    >
      <div className="source-card-header">
        <span className="source-card-name">{displayName}</span>
        <span className="badge badge-status-checked">{typeBadge}</span>
      </div>

      <div className="source-card-meta">
        <span>v{source.version || '1.0'}</span>
        <span>{source.ownerName || 'Unknown'}</span>
      </div>

      <div className="source-card-footer">
        <span className="badge badge-status-draft">{source.status || 'ready'}</span>
        {source.expiryDate && (
          <span className={`badge ${expiryBadgeClass(source.expiryDate)}`}>
            {expiryLabel(source.expiryDate)}
          </span>
        )}
      </div>
    </button>
  );
}
