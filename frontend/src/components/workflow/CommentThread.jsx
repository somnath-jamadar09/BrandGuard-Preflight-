import './CommentThread.css';

const ROLE_BADGE = {
  manager:         'badge-status-checked',
  brand_manager:   'badge-status-checked',
  admin:           'badge-status-approved',
  creator:         'badge-status-draft',
  knowledge_owner: 'badge-outdated',
  owner:           'badge-outdated',
  reviewer:        'badge-status-inreview',
};

function initials(name = '') {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function CommentThread({ comments }) {
  if (!comments?.length) {
    return (
      <div className="ct-empty">
        <p>No comments yet.</p>
      </div>
    );
  }

  return (
    <div className="ct-list" role="list" aria-label="Comment thread">
      {comments.map((comment) => {
        const badgeClass = ROLE_BADGE[comment.authorRole] || 'badge-status-draft';
        const formattedDate = comment.createdAt
          ? new Date(comment.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—';

        return (
          <div key={comment._id} className="ct-item" role="listitem">
            <div className="ct-avatar" aria-hidden="true">
              {initials(comment.authorName)}
            </div>
            <div className="ct-body">
              <div className="ct-meta">
                <span className="ct-author">{comment.authorName}</span>
                <span className={`badge ${badgeClass} ct-role`}>
                  {comment.authorRole}
                </span>
                <span className="ct-date">{formattedDate}</span>
              </div>
              <p className="ct-text">{comment.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
