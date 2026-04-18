import { apiRequest } from './api';

export interface CarAccidentAlert {
  id: string;
  carName: string;
  carModel: string;
  personName: string;
  personPhone: string;
  lat: number;
  lng: number;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  status: 'new' | 'acknowledged' | 'resolved';
  airbagsActivated: boolean;
  notifiedHospitalIds: string[];
  notifiedDriverIds: string[];
  assignedHospitalId?: string | null;
  assignedHospitalName?: string | null;
  assignedHospitalAddress?: string | null;
  assignedHospitalLat?: number | null;
  assignedHospitalLng?: number | null;
  assignedDriverId?: string | null;
  mirroredEmergencyId?: string | null;
  hospitalRejectedIds: string[];
  driverRejectedIds: string[];
  notes: string;
  createdAt: string;
}

export interface NotifiedHospital {
  hospitalId: string;
  name: string;
}

export interface NotifiedDriver {
  driverId: string;
  name: string;
  callSign?: string;
}

export interface CreateCarAccidentPayload {
  carName: string;
  carModel: string;
  personName: string;
  personPhone: string;
  lat: number;
  lng: number;
  severity?: 'critical' | 'high' | 'moderate' | 'low';
  airbagsActivated?: boolean;
  notes?: string;
}

interface BackendCarAccidentAlert {
  id: string;
  car_name: string;
  car_model: string;
  person_name: string;
  person_phone: string;
  lat: number;
  lng: number;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  status: 'new' | 'acknowledged' | 'resolved';
  airbags_activated: boolean;
  notified_hospital_ids: string[];
  notified_driver_ids: string[];
  assigned_hospital_id?: string | null;
  assigned_hospital_name?: string | null;
  assigned_hospital_address?: string | null;
  assigned_hospital_lat?: number | null;
  assigned_hospital_lng?: number | null;
  assigned_driver_id?: string | null;
  mirrored_emergency_id?: string | null;
  hospital_rejected_ids?: string[];
  driver_rejected_ids?: string[];
  notes: string;
  created_at: string;
}

interface BackendNotifiedHospital {
  hospital_id: string;
  name: string;
}

interface BackendNotifiedDriver {
  driver_id: string;
  name: string;
  call_sign?: string;
}

interface BackendCreateCarAccidentResponse {
  success: boolean;
  message: string;
  alert: BackendCarAccidentAlert;
  notified_hospitals: BackendNotifiedHospital[];
  notified_drivers: BackendNotifiedDriver[];
}

interface BackendListCarAccidentsResponse {
  success: boolean;
  count: number;
  alerts: BackendCarAccidentAlert[];
}

interface BackendCarAccidentActionResponse {
  success: boolean;
  message: string;
  alert: BackendCarAccidentAlert;
}

function mapAlert(alert: BackendCarAccidentAlert): CarAccidentAlert {
  return {
    id: alert.id,
    carName: alert.car_name,
    carModel: alert.car_model,
    personName: alert.person_name,
    personPhone: alert.person_phone,
    lat: alert.lat,
    lng: alert.lng,
    severity: alert.severity,
    status: alert.status,
    airbagsActivated: alert.airbags_activated,
    notifiedHospitalIds: Array.isArray(alert.notified_hospital_ids) ? alert.notified_hospital_ids : [],
    notifiedDriverIds: Array.isArray(alert.notified_driver_ids) ? alert.notified_driver_ids : [],
    assignedHospitalId: alert.assigned_hospital_id ?? null,
    assignedHospitalName: alert.assigned_hospital_name ?? null,
    assignedHospitalAddress: alert.assigned_hospital_address ?? null,
    assignedHospitalLat: alert.assigned_hospital_lat ?? null,
    assignedHospitalLng: alert.assigned_hospital_lng ?? null,
    assignedDriverId: alert.assigned_driver_id ?? null,
    mirroredEmergencyId: alert.mirrored_emergency_id ?? null,
    hospitalRejectedIds: Array.isArray(alert.hospital_rejected_ids) ? alert.hospital_rejected_ids : [],
    driverRejectedIds: Array.isArray(alert.driver_rejected_ids) ? alert.driver_rejected_ids : [],
    notes: alert.notes || '',
    createdAt: alert.created_at,
  };
}

