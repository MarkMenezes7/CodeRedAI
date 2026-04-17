import { AdminPanel } from '@modules/admin/pages/AdminPanel';
import { DriverDashboard } from '@modules/driver/pages/DriverDashboard';
import { HospitalDashboard } from '@modules/hospital/pages/HospitalDashboard';
import LandingPage from '@modules/shared/pages/LandingPage';

export const appRoutes = [
  { path: '/', element: LandingPage },
  { path: '/hospital', element: HospitalDashboard },
  { path: '/driver', element: DriverDashboard },
  { path: '/admin', element: AdminPanel },
];
