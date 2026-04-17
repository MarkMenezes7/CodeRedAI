import { AdminPanel } from "@modules/admin/pages/AdminPanel";
import { DriverAnalytics } from "@modules/driver/pages/DriverAnalytics";
import { DriverEarnings } from "@modules/driver/pages/DriverEarnings";
import { DriverSettings } from "@modules/driver/pages/DriverSettings";
import { LiveMission } from "@modules/driver/pages/LiveMission";
import { MyMissions } from "@modules/driver/pages/MyMissions";
import { HospitalDashboard } from "@modules/hospital/pages/HospitalDashboard";
import LandingPage from '@shared/pages/LandingPage';

export const routes = [
  { path: '/', element: LandingPage },
  { path: '/hospital', element: HospitalDashboard },
  { path: '/hospital-dashboard', element: HospitalDashboard },
  { path: '/driver', element: DriverAnalytics },
  { path: '/driver-dashboard', element: DriverAnalytics },
  { path: '/driver/dashboard', element: DriverAnalytics },
  { path: '/driver/mission', element: LiveMission },
  { path: '/driver/deliveries', element: MyMissions },
  { path: '/driver/earnings', element: DriverEarnings },
  { path: '/driver/settings', element: DriverSettings },
  { path: '/driver/analytics', element: DriverAnalytics },
  { path: '/admin', element: AdminPanel },
  { path: '/admin-dashboard', element: AdminPanel },
];
