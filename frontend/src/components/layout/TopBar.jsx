import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import AIUseNotice from './AIUseNotice';
import './TopBar.css';

export default function TopBar({ pageTitle, breadcrumb, chips, aiAssisted = false, onMenu }) {
  const { org } = useOrg();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  function handleSearch(e) {
    if (e.key !== 'Enter') return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    // Navigate to passports search if query looks like a passport id
    if (q.startsWith('bg_') || q.startsWith('pass')) {
      navigate(`/passports?q=${encodeURIComponent(q)}`);
    } else {
      navigate(`/drafts?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <header className="topbar" role="banner" id="top">
      <button
        type="button"
        className="btn btn-sm topbar-menu"
        onClick={onMenu}
        aria-label="Open menu"
      >
        ☰
      </button>
      <div className="topbar-left">
        {pageTitle && (
          <>
            <div className="topbar-crumb">{breadcrumb || `Home / ${pageTitle}`}</div>
            <h1 className="topbar-title">
              {pageTitle}
              {chips && <div className="topbar-chips">{chips}</div>}
            </h1>
          </>
        )}
      </div>

      <div className="topbar-right">
        {aiAssisted && <AIUseNotice />}
        <input
          type="search"
          className="topbar-search form-input"
          placeholder="Search draft ID or hash"
          aria-label="Search draft ID or passport hash"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearch}
        />
        {org && (
          <span className="pill inf" aria-label={`Organisation: ${org.name}`}>
            {org.name}
          </span>
        )}
        <button
          type="button"
          className="btn btn-sm topbar-bell"
          aria-label="Notifications"
        >
          🔔
        </button>
      </div>
    </header>
  );
}
