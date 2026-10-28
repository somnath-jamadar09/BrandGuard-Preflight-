import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { OrgContext } from './orgContextInstance';

export function OrgProvider({ children }) {
  const { user } = useAuth();

  const org = useMemo(() => {
    if (!user) return null;
    return {
      id: user.orgId,
      name: user.orgName ?? 'My Organisation',
    };
  }, [user]);

  return (
    <OrgContext.Provider value={{ org }}>
      {children}
    </OrgContext.Provider>
  );
}

export { useOrg } from './useOrg';

