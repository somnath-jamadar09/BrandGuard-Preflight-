import { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import './AppLayout.css';

export default function AppLayout({
  children,
  pageTitle,
  breadcrumb,
  chips,
  aiAssisted = false,
  tray = null,
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}
      <div className="app-main">
        <TopBar
          pageTitle={pageTitle}
          breadcrumb={breadcrumb}
          chips={chips}
          aiAssisted={aiAssisted}
          onMenu={() => setNavOpen((open) => !open)}
        />
        <main id="main-content" className="app-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <div className="app-footer-notice">
            This system operates under Human-in-the-Loop AI governance. Findings are strictly bounded by your uploaded company source documents. Final approvals are governed by authorised human reviewers.
          </div>
          <div className="app-footer-mono mono">
            Encrypted TLS 1.3 | SHA-256 Immutable Audit Log | Tenant Isolated
          </div>
          <div className="app-footer-links">
            <a href="#" onClick={(e) => e.preventDefault()}>System Status</a>
            <a href="#" onClick={(e) => e.preventDefault()}>OpenAPI 3.1 Documentation</a>
            <a href="#" onClick={(e) => e.preventDefault()}>WCAG 2.2 AA Accessibility Statement</a>
          </div>
        </footer>
        {tray && (
          <div className="app-tray" role="region" aria-label="Page actions">
            {tray}
          </div>
        )}
      </div>
    </div>
  );
}