function mapHospital(hospital: BackendNotifiedHospital): NotifiedHospital {
  return {
    hospitalId: hospital.hospital_id,
    name: hospital.name,
  };
}

function mapDriver(driver: BackendNotifiedDriver): NotifiedDriver {
  return {
    driverId: driver.driver_id,
    name: driver.name,
    callSign: driver.call_sign,
  };
}

export async function createCarAccidentAlert(payload: CreateCarAccidentPayload): Promise<{
  message: string;
  alert: CarAccidentAlert;
  notifiedHospitals: NotifiedHospital[];
  notifiedDrivers: NotifiedDriver[];
}> {
  const response = await apiRequest<BackendCreateCarAccidentResponse>('/api/car-accidents', {
    method: 'POST',
    body: JSON.stringify({
      car_name: payload.carName,
      car_model: payload.carModel,
      person_name: payload.personName,
      person_phone: payload.personPhone,
      lat: payload.lat,
      lng: payload.lng,
      severity: payload.severity ?? 'high',
      airbags_activated: payload.airbagsActivated ?? true,
      notes: payload.notes ?? '',
    }),
  });

  return {
    message: response.message,
    alert: mapAlert(response.alert),
    notifiedHospitals: response.notified_hospitals.map(mapHospital),
    notifiedDrivers: response.notified_drivers.map(mapDriver),
  };
}

export async function listCarAccidentAlerts(limit = 30): Promise<CarAccidentAlert[]> {
  const response = await apiRequest<BackendListCarAccidentsResponse>(`/api/car-accidents?limit=${limit}`);
  return response.alerts.map(mapAlert);
}

export async function acceptDriverCarAccidentAlert(alertId: string, driverId: string): Promise<{
  message: string;
  alert: CarAccidentAlert;
}> {
  const response = await apiRequest<BackendCarAccidentActionResponse>(
    `/api/car-accidents/${encodeURIComponent(alertId)}/driver/accept`,
    {
      method: 'POST',
      body: JSON.stringify({ driver_id: driverId }),
    },
  );

  return {
    message: response.message,
    alert: mapAlert(response.alert),
  };
}

export async function rejectDriverCarAccidentAlert(alertId: string, driverId: string): Promise<{
  message: string;
  alert: CarAccidentAlert;
}> {
  const response = await apiRequest<BackendCarAccidentActionResponse>(
    `/api/car-accidents/${encodeURIComponent(alertId)}/driver/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ driver_id: driverId }),
    },
  );

  return {
    message: response.message,
    alert: mapAlert(response.alert),
  };
}

export async function acceptHospitalCarAccidentAlert(alertId: string, hospitalId: string): Promise<{
  message: string;
  alert: CarAccidentAlert;
}> {
  const response = await apiRequest<BackendCarAccidentActionResponse>(
    `/api/car-accidents/${encodeURIComponent(alertId)}/hospital/accept`,
    {
      method: 'POST',
      body: JSON.stringify({ hospital_id: hospitalId }),
    },
  );

  return {
    message: response.message,
    alert: mapAlert(response.alert),
  };
}

export async function rejectHospitalCarAccidentAlert(alertId: string, hospitalId: string): Promise<{
  message: string;
  alert: CarAccidentAlert;
}> {
  const response = await apiRequest<BackendCarAccidentActionResponse>(
    `/api/car-accidents/${encodeURIComponent(alertId)}/hospital/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ hospital_id: hospitalId }),
    },
  );

  return {
    message: response.message,
    alert: mapAlert(response.alert),
  };
}
