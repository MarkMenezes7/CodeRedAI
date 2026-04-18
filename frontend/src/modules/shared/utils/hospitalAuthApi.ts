import { apiRequest } from './api';

export interface HospitalAuthUser {
  id: string;
  name: string;
  email: string;
  hospitalId?: string;
  bedCapacity?: number;
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
    hospitalId?: string;
    bedCapacity?: number;
    address?: string;
    status?: string;
    createdAt?: string;
    location?: {
      lat: number;
      lng: number;
    };
  }>;
}

export type PresetHospitalDirectoryRecord = PresetHospitalResponse['hospitals'][number];

export interface HospitalSignupPayload {
  hospitalId: string;
  email: string;
  password: string;
  bedCapacity: number;
  location: {
    lat: number;
    lng: number;
  };
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
  const response = await apiRequest<PresetHospitalResponse>('/api/hospital/presets?limit=200');
  return {
    emails: response.hospitals.map((hospital) => hospital.email),
    defaultPassword: response.defaultPassword,
  };
}

export async function getLiveHospitalRecords(limit = 200): Promise<PresetHospitalDirectoryRecord[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.round(limit))) : 200;
  const response = await apiRequest<PresetHospitalResponse>(`/api/hospital/presets?limit=${safeLimit}`);
  return response.hospitals;
}

export interface HospitalProfileResponse extends HospitalAuthUser {
  success: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HospitalProfileUpdatePayload {
  hospital_id: string;
  name?: string;
  email?: string;
  address?: string;
  bed_capacity?: number;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface HospitalProfileUpdateResponse {
  success: boolean;
  message: string;
  user?: HospitalAuthUser;
}

export async function fetchHospitalProfile(hospitalId: string): Promise<HospitalProfileResponse> {
  return apiRequest<HospitalProfileResponse>(`/api/hospital/profile?hospital_id=${encodeURIComponent(hospitalId)}`, {
    method: 'GET',
  });
}

export async function updateHospitalProfile(payload: HospitalProfileUpdatePayload): Promise<HospitalProfileUpdateResponse> {
  return apiRequest<HospitalProfileUpdateResponse>('/api/hospital/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
