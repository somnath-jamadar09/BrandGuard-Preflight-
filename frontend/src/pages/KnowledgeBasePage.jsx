import { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import SourceList from '../components/knowledge/SourceList';
import SourceUploader from '../components/knowledge/SourceUploader';
import { getSources } from '../api/sources';
import './KnowledgeBasePage.css';

const TABS = [
  { id: 'sources', label: 'Sources' },
  { id: 'facts',   label: 'Fact registry' },
  { id: 'terms',   label: 'Terminology' },
];

export default function KnowledgeBasePage({ defaultTab = 'sources' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showUploader, setShowUploader] = useState(false);

  async function loadSources() {
    setLoading(true);
    setFetchError('');
    try {
      const { data } = await getSources();
      setSources(Array.isArray(data) ? data : (data?.data || []));
    } catch {
      setFetchError('Failed to load sources. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSources(); }, []);

  // Keep tab in sync when prop changes (e.g. route /facts vs /terms)
  useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);

  function handleSelect(source) {
    setSelected((prev) => prev?._id === source._id ? null : source);
  }

  function handleUploaded() {
    loadSources();
  }

  const PAGE_TITLE = { sources: 'Guidelines & Sources', facts: 'Verified Facts', terms: 'Terminology Rules' };

  return (
    <AppLayout pageTitle={PAGE_TITLE[activeTab] || 'Knowledge Base'}>
      <div className="kb-tabs-bar">
        <div className="kb-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              className={`kb-tab${activeTab === tab.id ? ' kb-tab--active' : ''}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === 'sources' && (
          <button
            id="kb-add-source"
            className="btn btn-primary"
            onClick={() => setShowUploader(true)}
          >
            + Ingest new source
          </button>
        )}
        {activeTab === 'facts' && (
          <button className="btn btn-primary" disabled>
            + Add fact
          </button>
        )}
        {activeTab === 'terms' && (
          <button className="btn btn-primary" disabled>
            + Add term
          </button>
        )}
      </div>

      {fetchError && (
        <div className="kb-error" role="alert">
          {fetchError}
          <button className="btn btn-secondary" onClick={loadSources} style={{ marginLeft: 12 }}>
            Retry
          </button>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="kb-layout">
          <div className="kb-list-col">
            <SourceList
              sources={sources}
              loading={loading}
              selectedId={selected?._id}
              onSelect={handleSelect}
            />
          </div>

          <aside className="kb-detail-col card">
            {selected ? (
              <div className="kb-detail">
                <h2 className="kb-detail-title">{selected.fileName}</h2>

                <dl className="kb-detail-meta">
                  <dt>Type</dt>
                  <dd>{selected.type}</dd>
                  <dt>Version</dt>
                  <dd>{selected.version || '—'}</dd>
                  <dt>Owner</dt>
                  <dd>{selected.ownerName || '—'}</dd>
                  <dt>Effective</dt>
                  <dd>{selected.effectiveDate ? new Date(selected.effectiveDate).toLocaleDateString() : '—'}</dd>
                  <dt>Expires</dt>
                  <dd>{selected.expiryDate ? new Date(selected.expiryDate).toLocaleDateString() : '—'}</dd>
                  <dt>Status</dt>
                  <dd><span className="badge badge-status-checked">{selected.status}</span></dd>
                </dl>
              </div>
            ) : (
              <div className="empty-state">
                <p>Select a source to see its details.</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {activeTab === 'facts' && (
        <div className="card kb-placeholder-tab">
          <div className="empty-state">
            <div style={{ fontSize: 32 }} aria-hidden="true">✓</div>
            <h2>Verified Facts</h2>
            <p>The fact registry shows entity-level approved values from your sources. Connect your backend to populate this registry.</p>
          </div>
        </div>
      )}

      {activeTab === 'terms' && (
        <div className="card kb-placeholder-tab">
          <div className="empty-state">
            <div style={{ fontSize: 32 }} aria-hidden="true">!</div>
            <h2>Terminology Rules</h2>
            <p>Approved, banned, and embargoed terms from your brand guidelines appear here. Connect your backend to manage terminology.</p>
          </div>
        </div>
      )}

      {showUploader && (
        <SourceUploader
          onUploaded={handleUploaded}
          onClose={() => setShowUploader(false)}
        />
      )}
    </AppLayout>
  );
}
