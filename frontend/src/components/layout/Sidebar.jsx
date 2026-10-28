import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useTheme } from '../../context/ThemeContext';
import './Sidebar.css';

const NAV_ITEMS = [
  // Primary workspace
  { to: '/drafts/new',     label: 'New Draft',            roles: ['creator', 'admin'],                          group: 'Primary workspace',        icon: '＋' },
  { to: '/drafts/mine',    label: 'My Drafts',            roles: ['creator', 'admin'],                          group: 'Primary workspace',        icon: '▤' },
  { to: '/drafts',         label: 'All Submissions',      roles: ['manager', 'admin', 'owner', 'viewer'],       group: 'Primary workspace',        icon: '☰' },
  { to: '/dashboard',      label: 'Executive Dashboard',  roles: ['manager', 'admin', 'owner', 'viewer'],       group: 'Primary workspace',        icon: '◈' },
  // Knowledge & governance
  { to: '/knowledge-base', label: 'Guidelines & Sources', roles: ['creator', 'manager', 'owner', 'admin', 'viewer'], group: 'Knowledge & governance', icon: '❏' },
  { to: '/facts',          label: 'Verified Facts',       roles: ['manager', 'owner', 'admin'],                 group: 'Knowledge & governance',   icon: '✓' },
  { to: '/terms',          label: 'Terminology Rules',    roles: ['manager', 'owner', 'admin'],                 group: 'Knowledge & governance',   icon: '!' },
  // Compliance & verification
  { to: '/passports',      label: 'Brand Passports',      roles: ['creator', 'manager', 'owner', 'admin', 'viewer'], group: 'Compliance & verification', icon: '◉' },
  { to: '/audit',          label: 'Audit Trail & History',roles: ['manager', 'admin', 'viewer'],                group: 'Compliance & verification', icon: '≡' },
  { to: '/debug',          label: 'Guideline Debugger',   roles: ['manager', 'admin'],                          group: 'Compliance & verification', icon: '⌥' },
];

const ROLE_LABEL = {
  creator: 'Content Creator',
  manager: 'Brand Manager',
  owner:   'Knowledge Owner',
  admin:   'System Administrator',
  viewer:  'Auditor',
};

function initials(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function Sidebar({ open = false, onNavigate }) {
  const { user, logout } = useAuth();
  const { org } = useOrg();
  const { toggleTheme } = useTheme();
  const navigate = useNavigate();

  const role = user?.role ?? '';

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(role)
  );

  function handleLogout() {
    logout();
    navigate('/login');
  }

  let lastGroup = '';

  return (
    <aside
      id="side"
      className={`sidebar${open ? ' open' : ''}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-header">
        <span className="sidebar-logo" aria-hidden="true">✓</span>
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">BrandGuard</span>
          <span className="sidebar-brand-sub">Preflight v2.0</span>
        </div>
      </div>

      {org && (
        <div className="sidebar-org" title={org.name}>
          Org: {org.name}
        </div>
      )}

      <nav className="sidebar-nav">
        <ul role="list">
          {visibleItems.map((item) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <li key={item.label}>
                {showGroup && <div className="sidebar-group">{item.group}</div>}
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                  }
                  onClick={onNavigate}
                >
                  <i aria-hidden="true">{item.icon}</i>
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-avatar" aria-hidden="true">
              {initials(user.name, user.email)}
            </div>
            <div className="sidebar-user-info">
              <b className="sidebar-user-name">{user.name ?? user.email}</b>
              <span className={`pill r-${role}`}>{(ROLE_LABEL[role] || role).toUpperCase()}</span>
            </div>
          </div>
        )}
        <div className="sidebar-footer-actions">
          <button type="button" className="btn btn-sm" onClick={toggleTheme} aria-label="Switch theme">
            Theme
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleLogout}
            aria-label="Log out"
          >
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
