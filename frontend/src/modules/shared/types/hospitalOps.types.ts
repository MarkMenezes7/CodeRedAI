export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low';

export type RequestStatus = 'new' | 'triaged' | 'dispatched' | 'completed' | 'cancelled';

export type DriverStatus = 'available' | 'to_patient' | 'with_patient' | 'to_hospital' | 'offline';

export type RequestChannel = 'whatsapp' | 'call-center' | 'mobile-app';

export type CarAccidentStatus = 'new' | 'acknowledged' | 'resolved';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface HospitalBedState {
  totalBeds: number;
  occupiedBeds: number;
  icuTotal: number;
  icuOccupied: number;
}

export interface HospitalUnit {
  id: string;
  name: string;
  address: string;
  phone: string;
  location: GeoPoint;
  beds: HospitalBedState;
}

export interface DriverAssignment {
  requestId: string;
  stage: 'to_patient' | 'with_patient' | 'to_hospital';
  stageTicks: number;
  route?: GeoPoint[];
  routeIndex?: number;
  hospitalRoute?: GeoPoint[];
}

export interface HospitalLocationRef {
  id: string;
  name: string;
  address: string;
  phone?: string;
  location: GeoPoint;
}

export interface DriverUnit {
  id: string;
  callSign: string;
  name: string;
  vehicleNumber: string;
  phone: string;
  linkedHospitalId: string;
  status: DriverStatus;
  occupied: boolean;
  location: GeoPoint;
  speedKmph: number;
  fuelPct: number;
  lastPingAt: string;
  pingIntervalSec: number;
  secondsSincePing: number;
  etaMinutes?: number;
  assignment?: DriverAssignment;
}

export interface PatientRequest {
  id: string;
  patientName: string;
  age: number;
  severity: SeverityLevel;
  symptom: string;
  address: string;
  location: GeoPoint;
  channel: RequestChannel;
  reportedAt: string;
  status: RequestStatus;
  assignedDriverId?: string;
  hospitalId?: string;
  notes?: string;
  closedAt?: string;
}

export interface CarAccidentAlert {
  id: string;
  carName: string;
  carModel: string;
  personName: string;
  personPhone: string;
  location: GeoPoint;
  severity: SeverityLevel;
  airbagsActivatedAt: string;
  hospitalId: string;
  notifiedDriverIds: string[];
  status: CarAccidentStatus;
  notes?: string;
}

export type OpsEventType =
  | 'incoming'
  | 'triage'
  | 'dispatch'
  | 'arrival'
  | 'handover'
  | 'capacity'
  | 'car_accident'
  | 'system';

export interface OpsEvent {
  id: string;
  at: string;
  type: OpsEventType;
  message: string;
  requestId?: string;
  driverId?: string;
}

export interface DispatchOffer {
  id: string;
  requestId: string;
  offeredDriverId: string;
  offeredAt: string;
  expiresAt: string;
}

export interface HospitalOpsState {
  hospital: HospitalUnit;
  drivers: DriverUnit[];
  requests: PatientRequest[];
  carAccidents?: CarAccidentAlert[];
  pendingDispatchOffers?: DispatchOffer[];
  events: OpsEvent[];
  nextRequestNumber: number;
  lastSimulationAt: string;
}
