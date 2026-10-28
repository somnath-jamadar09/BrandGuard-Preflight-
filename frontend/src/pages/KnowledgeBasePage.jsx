import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import SourceList from '../components/knowledge/SourceList';
import SourceUploader from '../components/knowledge/SourceUploader';
import { getSources, getSource } from '../api/sources';
import { unwrapArray, unwrapData } from '../api/unwrap';
import { USE_MOCK, SAMPLE_SOURCES } from '../utils/mocks';
import './KnowledgeBasePage.css';

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showUploader, setShowUploader] = useState(false);

  const refreshSources = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await getSources();
      let list = unwrapArray(res);
      if ((!list || list.length === 0) && USE_MOCK) {
        list = SAMPLE_SOURCES;
      }
      setSources(list || []);
      // If currently selected source is no longer present, keep or clear
      if (selected) {
        const stillPresent = list?.find((s) => s._id === selected._id);
        if (stillPresent) {
          setSelected((prev) => ({ ...stillPresent, ...prev }));
        }
      }
    } catch (err) {
      if (USE_MOCK) {
        setSources(SAMPLE_SOURCES);
      } else {
        const msg =
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Failed to load sources. Please try again.';
        setFetchError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      setLoading(true);
      setFetchError('');
      try {
        const res = await getSources();
        if (ignore) return;
        let list = unwrapArray(res);
        if ((!list || list.length === 0) && USE_MOCK) {
          list = SAMPLE_SOURCES;
        }
        setSources(list || []);
      } catch (err) {
        if (ignore) return;
        if (USE_MOCK) {
          setSources(SAMPLE_SOURCES);
        } else {
          const msg =
            err.response?.data?.message ||
            err.response?.data?.error ||
            'Failed to load sources. Please try again.';
          setFetchError(msg);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleSelect(source) {
    if (selected?._id === source._id) {
      setSelected(null);
      return;
    }
    setSelected(source);
    try {
      const res = await getSource(source._id);
      const detail = unwrapData(res);
      if (detail) {
        setSelected((prev) => (prev?._id === source._id ? { ...prev, ...detail } : prev));
      }
    } catch {
      // Non-fatal; retain already selected source item
    }
  }

  function handleUploaded() {
    refreshSources();
  }

  return (
    <AppLayout pageTitle="Knowledge Base">
      <div className="kb-toolbar">
        <span className="kb-count">
          {!loading && `${sources.length} source${sources.length !== 1 ? 's' : ''}`}
        </span>
        <button
          id="kb-add-source"
          className="btn btn-primary"
          onClick={() => setShowUploader(true)}
        >
          + Add source
        </button>
      </div>

      {fetchError && (
        <div className="kb-error" role="alert">
          <span>{fetchError}</span>
          <button className="btn btn-secondary kb-retry-btn" onClick={refreshSources}>
            Retry
          </button>
        </div>
      )}

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
              <h2 className="kb-detail-title">{selected.title || selected.fileName}</h2>
              {selected.title && selected.fileName && selected.title !== selected.fileName && (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-body-sm)', marginBottom: 'var(--space-3)' }}>
                  {selected.fileName}
                </p>
              )}

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
                <dd><span className="badge badge-status-checked">{selected.status || 'ready'}</span></dd>
              </dl>

              {selected.downloadUrl && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <a
                    href={selected.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    download
                  >
                    Download document
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <p>Select a source to see its details.</p>
            </div>
          )}
        </aside>
      </div>

      {showUploader && (
        <SourceUploader
          onUploaded={handleUploaded}
          onClose={() => setShowUploader(false)}
        />
      )}
    </AppLayout>
  );
}
