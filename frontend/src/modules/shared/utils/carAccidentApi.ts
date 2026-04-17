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
