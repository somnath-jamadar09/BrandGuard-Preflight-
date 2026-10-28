import { Link } from 'react-router-dom';
import './LoginPage.css';

export default function ForbiddenPage() {
  return (
    <div className="login-page" role="main">
      <div className="login-card card forbidden-card">
        <h1 className="forbidden-code">403</h1>
        <p>You do not have permission to view this page.</p>
        <Link to="/dashboard" className="btn btn-primary forbidden-btn">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
