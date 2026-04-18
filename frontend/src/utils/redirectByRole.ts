export type AppRole = 'hospital' | 'driver' | 'admin';

export interface PersistedAdminSession {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    lastLoginAt: string;
  };
}

export interface PersistableAdminSessionInput {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
}

const ADMIN_AUTH_STORAGE_KEY = 'codered-admin-auth-v1';
const ADMIN_AUTH_UNLOCK_STORAGE_KEY = 'codered-admin-auth-unlock-v1';

const DASHBOARD_PATH_BY_ROLE: Record<AppRole, string> = {
  hospital: '/hospital-dashboard',
  driver: '/driver-dashboard',
  admin: '/admin-dashboard',
};

function isPersistedAdminSession(candidate: unknown): candidate is PersistedAdminSession {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const value = candidate as Partial<PersistedAdminSession>;

  return Boolean(
    typeof value.token === 'string' &&
      value.user &&
      typeof value.user.id === 'string' &&
      typeof value.user.name === 'string' &&
      typeof value.user.email === 'string' &&
      typeof value.user.role === 'string' &&
      typeof value.user.lastLoginAt === 'string',
  );
}

export function normalizeAppPath(path: string): string {
  const [pathname] = path.split('?');
  const rawPath = pathname || '/';
  const trimmed = rawPath.replace(/\/+$/, '') || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function dashboardPathByRole(role: AppRole): string {
  return DASHBOARD_PATH_BY_ROLE[role];
}

export function redirectToPath(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedPath = normalizeAppPath(path);
  const targetHash = `#${normalizedPath}`;

  if (window.location.hash !== targetHash) {
    window.location.hash = normalizedPath;
  }
}

export function redirectToRoleDashboard(role: AppRole): void {
  redirectToPath(dashboardPathByRole(role));
}

export function redirectToAuth(): void {
  redirectToPath('/auth');
}

export function resolveAuthenticatedRole(params: {
  isHospitalAuthenticated: boolean;
  isDriverAuthenticated: boolean;
  hasAdminSession: boolean;
}): AppRole | null {
  const { isHospitalAuthenticated, isDriverAuthenticated, hasAdminSession } = params;

  if (isDriverAuthenticated) {
    return 'driver';
  }

  if (isHospitalAuthenticated) {
    return 'hospital';
  }

  if (hasAdminSession) {
    return 'admin';
  }

  return null;
}

export function readStoredAdminSession(): PersistedAdminSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPersistedAdminSession(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function persistAdminSession(session: PersistableAdminSessionInput): PersistedAdminSession {
  const normalizedSession: PersistedAdminSession = {
    token: session.token,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role || 'admin',
      lastLoginAt: new Date().toISOString(),
    },
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify(normalizedSession));
  }

  return normalizedSession;
}

export function clearStoredAdminSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
}

export function grantAdminAuthUnlock(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(ADMIN_AUTH_UNLOCK_STORAGE_KEY, 'granted');
}

export function hasAdminAuthUnlock(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(ADMIN_AUTH_UNLOCK_STORAGE_KEY) === 'granted';
}

export function clearAdminAuthUnlock(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(ADMIN_AUTH_UNLOCK_STORAGE_KEY);
}
