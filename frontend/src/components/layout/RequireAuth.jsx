import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

export const ROLE_ALIASES = {
  creator: ['creator', 'editor', 'author'],
  brand_manager: ['brand_manager', 'manager'],
  manager: ['brand_manager', 'manager'],
  knowledge_owner: ['knowledge_owner', 'owner'],
  owner: ['knowledge_owner', 'owner'],
  admin: ['admin', 'superadmin'],
  viewer: ['viewer', 'auditor', 'guest'],
};

export function hasRoleAccess(userRole, allowedRoles) {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!userRole) return false;
  const normUserRole = userRole.toLowerCase().trim();
  if (normUserRole === 'admin' || normUserRole === 'superadmin') return true;

  const userAliases = ROLE_ALIASES[normUserRole] || [normUserRole];

  return allowedRoles.some((allowed) => {
    const normAllowed = allowed.toLowerCase().trim();
    if (userAliases.includes(normAllowed)) return true;
    const allowedAliases = ROLE_ALIASES[normAllowed] || [normAllowed];
    return userAliases.some((alias) => allowedAliases.includes(alias));
  });
}

export default function RequireAuth({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-state" aria-live="polite" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !hasRoleAccess(user.role, allowedRoles)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}
