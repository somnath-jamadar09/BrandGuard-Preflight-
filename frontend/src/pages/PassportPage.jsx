import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import PassportDetails from '../components/passport/PassportDetails';
import TamperCheck from '../components/passport/TamperCheck';
import { getPassportByDraft, getVersions } from '../api/passport';
import { MOCK_PASSPORT, USE_MOCK } from '../utils/mocks';
import './PassportPage.css';

export default function PassportPage() {
  const { draftId } = useParams();
  const [passport, setPassport] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        if (USE_MOCK) {
          await new Promise((r) => setTimeout(r, 500));
          setPassport(MOCK_PASSPORT);
          setContent('We offer a 30-day returns policy, giving customers peace of mind. Our 30-day return window is designed to be fair and hassle-free. Returns are processed free of charge with no hidden fees.');
        } else {
          const [ppRes, vRes] = await Promise.all([
            getPassportByDraft(draftId),
            getVersions(draftId),
          ]);
          setPassport(ppRes.data);
          const latest = vRes.data?.[vRes.data.length - 1];
          setContent(latest?.content ?? '');
        }
      } catch {
        setFetchError('Failed to load passport. Please refresh.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [draftId]);

  return (
    <AppLayout pageTitle="Brand Passport">
      {fetchError && (
        <div className="pp-error" role="alert">{fetchError}</div>
      )}

      {loading ? (
        <div className="loading-state pp-loading">
          <span className="spinner" aria-hidden="true" />
          <span>Loading passport…</span>
        </div>
      ) : (
        <div className="pp-card card">
          <PassportDetails passport={passport} />

          <div className="pp-divider" />

          <section className="pp-tamper-section">
            <h2 className="pp-section-heading">Integrity Check</h2>
            <TamperCheck
              storedHash={passport?.contentHash}
              currentContent={content}
            />
          </section>
        </div>
      )}
    </AppLayout>
  );
}
