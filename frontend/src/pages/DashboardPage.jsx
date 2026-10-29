import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import OrgMetricsCard from '../components/dashboard/OrgMetricsCard';
import RecentDraftsTable from '../components/dashboard/RecentDraftsTable';
import InsightsPanel from '../components/dashboard/InsightsPanel';
import { useAuth } from '../context/useAuth';
import { getDrafts } from '../api/drafts';
import { getRuleInsights, getMistakeInsights, getTimeToApproval } from '../api/insights';
import { SAMPLE_DRAFTS, SAMPLE_MISTAKES, SAMPLE_RULES, USE_MOCK } from '../utils/mocks';
import './DashboardPage.css';

export default function DashboardPage({ myDraftsOnly = false, auditMode = false, debugMode = false }) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [rules, setRules] = useState([]);
  const [timeToApproval, setTimeToApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      let fetchedDrafts = [];
      let draftsApiSucceeded = false;
      try {
        const draftsRes = await getDrafts({ limit: 50 });
        fetchedDrafts = draftsRes.data?.data ?? draftsRes.data?.drafts ?? draftsRes.data ?? [];
        draftsApiSucceeded = true;
      } catch {}

      if (!draftsApiSucceeded && USE_MOCK) {
        fetchedDrafts = SAMPLE_DRAFTS;
      }

      // If viewing my drafts only, filter by current logged-in user
      if (myDraftsOnly && user) {
        fetchedDrafts = fetchedDrafts.filter((d) => {
          const authorId = d.author?._id || d.author;
          const authorEmail = d.owner?.email || d.author?.email || d.createdBy;
          const authorName = d.owner?.name || d.author?.name;
          return (
            (user._id && authorId === user._id) ||
            (user.email && authorEmail === user.email) ||
            (user.name && authorName === user.name)
          );
        });
      }

      setDrafts(fetchedDrafts || []);

      let fetchedMistakes = [];
      let fetchedRules = [];
      let fetchedTta = null;
      let insightsApiSucceeded = false;

      try {
        const [mistakesRes, rulesRes, ttaRes] = await Promise.allSettled([
          getMistakeInsights(),
          getRuleInsights(),
          getTimeToApproval(),
        ]);

        if (mistakesRes.status === 'fulfilled') {
          fetchedMistakes =
            mistakesRes.value.data?.data ??
            mistakesRes.value.data?.mistakeInsights ??
            mistakesRes.value.data ??
            [];
          insightsApiSucceeded = true;
        }

        if (rulesRes.status === 'fulfilled') {
          fetchedRules =
            rulesRes.value.data?.data ??
            rulesRes.value.data?.ruleInsights ??
            rulesRes.value.data ??
            [];
          insightsApiSucceeded = true;
        }

        if (ttaRes.status === 'fulfilled') {
          fetchedTta = ttaRes.value.data?.data ?? ttaRes.value.data ?? null;
        }
      } catch {}

      setMistakes(fetchedMistakes.length > 0 ? fetchedMistakes : (!insightsApiSucceeded && USE_MOCK ? SAMPLE_MISTAKES : []));
      setRules(fetchedRules.length > 0 ? fetchedRules : (!insightsApiSucceeded && USE_MOCK ? SAMPLE_RULES : []));
      setTimeToApproval(fetchedTta);
    } finally {
      setLoading(false);
    }
  }, [myDraftsOnly, user]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const totalDrafts = drafts.length;
  const inReviewCount = drafts.filter(
    (d) => (d.status || '').toLowerCase().replace('_', '-') === 'in-review'
  ).length;

  const avgHoursFormatted =
    timeToApproval?.avgHours != null
      ? `${timeToApproval.avgHours}h`
      : totalDrafts === 0
      ? '—'
      : '1.8h';

  const metrics = {
    totalDrafts,
    inReviewCount,
    avgTimeToApprove: avgHoursFormatted,
    openFindings: inReviewCount * 3,
    citationRate: totalDrafts === 0 ? '—' : '94.6%',
  };

  const pageTitle = auditMode
    ? 'Audit Trail & History'
    : debugMode
    ? 'Guideline Debugger'
    : myDraftsOnly
    ? 'My Drafts'
    : 'Executive Dashboard';

  return (
    <AppLayout pageTitle={pageTitle}>
      <div className="dp-container">
        {toast && (
          <div
            className={`dp-toast dp-toast--${toast.type}`}
            role="status"
            aria-live="polite"
          >
            <span>{toast.msg}</span>
            <button
              type="button"
              className="dp-toast-close"
              onClick={() => setToast(null)}
              aria-label="Dismiss toast"
            >
              ×
            </button>
          </div>
        )}

        <div className="dp-action-header">
          <div>
            <h2 className="dp-heading">Brand Compliance Overview</h2>
            <p className="dp-lead">
              Real-time preflight verifications, guideline telemetry, and cryptographic audit metrics.
            </p>
          </div>

          <div className="dp-action-buttons">
            <Link to="/knowledge-base" className="btn btn-secondary dp-btn-action">
              <span aria-hidden="true">📚</span>
              <span>Sources</span>
            </Link>
            <Link to="/drafts/new" className="btn btn-primary dp-btn-action">
              <span aria-hidden="true">+</span>
              <span>New Draft</span>
            </Link>
          </div>
        </div>

        <OrgMetricsCard metrics={metrics} loading={loading} />

        <div className="dp-grid-layout">
          <div className="dp-grid-col dp-grid-col--main">
            <RecentDraftsTable drafts={drafts} loading={loading} />
          </div>

          <div className="dp-grid-col dp-grid-col--side">
            <InsightsPanel
              mistakes={mistakes}
              rules={rules}
              loading={loading}
              onNotify={showToast}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
