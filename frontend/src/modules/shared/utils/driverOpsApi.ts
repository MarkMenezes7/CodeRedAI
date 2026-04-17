import { apiRequest } from './api';

export interface DriverLocationUpdate {
  driver_id: string;
  lat: number;
  lng: number;
  speed_kmph?: number;
  heading?: number;
}

export interface DriverOfferItem {
  offer_id: string;
  emergency_id: string;
  patient_phone: string;
  patient_address: string;
  patient_lat?: number;
  patient_lng?: number;
  emergency_type: string;
  severity: string;
  distance_m?: number;
  created_at?: string;
  expires_at: string;
  assigned_hospital?: string;
}

export interface DriverOffersResponse {
  success: boolean;
  count: number;
  offers: DriverOfferItem[];
}

export interface DriverOfferActionPayload {
  driver_id: string;
  emergency_id: string;
  offer_id: string;
}

export interface DriverOfferActionResponse {
  success: boolean;
  message: string;
  emergency_id?: string;
  assigned: boolean;
}

export interface ActiveMission {
  emergency_id: string;
  status: string;
  patient_phone: string;
  patient_address: string;
  patient_lat?: number;
  patient_lng?: number;
  emergency_type: string;
  severity: string;
  assigned_hospital_id?: string;
  assigned_hospital_name?: string;
  hospital_lat?: number;
  hospital_lng?: number;
  created_at?: string;
  driver_assigned_at?: string;
}

export interface ActiveMissionResponse {
  success: boolean;
  mission: ActiveMission | null;
  message: string;
}

export interface MissionStatusUpdate {
  driver_id: string;
  emergency_id: string;
  status: string;
  lat?: number;
  lng?: number;
}

export interface MissionUpdateResponse {
  success: boolean;
  message: string;
  new_status: string;
}

export interface LocationUpdateResponse {
  success: boolean;
  message: string;
}

export async function pingDriverLocation(payload: DriverLocationUpdate): Promise<LocationUpdateResponse> {
  return apiRequest<LocationUpdateResponse>('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchDriverOffers(driverId: string): Promise<DriverOffersResponse> {
  return apiRequest<DriverOffersResponse>(`/api/driver/offers?driver_id=${encodeURIComponent(driverId)}`, {
    method: 'GET',
  });
}

export async function acceptDriverOffer(payload: DriverOfferActionPayload): Promise<DriverOfferActionResponse> {
  return apiRequest<DriverOfferActionResponse>('/api/driver/offer/accept', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function rejectDriverOffer(payload: DriverOfferActionPayload): Promise<DriverOfferActionResponse> {
  return apiRequest<DriverOfferActionResponse>('/api/driver/offer/reject', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchActiveMission(driverId: string): Promise<ActiveMissionResponse> {
  return apiRequest<ActiveMissionResponse>(`/api/driver/active-mission?driver_id=${encodeURIComponent(driverId)}`, {
    method: 'GET',
  });
}

export async function updateMissionStatus(payload: MissionStatusUpdate): Promise<MissionUpdateResponse> {
  return apiRequest<MissionUpdateResponse>('/api/driver/mission/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
