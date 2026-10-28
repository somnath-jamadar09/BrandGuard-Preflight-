import { useOrg } from '../../context/useOrg';
import AIUseNotice from './AIUseNotice';
import './TopBar.css';

export default function TopBar({ pageTitle, aiAssisted = false }) {
  const { org } = useOrg();

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        {pageTitle && <h1 className="topbar-title">{pageTitle}</h1>}
      </div>

      <div className="topbar-right">
        {aiAssisted && <AIUseNotice />}
        {org && (
          <span className="topbar-org" aria-label={`Organisation: ${org.name}`}>
            {org.name}
          </span>
        )}
      </div>
    </header>
  );
}
