import { AdminPanel } from '@modules/admin/pages/AdminPanel';
import CarSitePage from '@modules/car/pages/CarSitePage';
import { DriverDashboard } from '@modules/driver/pages/DriverDashboard';
import { HospitalDashboard } from '@modules/hospital/pages/HospitalDashboard';
import LandingPage from '@modules/shared/pages/LandingPage';

export const appRoutes = [
  { path: '/', element: LandingPage },
  { path: '/original', element: LandingPage },
  { path: '/car', element: CarSitePage },
  { path: '/hospital', element: HospitalDashboard },
  { path: '/driver', element: DriverDashboard },
  { path: '/admin', element: AdminPanel },
];
