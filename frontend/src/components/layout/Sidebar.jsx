import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useOrg } from '../../context/useOrg';
import './Sidebar.css';

const NAV_ITEMS = [
  { to: '/dashboard',      label: 'Dashboard',      roles: ['manager', 'admin', 'owner'] },
  { to: '/knowledge-base', label: 'Knowledge Base', roles: ['admin', 'owner', 'manager', 'creator'] },
  { to: '/drafts/new',     label: 'New Draft',      roles: ['creator', 'admin'] },
  { to: '/drafts',         label: 'My Drafts',      roles: ['creator'] },
  { to: '/drafts',         label: 'All Drafts',     roles: ['manager', 'admin'] },
  { to: '/dashboard',      label: 'Insights',       roles: ['manager', 'admin', 'owner'] },
  { to: '/passports',      label: 'Passport Lookup', roles: ['manager', 'admin', 'owner'] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { org } = useOrg();
  const navigate = useNavigate();

  const role = user?.role ?? '';

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(role) || role === 'admin'
  );

  const uniqueItems = visibleItems.filter(
    (item, idx, arr) => arr.findIndex((i) => i.label === item.label) === idx
  );

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-header">
        <span className="sidebar-logo" aria-hidden="true">BG</span>
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">BrandGuard</span>
          <span className="sidebar-brand-sub">Preflight</span>
        </div>
      </div>

      {org && (
        <div className="sidebar-org" title={org.name}>
          {org.name}
        </div>
      )}

      <nav className="sidebar-nav">
        <ul role="list">
          {uniqueItems.map((item) => (
            <li key={item.label}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <span className="sidebar-user-name">{user.name ?? user.email}</span>
            <span className="sidebar-user-role badge">{role}</span>
          </div>
        )}
        <button
          className="btn btn-secondary sidebar-logout"
          onClick={handleLogout}
          aria-label="Log out"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
