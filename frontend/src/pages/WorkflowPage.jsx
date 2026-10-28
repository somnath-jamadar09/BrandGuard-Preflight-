import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import CommentThread from '../components/workflow/CommentThread';
import CommentInput from '../components/workflow/CommentInput';
import ApprovalControls from '../components/workflow/ApprovalControls';
import VersionTimeline from '../components/workflow/VersionTimeline';
import DiffView from '../components/workflow/DiffView';
import { getComments, postComment, approveDraft, requestChanges, overrideFinding } from '../api/workflow';
import { useAuth } from '../context/useAuth';
import { MOCK_COMMENTS, MOCK_VERSIONS, USE_MOCK } from '../utils/mocks';
import './WorkflowPage.css';

export default function WorkflowPage() {
  const { draftId } = useParams();
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [versions] = useState(MOCK_VERSIONS);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [draftStatus, setDraftStatus] = useState('in-review');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }


  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        if (USE_MOCK) {
          await new Promise((r) => setTimeout(r, 400));
          if (!ignore) setComments(MOCK_COMMENTS);
        } else {
          const { data } = await getComments(draftId);
          if (!ignore) setComments(Array.isArray(data) ? data : (data?.data || []));
        }
      } catch {
        if (!ignore) showToast('Failed to load comments.', 'error');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [draftId]);

  async function handleComment(text) {
    try {
      if (USE_MOCK) {
        const newComment = {
          _id: `c-${Date.now()}`,
          authorName: user?.name ?? 'You',
          authorRole: user?.role ?? 'creator',
          text,
          type: 'comment',
          createdAt: new Date().toISOString(),
        };
        setComments((prev) => [...prev, newComment]);
      } else {
        await postComment(draftId, { text });
        await loadComments();
      }
      showToast('Comment posted.', 'success');
    } catch {
      showToast('Failed to post comment.', 'error');
    }
  }

  async function handleApprove() {
    try {
      if (!USE_MOCK) await approveDraft(draftId);
      setDraftStatus('approved');
      showToast('Draft approved.', 'success');
    } catch {
      showToast('Approval failed.', 'error');
    }
  }

  async function handleRequestChanges() {
    try {
      if (!USE_MOCK) await requestChanges(draftId, { reason: 'Changes requested.' });
      setDraftStatus('draft');
      showToast('Changes requested.', 'success');
    } catch {
      showToast('Action failed.', 'error');
    }
  }

  async function handleOverride(reason) {
    try {
      if (!USE_MOCK) await overrideFinding(draftId, { reason });
      showToast('Override logged.', 'success');
    } catch {
      showToast('Override failed.', 'error');
    }
  }

  return (
    <AppLayout pageTitle="Workflow">
      <div className="wp-layout">
        <div className="wp-main">
          <section className="wp-timeline-section">
            <h2 className="wp-section-heading">Version Timeline</h2>
            <VersionTimeline
              versions={versions}
              selectedId={selectedVersion?._id}
              onSelect={setSelectedVersion}
            />
          </section>

          {selectedVersion && (
            <section className="wp-diff-section card">
              <DiffView version={selectedVersion} />
            </section>
          )}
        </div>


        <aside className="wp-comments-col card" aria-label="Comment thread">
          <h2 className="wp-section-heading">Comments</h2>
          {loading ? (
            <div className="loading-state">
              <span className="spinner" aria-hidden="true" />
            </div>
          ) : (
            <CommentThread comments={comments} />
          )}
          <div className="wp-comment-input">
            <CommentInput onSubmit={handleComment} />
          </div>
        </aside>
      </div>

      <ApprovalControls
        role={user?.role}
        draftStatus={draftStatus}
        draftId={draftId}
        onApprove={handleApprove}
        onRequestChanges={handleRequestChanges}
        onOverride={handleOverride}
      />

      {toast && (
        <div
          className={`toast toast-${toast.type} wp-toast`}
          role="status"
          aria-live="polite"
        >
          {toast.msg}
        </div>
      )}
    </AppLayout>
  );
}
