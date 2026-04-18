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

export interface RecommendedHospital {
  hospital_id: string;
  name: string;
  address: string;
  available_beds?: number;
  lat?: number;
  lng?: number;
  distance_m?: number;
}

export interface MissionUpdateResponse {
  success: boolean;
  message: string;
  new_status: string;
  recommended_hospital?: RecommendedHospital;
}

export interface LocationUpdateResponse {
  success: boolean;
  message: string;
}

// ─── Mission History ───────────────────────────────────────
export interface MissionRecord {
  missionId: string;
  createdAt: string;
  completedAt: string | null;
  patientPhone: string;
  patientAddress: string;
  patientLat: number | null;
  patientLng: number | null;
  emergencyType: string;
  severity: string;
  priority: string;
  status: string;
  rawStatus: string;
  distanceKm: number;
  durationMin: number;
  responseTimeMin: number;
  basePay: number;
  bonus: number;
  earningsInr: number;
  goldenHourMet: boolean;
  payoutStatus: string;
  assignedHospital: string | null;
  assignedHospitalName: string | null;
}

export interface MissionsResponse {
  success: boolean;
  count: number;
  missions: MissionRecord[];
}

// ─── Earnings ──────────────────────────────────────────────
export interface EarningsData {
  success: boolean;
  totalEarnings: number;
  thisWeekEarnings: number;
  thisMonthEarnings: number;
  pendingPayout: number;
  totalBonuses: number;
  avgPerMission: number;
  weeklyChart: { week: string; amount: number }[];
  completedMissions: number;
}

// ─── Stats ─────────────────────────────────────────────────
export interface DriverStats {
  success: boolean;
  totalMissions: number;
  completedMissions: number;
  ongoingMissions: number;
  cancelledMissions: number;
  totalEarnings: number;
  totalDistance: number;
  avgResponseTimeMin: number;
  goldenHourRate: number;
  successRate: number;
}

// ─── Profile ───────────────────────────────────────────────
export interface DriverProfile {
  success: boolean;
  driver_id: string;
  name: string;
  email: string;
  phone: string;
  dispatch_status: string;
  call_sign: string;
  vehicle_id: string;
  joined_at: string | null;
  settings: Record<string, unknown>;
}

// ─── Existing API Functions ────────────────────────────────

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

// ─── New API Functions ─────────────────────────────────────

export async function fetchDriverMissions(driverId: string): Promise<MissionsResponse> {
  return apiRequest<MissionsResponse>(`/api/driver/missions?driver_id=${encodeURIComponent(driverId)}`, {
    method: 'GET',
  });
}

export async function fetchDriverEarnings(driverId: string): Promise<EarningsData> {
  return apiRequest<EarningsData>(`/api/driver/earnings?driver_id=${encodeURIComponent(driverId)}`, {
    method: 'GET',
  });
}

export async function fetchDriverStats(driverId: string): Promise<DriverStats> {
  return apiRequest<DriverStats>(`/api/driver/stats?driver_id=${encodeURIComponent(driverId)}`, {
    method: 'GET',
  });
}

export async function fetchDriverProfile(driverId: string): Promise<DriverProfile> {
  return apiRequest<DriverProfile>(`/api/driver/profile?driver_id=${encodeURIComponent(driverId)}`, {
    method: 'GET',
  });
}

export async function updateDriverProfileApi(payload: { driver_id: string; name?: string; phone?: string }): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/api/driver/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateDriverSettingsApi(payload: Record<string, unknown> & { driver_id: string }): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/api/driver/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
