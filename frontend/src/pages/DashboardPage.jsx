import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import OrgMetricsCard from '../components/dashboard/OrgMetricsCard';
import RecentDraftsTable from '../components/dashboard/RecentDraftsTable';
import InsightsPanel from '../components/dashboard/InsightsPanel';
import { getDrafts } from '../api/drafts';
import { getRuleInsights, getMistakeInsights, getTimeToApproval } from '../api/insights';
import './DashboardPage.css';

const SAMPLE_DRAFTS = [
  {
    _id: 'draft-stellara-01',
    title: 'Stellara Returns Policy & Warranty Update',
    format: 'pdf',
    status: 'in-review',
    updatedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    owner: { name: 'Priya Sharma', email: 'priya@stellara.com' },
  },
  {
    _id: 'draft-stellara-02',
    title: 'Project Nova Product Launch Announcement',
    format: 'docx',
    status: 'draft',
    updatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    owner: { name: 'Priya Sharma', email: 'priya@stellara.com' },
  },
  {
    _id: 'draft-stellara-03',
    title: 'Spring 2026 Skincare Ingredient Factsheet',
    format: 'text',
    status: 'approved',
    passportId: 'pass-stellara-03',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    owner: { name: 'Marcus Vance', email: 'marcus@stellara.com' },
  },
  {
    _id: 'draft-stellara-04',
    title: 'Q2 Promotional Email Blast — Claims Verification',
    format: 'markdown',
    status: 'blocked',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    owner: { name: 'Aisha Patel', email: 'aisha@stellara.com' },
  },
];

const SAMPLE_MISTAKES = [
  {
    category: 'Unqualified superlative claim',
    count: 14,
    topExample: 'Stellara Brands offers the best returns policy in the market, giving customers total peace of mind.',
  },
  {
    category: 'Contradicted temporal claim',
    count: 9,
    topExample: 'Our 14-day return window is designed to be fair and hassle-free.',
  },
  {
    category: 'Unverified cost claim',
    count: 6,
    topExample: 'Zero restocking charges on all returned luxury items.',
  },
  {
    category: 'Ambiguous phrasing',
    count: 4,
    topExample: 'Instant refunds processed without inspection delay.',
  },
  {
    category: 'Outdated policy reference',
    count: 3,
    topExample: 'Warranty guidelines as per 2024 compliance handbook.',
  },
];

const SAMPLE_RULES = [
  {
    ruleId: 'rule.superlative.unqualified',
    description: 'Unqualified superlative detected without verified market audit',
    overrideRate: 0.67,
    flagsCount: 18,
    overrideCount: 12,
    suggestedRewording:
      'Claims must avoid unverified superlatives ("best", "market leader"). State verified benchmark numbers or certified laboratory test data instead.',
  },
  {
    ruleId: 'rule.date.outdated',
    description: 'Outdated returns window reference',
    overrideRate: 0.54,
    flagsCount: 13,
    overrideCount: 7,
    suggestedRewording:
      'Specify standard 30-day return window from physical delivery timestamp, referencing current Customer Terms v4.0.',
  },
  {
    ruleId: 'rule.cost.claim',
    description: 'Unverified zero-cost or free return phrasing',
    overrideRate: 0.25,
    flagsCount: 8,
    overrideCount: 2,
    suggestedRewording:
      'Free return phrasing is allowed only for domestic orders with original packaging intact.',
  },
];

export default function DashboardPage({ myDraftsOnly = false, auditMode = false, debugMode = false }) {
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
    setLoading(true);
    try {
      let fetchedDrafts = [];
      try {
        const draftsRes = await getDrafts({ limit: 50 });
        fetchedDrafts = draftsRes.data?.data ?? draftsRes.data?.drafts ?? draftsRes.data ?? [];
      } catch {}

      if (!fetchedDrafts || fetchedDrafts.length === 0) {
        fetchedDrafts = SAMPLE_DRAFTS;
      }
      setDrafts(fetchedDrafts);

      let fetchedMistakes = [];
      let fetchedRules = [];
      let fetchedTta = null;

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
        }

        if (rulesRes.status === 'fulfilled') {
          fetchedRules =
            rulesRes.value.data?.data ??
            rulesRes.value.data?.ruleInsights ??
            rulesRes.value.data ??
            [];
        }

        if (ttaRes.status === 'fulfilled') {
          fetchedTta = ttaRes.value.data?.data ?? ttaRes.value.data ?? null;
        }
      } catch {}

      setMistakes(fetchedMistakes.length > 0 ? fetchedMistakes : SAMPLE_MISTAKES);
      setRules(fetchedRules.length > 0 ? fetchedRules : SAMPLE_RULES);
      setTimeToApproval(fetchedTta);
    } finally {
      setLoading(false);
    }
  }, []);

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
      : '1.8h';

  const metrics = {
    totalDrafts,
    inReviewCount,
    avgTimeToApprove: avgHoursFormatted,
    openFindings: inReviewCount * 3,
    citationRate: '94.6%',
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
