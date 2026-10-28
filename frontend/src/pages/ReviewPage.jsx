import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import DraftViewer from '../components/review/DraftViewer';
import FindingsSidebar from '../components/review/FindingsSidebar';
import ComparisonView from '../components/review/ComparisonView';
import ImageChecksPanel from '../components/review/ImageChecksPanel';
import { getFindings, getDraft, patchFinding } from '../api/findings';
import { MOCK_FINDINGS, MOCK_DRAFT, USE_MOCK } from '../utils/mocks';
import './ReviewPage.css';

function adaptFinding(finding, content, index, total) {
  const start = finding.span?.start ?? 0;
  const end = finding.span?.end ?? start;
  return {
    ...finding,
    index: index + 1,
    total,
    draftSpan: content.slice(start, end),
    draftContext: content.slice(Math.max(0, start - 80), Math.min(content.length, end + 80)),
    proof: finding.evidence ?? null,
    reason: finding.explanation ?? '',
  };
}

export default function ReviewPage() {
  const { draftId } = useParams();
  const [draft, setDraft] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [comparisonFinding, setComparisonFinding] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        if (USE_MOCK) {
          await new Promise((r) => setTimeout(r, 800));
          if (ignore) return;
          setDraft(MOCK_DRAFT);
          setFindings(MOCK_FINDINGS);
          setFetchError('');
        } else {
          try {
            const [draftRes, findingsRes] = await Promise.all([
              getDraft(draftId),
              getFindings(draftId),
            ]);
            if (ignore) return;
            const draftData = draftRes.data;
            const content = draftData.content ?? draftData.latestVersion?.content ?? '';
            const rawFindings = findingsRes.data?.data ?? findingsRes.data ?? [];
            setDraft({ ...draftData, content });
            setFindings(rawFindings.map((finding, index) => adaptFinding(
              finding,
              content,
              index,
              rawFindings.length,
            )));
            setFetchError('');
          } catch {
            if (ignore) return;
            setDraft(MOCK_DRAFT);
            setFindings(MOCK_FINDINGS);
          }
        }
      } catch {
        if (!ignore) setFetchError('Failed to load review data. Please refresh.');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [draftId]);

  async function handleAction({ findingId, action, editedFix }) {
    try {
      const apiAction = {
        accept: 'accepted',
        edit: 'edited',
        dismiss: 'dismissed',
        'ask-owner': 'escalated',
      }[action] ?? action;
      const reason = action === 'dismiss'
        ? window.prompt('Why should this finding be dismissed?')?.trim()
        : undefined;
      if (action === 'dismiss' && !reason) return;
      if (!USE_MOCK) {
        const payload = { status: apiAction };
        if (apiAction === 'edited') payload.editedText = editedFix;
        if (reason) payload.reason = reason;
        await patchFinding(findingId, payload);
      }
      if (action === 'accept') {
        const target = findings.find((f) => f._id === findingId);
        const replacement = editedFix || target?.suggestedFix;
        if (target?.draftSpan && replacement) {
          setDraft((prev) => {
            if (!prev?.content) return prev;
            return {
              ...prev,
              content: prev.content.replace(target.draftSpan, replacement),
            };
          });
        }
      }
      setFindings((prev) =>
        prev.map((f) =>
          f._id === findingId ? { ...f, status: apiAction } : f
        )
      );
      showToast(`Finding ${apiAction === 'accepted' ? 'accepted' : apiAction === 'dismissed' ? 'dismissed' : 'updated'}.`, 'success');
    } catch {
      showToast('Action failed. Please try again.', 'error');
    }
  }

  function scrollToFinding(finding) {
    const el = document.getElementById(`finding-${finding._id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const open = findings.filter((f) => f.status === 'open').length;

  return (
    <AppLayout
      pageTitle={draft?.fileName ?? draft?.title ?? 'Review'}
      aiAssisted={draft?.aiAssisted ?? true}
    >
      {fetchError && (
        <div className="rp-banner rp-banner--error" role="alert">
          {fetchError}
        </div>
      )}

      <div className="rp-summary">
        {!loading && (
          <>
            <span className="badge badge-status-inreview">{open} open</span>
            <span className="badge badge-status-approved">
              {findings.length - open} resolved
            </span>
            <span className="rp-total">{findings.length} total findings</span>
            <Link
              to={`/drafts/${draftId}/workflow`}
              className="btn btn-primary btn-sm rp-btn-workflow"
            >
              Proceed to Workflow &amp; Approval →
            </Link>
          </>
        )}
      </div>

      <div className="rp-layout">
        <section className="rp-draft-col card" aria-label="Draft text">
          <h2 className="rp-col-heading">Draft</h2>
          {draft?.imageChecks && <ImageChecksPanel imageChecks={draft.imageChecks} />}
          {loading ? (
            <div className="loading-state">
              <span className="spinner" aria-hidden="true" />
            </div>
          ) : (
            <DraftViewer
              content={draft?.content ?? ''}
              findings={findings}
              onHighlightClick={(f) => { scrollToFinding(f); setComparisonFinding(f); }}
            />
          )}
        </section>

        <section className="rp-findings-col" aria-label="Findings">
          <h2 className="rp-col-heading">Findings</h2>
          <FindingsSidebar
            findings={findings}
            loading={loading}
            onAction={handleAction}
          />
        </section>

        <aside className="rp-premortem-col card" aria-label="Pre-mortem panel">
          <h2 className="rp-col-heading">Highest Risk Line</h2>
          {!loading && findings.length > 0 ? (
            <div className="rp-premortem">
              <p className="rp-premortem-quote">
                "{findings[0]?.draftSpan}"
              </p>
              <div className="rp-premortem-viewpoints">
                {['Regulator', 'Journalist', 'Competitor', 'Screen-Reader'].map((v) => (
                  <div key={v} className="rp-viewpoint">
                    <span className="badge badge-status-draft rp-viewpoint-label">{v}</span>
                    <span className="rp-viewpoint-reason">
                      {v === 'Regulator' && 'Unverified comparative claim may breach advertising standards.'}
                      {v === 'Journalist' && 'Unsupported superlative is headline-worthy.'}
                      {v === 'Competitor' && 'Could trigger a counter-claim or legal challenge.'}
                      {v === 'Screen-Reader' && 'Mark tag provides no accessible context for the highlighted claim.'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state rp-empty-risk">
              <p>No risk data yet.</p>
            </div>
          )}
        </aside>
      </div>

      <div className="rp-ai-notice" role="note">
        This review used AI assistance. Findings are checked against your uploaded sources only.
        Final decisions are made by you.
      </div>

      {comparisonFinding && (
        <ComparisonView
          finding={comparisonFinding}
          onClose={() => setComparisonFinding(null)}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type} rp-toast`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </AppLayout>
  );
}
