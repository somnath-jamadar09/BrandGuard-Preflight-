import { useState } from 'react';
import { Link } from 'react-router-dom';
import OverrideReasonModal from './OverrideReasonModal';
import './ApprovalControls.css';

export default function ApprovalControls({ role, draftStatus, draftId, onApprove, onRequestChanges, onOverride }) {
  const [showOverride, setShowOverride] = useState(false);

  const isManager = role === 'manager' || role === 'brand_manager' || role === 'admin';
  const isCreator = role === 'creator';
  const isApproved = draftStatus === 'approved';

  if (isCreator) {
    return (
      <div className="ac-bar">
        <div className="ac-creator-status">
          {isApproved ? (
            <span className="badge badge-status-approved">Approved</span>
          ) : (
            <span className="badge badge-status-inreview">Awaiting approval</span>
          )}
          <span className="ac-creator-note">
            {isApproved ? 'All compliance checks approved.' : 'You cannot approve your own draft.'}
          </span>
          {isApproved && (
            <Link to={`/passports/${draftId}`} className="btn btn-primary btn-sm ac-btn-passport">
              View Brand Passport →
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!isManager) return null;

  async function handleOverride(reason) {
    await onOverride?.(reason);
    setShowOverride(false);
  }

  return (
    <>
      <div className="ac-bar">
        <span className="ac-label">Review decision</span>
        <div className="ac-actions">
          <button
            type="button"
            id="ac-approve"
            className="btn btn-success"
            onClick={onApprove}
            disabled={isApproved}
          >
            Approve
          </button>
          <button
            type="button"
            id="ac-request-changes"
            className="btn btn-secondary ac-amber"
            onClick={onRequestChanges}
            disabled={isApproved}
          >
            Request Changes
          </button>
          <button
            type="button"
            id="ac-override"
            className="btn btn-danger"
            onClick={() => setShowOverride(true)}
          >
            Override Finding
          </button>
          {isApproved && (
            <Link to={`/passports/${draftId}`} className="btn btn-primary btn-sm ac-btn-passport">
              View Brand Passport →
            </Link>
          )}
        </div>
      </div>

      {showOverride && (
        <OverrideReasonModal
          onConfirm={handleOverride}
          onClose={() => setShowOverride(false)}
        />
      )}
    </>
  );
}
