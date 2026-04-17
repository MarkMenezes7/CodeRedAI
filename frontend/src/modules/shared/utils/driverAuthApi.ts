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
}

interface PresetDriverResponse {
  defaultPassword: string;
  drivers: PresetDriverAccount[];
}

export interface DriverSignupPayload {
  driverName: string;
  email: string;
  password: string;
  phone?: string;
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

export async function getPresetDriverAccounts(): Promise<{
  emails: string[];
  defaultPassword: string;
  drivers: PresetDriverAccount[];
}> {
  const response = await apiRequest<PresetDriverResponse>('/api/driver/presets');
  return {
    emails: response.drivers.map((driver) => driver.email),
    defaultPassword: response.defaultPassword,
    drivers: response.drivers,
  };
}
