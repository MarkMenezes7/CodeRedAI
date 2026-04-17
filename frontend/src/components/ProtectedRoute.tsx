import { ReactNode, useEffect } from 'react';

import { useHospitalAuth } from '@shared/providers/AuthContext';
import {
  type AppRole,
  readStoredAdminSession,
  redirectToAuth,
  redirectToRoleDashboard,
  resolveAuthenticatedRole,
} from '@/utils/redirectByRole';

interface ProtectedRouteProps {
  role: AppRole;
  children: ReactNode;
}

export function ProtectedRoute({ role, children }: ProtectedRouteProps) {
  const { isHospitalAuthenticated, isDriverAuthenticated } = useHospitalAuth();

  const authenticatedRole = resolveAuthenticatedRole({
    isHospitalAuthenticated,
    isDriverAuthenticated,
    hasAdminSession: Boolean(readStoredAdminSession()),
  });

  const isAuthorized = authenticatedRole === role;

  useEffect(() => {
    if (isAuthorized) {
      return;
    }

    if (!authenticatedRole) {
      redirectToAuth();
      return;
    }

    redirectToRoleDashboard(authenticatedRole);
  }, [authenticatedRole, isAuthorized]);

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
