import { type ReactElement } from 'react';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthPage } from '@/pages/Auth/AuthPage';
import { type AppRole } from '@/utils/redirectByRole';
import { AdminPanel } from "@modules/admin/pages/AdminPanel";
import { DriverAnalytics } from "@modules/driver/pages/DriverAnalytics";
import { DriverEarnings } from "@modules/driver/pages/DriverEarnings";
import { DriverSettings } from "@modules/driver/pages/DriverSettings";
import { LiveMission } from "@modules/driver/pages/LiveMission";
import { MyMissions } from "@modules/driver/pages/MyMissions";
import { HospitalDashboard } from "@modules/hospital/pages/HospitalDashboard";
import LandingPage from '@shared/pages/LandingPage';

type RouteElement = () => ReactElement | null;

export interface AppRoute {
  path: string;
  element: RouteElement;
  redirectTo?: string;
}

function EmptyRoute() {
  return <></>;
}

function withRoleProtection(Component: RouteElement, role: AppRole): RouteElement {
  return function ProtectedPage() {
    return (
      <ProtectedRoute role={role}>
        <Component />
      </ProtectedRoute>
    );
  };
}

const HospitalDashboardRoute = withRoleProtection(HospitalDashboard, 'hospital');
const DriverAnalyticsRoute = withRoleProtection(DriverAnalytics, 'driver');
const DriverMissionRoute = withRoleProtection(LiveMission, 'driver');
const DriverDeliveriesRoute = withRoleProtection(MyMissions, 'driver');
const DriverEarningsRoute = withRoleProtection(DriverEarnings, 'driver');
const DriverSettingsRoute = withRoleProtection(DriverSettings, 'driver');
const AdminDashboardRoute = withRoleProtection(AdminPanel, 'admin');

export const routes: AppRoute[] = [
  { path: '/', element: LandingPage },
  { path: '/auth', element: AuthPage },
  { path: '/hospital/auth', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/driver/auth', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/admin/auth', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/hospital/login', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/driver/login', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/admin/login', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/hospital/signup', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/driver/signup', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/admin/signup', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/hospital', element: HospitalDashboardRoute },
  { path: '/hospital-dashboard', element: HospitalDashboardRoute },
  { path: '/hospital/dashboard', element: HospitalDashboardRoute },
  { path: '/driver', element: DriverAnalyticsRoute },
  { path: '/driver-dashboard', element: DriverAnalyticsRoute },
  { path: '/driver/dashboard', element: DriverAnalyticsRoute },
  { path: '/driver/mission', element: DriverMissionRoute },
  { path: '/driver/deliveries', element: DriverDeliveriesRoute },
  { path: '/driver/earnings', element: DriverEarningsRoute },
  { path: '/driver/settings', element: DriverSettingsRoute },
  { path: '/driver/analytics', element: DriverAnalyticsRoute },
  { path: '/admin', element: AdminDashboardRoute },
  { path: '/admin-dashboard', element: AdminDashboardRoute },
  { path: '/admin/dashboard', element: AdminDashboardRoute },
];
