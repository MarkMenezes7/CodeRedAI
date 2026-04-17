import { apiRequest } from './api';

export interface AdminAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AdminAuthSession {
  user: AdminAuthUser;
  token: string;
}

export interface AdminSignupPayload {
  adminName: string;
  email: string;
  password: string;
}

export async function loginAdmin(payload: { email: string; password: string }): Promise<AdminAuthSession> {
  return apiRequest<AdminAuthSession>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function signupAdmin(payload: AdminSignupPayload): Promise<AdminAuthSession> {
  return apiRequest<AdminAuthSession>('/api/admin/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
