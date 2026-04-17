import { AdminPanel } from "@modules/admin/pages/AdminPanel";
import { DriverDashboard } from "@modules/driver/pages/DriverDashboard";
import { HospitalDashboard } from "@modules/hospital/pages/HospitalDashboard";
import LandingPage from '@shared/pages/LandingPage';

export const routes = [
  { path: '/', element: LandingPage },
  { path: '/hospital', element: HospitalDashboard },
  { path: '/hospital-dashboard', element: HospitalDashboard },
  { path: '/driver', element: DriverDashboard },
  { path: '/driver-dashboard', element: DriverDashboard },
  { path: '/admin', element: AdminPanel },
  { path: '/admin-dashboard', element: AdminPanel },
];
