import { type ReactElement } from 'react';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthPage } from '@/pages/Auth/AuthPage';
import { type AppRole } from '@/utils/redirectByRole';
import { AdminPanel } from "@modules/admin/pages/AdminPanel";
import { AdminLoginTransitionPage } from "@modules/admin/pages/AdminLoginTransitionPage";
import { DriverAnalytics } from "@modules/driver/pages/DriverAnalytics";
import { DriverEarnings } from "@modules/driver/pages/DriverEarnings";
import { DriverLoginTransitionPage } from "@modules/driver/pages/DriverLoginTransitionPage";
import { DriverSettings } from "@modules/driver/pages/DriverSettings";
import { LiveMission } from "@modules/driver/pages/LiveMission";
import { MyMissions } from "@modules/driver/pages/MyMissions";
import CarSitePage from '@modules/car/pages/CarSitePage';
import { HospitalDashboard } from "@modules/hospital/pages/HospitalDashboard";
import { HospitalLoginTransitionPage } from "@modules/hospital/pages/HospitalLoginTransitionPage";
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
const DriverLoginTransitionRoute = withRoleProtection(DriverLoginTransitionPage, 'driver');
const AdminDashboardRoute = withRoleProtection(AdminPanel, 'admin');
const AdminLoginTransitionRoute = withRoleProtection(AdminLoginTransitionPage, 'admin');
const HospitalLoginTransitionRoute = withRoleProtection(HospitalLoginTransitionPage, 'hospital');

export const routes: AppRoute[] = [
  { path: '/', element: LandingPage },
  { path: '/original', element: LandingPage },
  { path: '/car', element: CarSitePage },
  { path: '/auth', element: AuthPage },
  { path: '/hospital/auth', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/driver/auth', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/admin/auth', element: AuthPage },
  { path: '/hospital/login', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/driver/login', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/admin/login', element: AuthPage },
  { path: '/hospital/signup', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/driver/signup', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/admin/signup', element: EmptyRoute, redirectTo: '/auth' },
  { path: '/hospital', element: HospitalDashboardRoute },
  { path: '/hospital-dashboard', element: HospitalDashboardRoute },
  { path: '/hospital/dashboard', element: HospitalDashboardRoute },
  { path: '/hospital/login-transition', element: HospitalLoginTransitionRoute },
  { path: '/driver', element: DriverMissionRoute },
  { path: '/driver-dashboard', element: DriverMissionRoute },
  { path: '/driver/dashboard', element: DriverAnalyticsRoute },
  { path: '/driver/login-transition', element: DriverLoginTransitionRoute },
  { path: '/driver/mission', element: DriverMissionRoute },
  { path: '/driver/deliveries', element: DriverDeliveriesRoute },
  { path: '/driver/earnings', element: DriverEarningsRoute },
  { path: '/driver/settings', element: DriverSettingsRoute },
  { path: '/driver/analytics', element: DriverAnalyticsRoute },
  { path: '/admin', element: AdminDashboardRoute },
  { path: '/admin/login-transition', element: AdminLoginTransitionRoute },
  { path: '/admin-dashboard', element: AdminDashboardRoute },
  { path: '/admin/dashboard', element: AdminDashboardRoute },
];
