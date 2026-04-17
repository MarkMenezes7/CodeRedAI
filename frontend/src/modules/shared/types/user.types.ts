export interface User {
  id: string;
  name: string;
  email?: string;
  role: 'patient' | 'hospital' | 'driver' | 'admin';
}
