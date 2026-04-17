import { apiRequest } from './api';

export interface HospitalAuthUser {
  id: string;
  name: string;
  email: string;
  address?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface HospitalAuthSession {
  user: HospitalAuthUser;
  token: string;
}

interface PresetHospitalResponse {
  defaultPassword: string;
  hospitals: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export interface HospitalSignupPayload {
  hospitalName: string;
  email: string;
  password: string;
}

export async function loginHospital(payload: { email: string; password: string }): Promise<HospitalAuthSession> {
  const response = await apiRequest<HospitalAuthSession>('/api/hospital/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response;
}

export async function signupHospital(payload: HospitalSignupPayload): Promise<HospitalAuthSession> {
  const response = await apiRequest<HospitalAuthSession>('/api/hospital/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response;
}

export async function getPresetHospitalAccounts(): Promise<{ emails: string[]; defaultPassword: string }> {
  const response = await apiRequest<PresetHospitalResponse>('/api/hospital/presets');
  return {
    emails: response.hospitals.map((hospital) => hospital.email),
    defaultPassword: response.defaultPassword,
  };
}
