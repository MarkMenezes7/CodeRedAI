import { apiRequest } from './api';

export interface DriverAuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  callSign?: string;
  vehicleNumber?: string;
  linkedHospitalId?: string;
}

export interface DriverAuthSession {
  user: DriverAuthUser;
  token: string;
}

export interface PresetDriverAccount {
  id: string;
  name: string;
  email: string;
  callSign?: string;
  phone?: string;
  vehicleNumber?: string;
  linkedHospitalId?: string;
  dispatchStatus?: string;
  isLoggedIn?: boolean;
  location?: { lat: number; lng: number };
  speedKmph?: number;
}

export interface GetPresetDriverOptions {
  hospitalId?: string;
  availableOnly?: boolean;
}

interface PresetDriverResponse {
  defaultPassword: string;
  drivers: PresetDriverAccount[];
}

export interface DriverSignupPayload {
  driverName: string;
  email: string;
  password: string;
  phone: string;
  vehicleNumber: string;
  linkedHospitalId: string;
}

export async function loginDriver(payload: { email: string; password: string }): Promise<DriverAuthSession> {
  const response = await apiRequest<DriverAuthSession>('/api/driver/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response;
}

export async function signupDriver(payload: DriverSignupPayload): Promise<DriverAuthSession> {
  const response = await apiRequest<DriverAuthSession>('/api/driver/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response;
}

export async function getPresetDriverAccounts(options: GetPresetDriverOptions = {}): Promise<{
  emails: string[];
  defaultPassword: string;
  drivers: PresetDriverAccount[];
}> {
  const query = new URLSearchParams();

  if (options.hospitalId?.trim()) {
    query.set('hospitalId', options.hospitalId.trim().toUpperCase());
  }

  if (options.availableOnly) {
    query.set('availableOnly', 'true');
  }

  const endpoint = query.toString().length > 0 ? `/api/driver/presets?${query.toString()}` : '/api/driver/presets';
  const response = await apiRequest<PresetDriverResponse>(endpoint);
  return {
    emails: response.drivers.map((driver) => driver.email),
    defaultPassword: response.defaultPassword,
    drivers: response.drivers,
  };
}
