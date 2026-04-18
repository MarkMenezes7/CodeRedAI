import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CarFront,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';


import { AlertBanner } from '@shared/components/AlertBanner';
import { MapView } from '@shared/components/MapView';
import { StatusBadge } from '@shared/components/StatusBadge';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import { getPresetDriverAccounts, type PresetDriverAccount } from '@shared/utils/driverAuthApi';
import {
  DispatchOffer,
  DriverStatus,
  DriverUnit,
  HospitalBedState,
  HospitalLocationRef,
  HospitalOpsState,
  OpsEvent,
  OpsEventType,
  PatientRequest,
  RequestStatus,
  SeverityLevel,
} from '@shared/types/hospitalOps.types';
import {
  createInitialHospitalOpsState,
  MUMBAI_REAL_HOSPITALS,
} from '@shared/utils/hospitalDemoData';
import {
  acceptHospitalCarAccidentAlert,
  listCarAccidentAlerts,
  rejectHospitalCarAccidentAlert,
  type CarAccidentAlert as ApiCarAccidentAlert,
} from '@shared/utils/carAccidentApi';
import {
  buildRoadRoute,
  createRoadAnchorAssignments,
  routeDistanceKm,
  runDriverPingCycle,
  snapPointToRoad,
} from '@shared/utils/hospitalOpsSimulator';
import { formatDate } from '@shared/utils/formatters';
import './HospitalDashboard.css';

const STORAGE_KEY_PREFIX = 'codered-hospital-demo-v3';
const ALERT_BASELINE_KEY_PREFIX = 'codered-hospital-alert-baseline-v1';
const DRIVER_PING_SECONDS = 5;
const ROSTER_SYNC_SECONDS = 12;
const DISPATCH_OFFER_SECONDS = 60;
const MOBILE_NAV_QUERY = '(max-width: 980px)';

type HospitalSectionKey = 'dashboard' | 'queue' | 'ambulance' | 'beds' | 'carAccidents';

const hospitalSections: Array<{ key: HospitalSectionKey; label: string; description: string; icon: LucideIcon }> = [
  { key: 'dashboard',  label: 'Dashboard',            description: 'Analytics and live hospital overview',           icon: LayoutDashboard },
  { key: 'queue',      label: 'Patient Queue',         description: 'Queue, live map, and dispatch control',          icon: Radio },
  { key: 'beds',       label: 'Bed Manager',           description: 'Bed and ICU capacity controls',                  icon: ShieldCheck },
  { key: 'carAccidents', label: 'Car Accidents',       description: 'Airbag-triggered accident alerts and victim details', icon: CarFront },
];

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_NAV_QUERY).matches;
}


const severityPriority: Record<SeverityLevel, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
};

const severityTone: Record<SeverityLevel, 'danger' | 'warning' | 'info' | 'neutral'> = {
  critical: 'danger',
  high: 'warning',
  moderate: 'info',
  low: 'neutral',
};

const requestStatusTone: Record<RequestStatus, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
  new: 'danger',
  triaged: 'warning',
  dispatched: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

const requestStatusLabel: Record<RequestStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const driverStatusTone: Record<DriverStatus, 'success' | 'danger' | 'info' | 'warning' | 'neutral'> = {
  available: 'success',
  to_patient: 'danger',
  with_patient: 'warning',
  to_hospital: 'info',
  offline: 'neutral',
};

const driverStatusLabel: Record<DriverStatus, string> = {
  available: 'Available',
  to_patient: 'En Route',
  with_patient: 'On Scene',
  to_hospital: 'To Hospital',
  offline: 'Offline',
};

const requestFilters: Array<{ key: 'all' | RequestStatus; label: string }> = [
  { key: 'all', label: 'All Open' },
  { key: 'new', label: 'New' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'dispatched', label: 'Dispatched' },
];

const DEFAULT_HOSPITAL_REF: HospitalLocationRef =
  MUMBAI_REAL_HOSPITALS.find((hospital) => hospital.id === 'HSP-MUM-001') ?? {
    id: 'HSP-MUM-001',
    name: 'Karuna Hospital',
    address: 'SVP Road, Dahisar West, Mumbai 400103',
    location: { lat: 19.244077, lng: 72.855981 },
  };

const knownHospitalRefById = new globalThis.Map(
  MUMBAI_REAL_HOSPITALS.map((hospital) => [hospital.id.toUpperCase(), hospital]),
);

function normalizeHospitalIdentifier(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function findHospitalCodeCandidate(values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeHospitalIdentifier(value);
    if (normalized && normalized.startsWith('HSP-')) {
      return normalized;
    }
  }

  return null;
}

function sanitizeCallSign(value: string | undefined) {
  return value?.trim() || undefined;
}

function stableSeedFromValue(value: string | undefined, fallbackSeed: number) {
  const source = (value || '').trim();
  if (!source) {
    return fallbackSeed;
  }

  let seed = 0;
  for (let index = 0; index < source.length; index += 1) {
    seed = (seed * 31 + source.charCodeAt(index)) % 10_000;
  }

  return seed;
}

function fallbackCallSign(account: PresetDriverAccount, seedIndex: number) {
  const source = (account.name || account.email).toUpperCase().replace(/[^A-Z]/g, '');
  const prefix = source.slice(0, 3) || 'DRV';
  const seed = stableSeedFromValue(account.id || account.email, seedIndex);
  return `${prefix}-${String((seed % 900) + 100)}`;
}

function mapPresetDriverStatus(account: PresetDriverAccount): DriverStatus {
  const dispatchStatus = (account.dispatchStatus ?? '').trim().toLowerCase();

  if (dispatchStatus === 'assigned' || dispatchStatus === 'on_mission') {
    return 'to_patient';
  }

  if (dispatchStatus === 'offline') {
    return 'offline';
  }

  if (dispatchStatus === 'available' || dispatchStatus === 'online') {
    return 'available';
  }

  if (account.isLoggedIn === true) {
    return 'available';
  }

  return 'offline';
}

function createRosterDriverUnit(
  account: PresetDriverAccount,
  hospitalId: string,
  hospitalLocation: { lat: number; lng: number },
  seedIndex: number,
): DriverUnit {
  const rosterStatus = mapPresetDriverStatus(account);
  const stableSeed = stableSeedFromValue(account.id || account.email, seedIndex);
  const angle = ((stableSeed * 57) % 360) * (Math.PI / 180);
  const radius = 0.0012 + ((stableSeed % 8) + 1) * 0.0002;
  const latOffset = Math.sin(angle) * radius;
  const lngOffset = Math.cos(angle) * radius;
  const seededLocation = snapPointToRoad({
    lat: hospitalLocation.lat + latOffset,
    lng: hospitalLocation.lng + lngOffset,
  });
  const accountLocation =
    account.location &&
    typeof account.location.lat === 'number' &&
    typeof account.location.lng === 'number'
      ? snapPointToRoad(account.location)
      : null;

  return {
    id: account.id,
    callSign: sanitizeCallSign(account.callSign) ?? fallbackCallSign(account, stableSeed),
    name: account.name || account.email,
    vehicleNumber:
      account.vehicleNumber?.trim() || `MH-01-EM-${String((seedIndex % 9000) + 1000).padStart(4, '0')}`,
    phone: account.phone?.trim() || `+91 90000 ${String((seedIndex % 100000)).padStart(5, '0')}`,
    linkedHospitalId: hospitalId,
    status: rosterStatus,
    occupied: rosterStatus !== 'available',
    location: accountLocation ?? seededLocation,
    speedKmph: rosterStatus === 'offline' ? 0 : account.speedKmph ?? 38 + (seedIndex % 14),
    fuelPct: 58 + (seedIndex % 40),
    lastPingAt: new Date().toISOString(),
    pingIntervalSec: 6,
    secondsSincePing: 0,
  };
}

function mergeGlobalAvailableDrivers(params: {
  stateDrivers: DriverUnit[];
  presetDrivers: PresetDriverAccount[];
  fallbackHospitalId: string;
  fallbackHospitalLocation: { lat: number; lng: number };
}): DriverUnit[] {
  const { stateDrivers, presetDrivers, fallbackHospitalId, fallbackHospitalLocation } = params;

  if (presetDrivers.length === 0) {
    return stateDrivers.length === 0 ? stateDrivers : [];
  }

  const existingById = new Map(stateDrivers.map((driver) => [driver.id, driver]));
  const nextDrivers: DriverUnit[] = [];
  let hasChanges = stateDrivers.length !== presetDrivers.length;

  presetDrivers.forEach((account, index) => {
    const driverId = account.id?.trim();
    if (!driverId) {
      return;
    }

    const normalizedLinkedHospitalId = normalizeHospitalIdentifier(account.linkedHospitalId) ?? fallbackHospitalId;
    const generated = createRosterDriverUnit(account, normalizedLinkedHospitalId, fallbackHospitalLocation, index);
    const existing = existingById.get(driverId);

    if (!existing) {
      nextDrivers.push(generated);
      hasChanges = true;
      return;
    }

    const rosterStatus = mapPresetDriverStatus(account);

    const mergedDriver: DriverUnit = {
      ...existing,
      ...generated,
      linkedHospitalId: normalizedLinkedHospitalId,
      status: rosterStatus,
      occupied: rosterStatus !== 'available',
      speedKmph: rosterStatus === 'offline' ? 0 : generated.speedKmph,
    };

    const isEquivalent =
      mergedDriver.linkedHospitalId === existing.linkedHospitalId &&
      mergedDriver.status === existing.status &&
      mergedDriver.occupied === existing.occupied &&
      mergedDriver.speedKmph === existing.speedKmph &&
      mergedDriver.callSign === existing.callSign &&
      mergedDriver.name === existing.name &&
      mergedDriver.phone === existing.phone &&
      mergedDriver.vehicleNumber === existing.vehicleNumber &&
      mergedDriver.location.lat === existing.location.lat &&
      mergedDriver.location.lng === existing.location.lng;

    if (!isEquivalent) {
      hasChanges = true;
      nextDrivers.push(mergedDriver);
      return;
    }

    nextDrivers.push(existing);
  });

  if (!hasChanges) {
    for (let index = 0; index < nextDrivers.length; index += 1) {
      if (stateDrivers[index]?.id !== nextDrivers[index]?.id) {
        hasChanges = true;
        break;
      }
    }
  }

  return hasChanges ? nextDrivers : stateDrivers;
}

function withRoadSnappedDriverLocations(state: HospitalOpsState): HospitalOpsState {
  const idleDrivers = state.drivers
    .filter((driver) => driver.status === 'available' && !driver.occupied && !driver.assignment)
    .sort((left, right) => left.id.localeCompare(right.id));

  const idleAnchors = createRoadAnchorAssignments({
    hospitalLocation: state.hospital.location,
    count: idleDrivers.length,
    closeShare: 0.28,
  });
  const idleAnchorByDriverId = new globalThis.Map(
    idleDrivers.map((driver, index) => [driver.id, idleAnchors[index]]),
  );

  let hasChanges = false;

  const drivers = state.drivers.map((driver) => {
    const snappedLocation = snapPointToRoad(driver.location);
    const targetAnchor = idleAnchorByDriverId.get(driver.id);
    const nextLocation = targetAnchor ? snapPointToRoad(targetAnchor) : snappedLocation;

    if (nextLocation.lat === driver.location.lat && nextLocation.lng === driver.location.lng) {
      return driver;
    }

    hasChanges = true;
    return {
      ...driver,
      location: nextLocation,
    };
  });

  if (!hasChanges) {
    return state;
  }

  return {
    ...state,
    drivers,
  };
}

function mergeRosterWithPresetDrivers(params: {
  stateDrivers: DriverUnit[];
  presetDrivers: PresetDriverAccount[];
  hospitalId: string;
  hospitalLocation: { lat: number; lng: number };
}): DriverUnit[] {
  const { stateDrivers, presetDrivers, hospitalId, hospitalLocation } = params;

  const normalizedHospitalId = normalizeHospitalIdentifier(hospitalId);

  const presetById = new Map<string, PresetDriverAccount>();
  const eligiblePresetById = new Map<string, PresetDriverAccount>();

  presetDrivers.forEach((account) => {
    const driverId = account.id?.trim();
    if (!driverId) {
      return;
    }

    presetById.set(driverId, account);

    const normalizedLinkedHospitalId = normalizeHospitalIdentifier(account.linkedHospitalId);
    if (normalizedHospitalId && normalizedLinkedHospitalId === normalizedHospitalId) {
      eligiblePresetById.set(driverId, account);
    }
  });

  const nextDrivers = stateDrivers.filter(
    (driver) => presetById.has(driver.id) && eligiblePresetById.has(driver.id),
  );

  const indexByDriverId = new Map(nextDrivers.map((driver, index) => [driver.id, index]));
  let hasChanges = nextDrivers.length !== stateDrivers.length;

  eligiblePresetById.forEach((account) => {
    const driverId = account.id?.trim();
    if (!driverId) {
      return;
    }

    const normalizedLinkedHospitalId = normalizeHospitalIdentifier(account.linkedHospitalId) ?? hospitalId;
    const rosterStatus = mapPresetDriverStatus(account);

    const existingIndex = indexByDriverId.get(driverId);

    if (existingIndex === undefined) {
      nextDrivers.push(createRosterDriverUnit(account, normalizedLinkedHospitalId, hospitalLocation, nextDrivers.length));
      hasChanges = true;
      return;
    }

    const existing = nextDrivers[existingIndex];
    const updated: DriverUnit = {
      ...existing,
      linkedHospitalId: normalizedLinkedHospitalId,
      status: rosterStatus,
      occupied: rosterStatus !== 'available',
      speedKmph: rosterStatus === 'offline' ? 0 : existing.speedKmph,
      callSign: sanitizeCallSign(account.callSign) || existing.callSign || fallbackCallSign(account, existingIndex),
      name: account.name || existing.name || account.email,
    };

    if (
      updated.linkedHospitalId !== existing.linkedHospitalId ||
      updated.status !== existing.status ||
      updated.occupied !== existing.occupied ||
      updated.speedKmph !== existing.speedKmph ||
      updated.callSign !== existing.callSign ||
      updated.name !== existing.name
    ) {
      nextDrivers[existingIndex] = updated;
      hasChanges = true;
    }
  });

  return hasChanges ? nextDrivers : stateDrivers;
}

function isHospitalOpsState(candidate: unknown): candidate is HospitalOpsState {
  if (!candidate || typeof candidate !== 'object') return false;
  const value = candidate as Partial<HospitalOpsState>;
  return Boolean(
    value.hospital &&
      Array.isArray(value.drivers) &&
      Array.isArray(value.requests) &&
      Array.isArray(value.events) &&
      typeof value.nextRequestNumber === 'number',
  );
}

function stateStorageKey(hospitalId: string) {
  return `${STORAGE_KEY_PREFIX}-${hospitalId}`;
}

function alertBaselineStorageKey(hospitalId: string) {
  return `${ALERT_BASELINE_KEY_PREFIX}-${hospitalId}`;
}

function loadInitialState(hospitalRef: HospitalLocationRef) {
  if (typeof window === 'undefined') {
    return withRoadSnappedDriverLocations(createInitialHospitalOpsState(hospitalRef));
  }

  const persisted = window.localStorage.getItem(stateStorageKey(hospitalRef.id));
  if (!persisted) {
    return withRoadSnappedDriverLocations(createInitialHospitalOpsState(hospitalRef));
  }

  try {
    const parsed = JSON.parse(persisted) as unknown;
    if (isHospitalOpsState(parsed)) {
      return withRoadSnappedDriverLocations({
        ...parsed,
        carAccidents: Array.isArray(parsed.carAccidents) ? parsed.carAccidents : [],
        pendingDispatchOffers: Array.isArray(parsed.pendingDispatchOffers) ? parsed.pendingDispatchOffers : [],
      });
    }
  } catch {
    return withRoadSnappedDriverLocations(createInitialHospitalOpsState(hospitalRef));
  }

  return withRoadSnappedDriverLocations(createInitialHospitalOpsState(hospitalRef));
}

function createEvent(type: OpsEventType, message: string, requestId?: string, driverId?: string): OpsEvent {
  return {
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 100_000)}`,
    at: new Date().toISOString(),
    type,
    message,
    requestId,
    driverId,
  };
}

function appendEvent(
  state: HospitalOpsState,
  type: OpsEventType,
  message: string,
  requestId?: string,
  driverId?: string,
) {
  const event = createEvent(type, message, requestId, driverId);
  return { ...state, events: [event, ...state.events].slice(0, 60) };
}

function normalizeBedState(beds: HospitalBedState): HospitalBedState {
  const totalBeds = Math.max(0, Math.round(beds.totalBeds));
  const occupiedBeds = Math.min(totalBeds, Math.max(0, Math.round(beds.occupiedBeds)));
  const icuTotal = Math.min(totalBeds, Math.max(0, Math.round(beds.icuTotal)));
  const icuOccupied = Math.min(occupiedBeds, icuTotal, Math.max(0, Math.round(beds.icuOccupied)));
  return { totalBeds, occupiedBeds, icuTotal, icuOccupied };
}

function adjustBeds(beds: HospitalBedState, field: keyof HospitalBedState, delta: number) {
  const draft = { ...beds, [field]: beds[field] + delta };
  const nextBeds = normalizeBedState(draft);
  const changed =
    nextBeds.totalBeds !== beds.totalBeds ||
    nextBeds.occupiedBeds !== beds.occupiedBeds ||
    nextBeds.icuTotal !== beds.icuTotal ||
    nextBeds.icuOccupied !== beds.icuOccupied;
  return { nextBeds, changed };
}

function formatPingAge(lastPingAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(lastPingAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}

function formatCarAlertDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function eventTone(eventType: OpsEventType): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (eventType === 'incoming') return 'danger';
  if (eventType === 'car_accident') return 'danger';
  if (eventType === 'triage' || eventType === 'capacity') return 'warning';
  if (eventType === 'handover') return 'success';
  if (eventType === 'dispatch' || eventType === 'arrival') return 'info';
  return 'neutral';
}

function hasHospitalCapacity(beds: HospitalBedState) {
  const availableBeds = Math.max(0, beds.totalBeds - beds.occupiedBeds);
  const availableIcu = Math.max(0, beds.icuTotal - beds.icuOccupied);
  return availableBeds > 0 && availableIcu > 0;
}

function requestIdFromAlertId(alertId: string) {
  return `CAR-${alertId}`;
}

function getActiveHospitalCandidateId(request: PatientRequest): string | null {
  const candidates = request.hospitalCandidateIds ?? [];
  if (candidates.length === 0) {
    return null;
  }

  const rejected = new Set(request.hospitalRejectedIds ?? []);
  const nextCandidate = candidates.find((candidateId) => !rejected.has(candidateId));
  return nextCandidate ?? null;
}

function toLiveRequest(alert: ApiCarAccidentAlert, previousRequest?: PatientRequest): PatientRequest {
  const assignedHospitalLocation =
    typeof alert.assignedHospitalLat === 'number' && typeof alert.assignedHospitalLng === 'number'
      ? { lat: alert.assignedHospitalLat, lng: alert.assignedHospitalLng }
      : previousRequest?.destinationHospitalLocation;

  const status: RequestStatus =
    alert.status === 'resolved'
      ? 'completed'
      : alert.assignedDriverId
        ? 'dispatched'
        : alert.assignedHospitalId
          ? 'triaged'
          : 'new';

  return {
    id: requestIdFromAlertId(alert.id),
    sourceAlertId: alert.id,
    patientName: alert.personName,
    age: previousRequest?.age ?? 35,
    symptom: previousRequest?.symptom ?? `${alert.carName} ${alert.carModel} collision`,
    severity: alert.severity,
    location: { lat: alert.lat, lng: alert.lng },
    address: previousRequest?.address ?? `${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}`,
    channel: 'whatsapp',
    reportedAt: alert.createdAt,
    status,
    assignedDriverId: alert.assignedDriverId ?? undefined,
    hospitalId: alert.assignedHospitalId ?? undefined,
    destinationHospitalName: alert.assignedHospitalName ?? previousRequest?.destinationHospitalName,
    destinationHospitalAddress: alert.assignedHospitalAddress ?? previousRequest?.destinationHospitalAddress,
    destinationHospitalLocation: assignedHospitalLocation,
    driverCandidateIds: Array.isArray(alert.notifiedDriverIds) ? alert.notifiedDriverIds : [],
    hospitalCandidateIds: Array.isArray(alert.notifiedHospitalIds) ? alert.notifiedHospitalIds : [],
    hospitalRejectedIds: Array.isArray(alert.hospitalRejectedIds) ? alert.hospitalRejectedIds : [],
    driverRejectedIds: Array.isArray(alert.driverRejectedIds) ? alert.driverRejectedIds : [],
    hospitalAcceptedAt: alert.assignedHospitalId
      ? previousRequest?.hospitalAcceptedAt ?? new Date().toISOString()
      : undefined,
    notes: [previousRequest?.notes, alert.notes].filter(Boolean).join(' | ') || undefined,
  };
}

function syncLiveAlertsIntoOpsState(state: HospitalOpsState, alerts: ApiCarAccidentAlert[]): HospitalOpsState {
  const previousRequestsByAlertId = new Map<string, PatientRequest>();
  state.requests.forEach((request) => {
    if (request.sourceAlertId) {
      previousRequestsByAlertId.set(request.sourceAlertId, request);
    }
  });

  const nextRequests = alerts.map((alert) => toLiveRequest(alert, previousRequestsByAlertId.get(alert.id)));
  const nextRequestsById = new Map(nextRequests.map((request) => [request.id, request]));
  const now = Date.now();
  const existingOffers = Array.isArray(state.pendingDispatchOffers) ? state.pendingDispatchOffers : [];

  const nextPendingOffers = existingOffers.filter((offer) => {
    const request = nextRequestsById.get(offer.requestId);
    if (!request) {
      return false;
    }

    if (request.status === 'completed' || request.status === 'cancelled' || request.assignedDriverId) {
      return false;
    }

    if (new Date(offer.expiresAt).getTime() <= now) {
      return false;
    }

    if (request.driverRejectedIds?.includes(offer.offeredDriverId)) {
      return false;
    }

    if (request.driverCandidateIds?.length && !request.driverCandidateIds.includes(offer.offeredDriverId)) {
      return false;
    }

    return true;
  });

  const offerKeySet = new Set(
    nextPendingOffers.map((offer) => `${offer.requestId}:${offer.offeredDriverId}`),
  );

  nextRequests.forEach((request) => {
    if (request.status === 'completed' || request.status === 'cancelled' || request.assignedDriverId) {
      return;
    }

    const candidateIds = new Set(request.driverCandidateIds ?? []);
    const rejectedIds = new Set(request.driverRejectedIds ?? []);

    const closestAvailableDrivers = state.drivers
      .filter((driver) => {
        if (driver.status !== 'available' || driver.occupied) {
          return false;
        }

        if (candidateIds.size > 0 && !candidateIds.has(driver.id)) {
          return false;
        }

        if (rejectedIds.has(driver.id)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftDistance = routeDistanceKm(buildRoadRoute(left.location, request.location));
        const rightDistance = routeDistanceKm(buildRoadRoute(right.location, request.location));
        return leftDistance - rightDistance;
      })
      .slice(0, 5);

    closestAvailableDrivers.forEach((driver) => {
      const offerKey = `${request.id}:${driver.id}`;
      if (offerKeySet.has(offerKey)) {
        return;
      }

      const offeredAtTs = Date.now();
      const nextOffer: DispatchOffer = {
        id: `AUTO-${request.id}-${driver.id}-${offeredAtTs}`,
        requestId: request.id,
        offeredDriverId: driver.id,
        offeredAt: new Date(offeredAtTs).toISOString(),
        expiresAt: new Date(offeredAtTs + DISPATCH_OFFER_SECONDS * 1000).toISOString(),
      };

      nextPendingOffers.push(nextOffer);
      offerKeySet.add(offerKey);
    });
  });

  const existingRequestIdSet = new Set(state.requests.map((request) => request.id));
  const incomingEvents = nextRequests
    .filter((request) => !existingRequestIdSet.has(request.id))
    .map((request) =>
      createEvent(
        'car_accident',
        `${request.id} received from WhatsApp crash workflow at ${request.address}.`,
        request.id,
      ),
    );

  return {
    ...state,
    requests: nextRequests,
    pendingDispatchOffers: nextPendingOffers,
    events: [...incomingEvents, ...state.events].slice(0, 60),
  };
}

export function HospitalDashboard() {
  const {
    hospitalUser,
    isHospitalAuthenticated,
    logoutHospitalUser,
  } = useHospitalAuth();

  const activeHospitalRef = useMemo<HospitalLocationRef>(
    () => {
      if (!hospitalUser) {
        return DEFAULT_HOSPITAL_REF;
      }

      const hospitalCode = findHospitalCodeCandidate([
        hospitalUser.hospitalId,
        hospitalUser.id,
        hospitalUser.name,
      ]);
      const resolvedHospitalId = hospitalCode ?? hospitalUser.hospitalId ?? hospitalUser.id;
      const knownHospital = hospitalCode ? knownHospitalRefById.get(hospitalCode) : undefined;

      return {
        id: resolvedHospitalId,
        name: hospitalUser.name || knownHospital?.name || DEFAULT_HOSPITAL_REF.name,
        address: hospitalUser.address ?? knownHospital?.address ?? DEFAULT_HOSPITAL_REF.address,
        location: hospitalUser.location
          ? { ...hospitalUser.location }
          : knownHospital
            ? { ...knownHospital.location }
            : { ...DEFAULT_HOSPITAL_REF.location },
      };
    },
    [hospitalUser],
  );

  const [opsState, setOpsState] = useState<HospitalOpsState>(() => loadInitialState(activeHospitalRef));
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [requestFilter, setRequestFilter] = useState<'all' | RequestStatus>('all');
  const [activeSection, setActiveSection] = useState<HospitalSectionKey>('dashboard');
  const [isDesktopNavOpen, setIsDesktopNavOpen] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [carAccidents, setCarAccidents] = useState<ApiCarAccidentAlert[]>([]);
  const [isCarAccidentsLoading, setIsCarAccidentsLoading] = useState(false);
  const [carAccidentsError, setCarAccidentsError] = useState<string | null>(null);
  const [backendAvailableDriversCount, setBackendAvailableDriversCount] = useState<number | null>(null);
  const [globalAvailableMapDrivers, setGlobalAvailableMapDrivers] = useState<DriverUnit[]>([]);
  const [alertsBaselineIso, setAlertsBaselineIso] = useState<string>('1970-01-01T00:00:00.000Z');
  const requestListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hospitalUser) {
      return;
    }

    setOpsState(loadInitialState(activeHospitalRef));
    setSelectedRequestId(null);
    setSelectedDriverId(null);
    setRequestFilter('all');
    setActiveSection('dashboard');
    setDispatchNotice(null);
    setBackendAvailableDriversCount(null);
    setGlobalAvailableMapDrivers([]);
  }, [activeHospitalRef, hospitalUser]);

  useEffect(() => {
    if (!hospitalUser || typeof window === 'undefined') {
      return;
    }

    // Always start from epoch on load so stale local baselines never hide real alerts.
    setAlertsBaselineIso('1970-01-01T00:00:00.000Z');
  }, [activeHospitalRef.id, hospitalUser]);

  useEffect(() => {
    if (!hospitalUser) {
      return;
    }

    const id = window.setInterval(() => {
      setOpsState((prev) => runDriverPingCycle(prev, DRIVER_PING_SECONDS));
    }, DRIVER_PING_SECONDS * 1000);

    return () => window.clearInterval(id);
  }, [hospitalUser]);

  useEffect(() => {
    if (!hospitalUser) {
      return;
    }

    let isDisposed = false;

    const syncDriverRoster = async () => {
      try {
        const hospitalId = activeHospitalRef.id;
        const [presetData, availableData] = await Promise.all([
          getPresetDriverAccounts({ hospitalId }),
          getPresetDriverAccounts({ availableOnly: true }),
        ]);

        if (isDisposed) {
          return;
        }

        setBackendAvailableDriversCount(availableData.drivers.length);
        setGlobalAvailableMapDrivers((previousDrivers) =>
          mergeGlobalAvailableDrivers({
            stateDrivers: previousDrivers,
            presetDrivers: availableData.drivers,
            fallbackHospitalId: hospitalId,
            fallbackHospitalLocation: activeHospitalRef.location,
          }),
        );

        setOpsState((previousState) => {
          const mergedDrivers = mergeRosterWithPresetDrivers({
            stateDrivers: previousState.drivers,
            presetDrivers: presetData.drivers,
            hospitalId: previousState.hospital.id,
            hospitalLocation: previousState.hospital.location,
          });

          if (mergedDrivers === previousState.drivers) {
            return previousState;
          }

          const mergedState: HospitalOpsState = {
            ...previousState,
            drivers: mergedDrivers,
          };

          return withRoadSnappedDriverLocations(mergedState);
        });
      } catch {
        // Keep existing roster when backend presets are temporarily unavailable.
      }
    };

    void syncDriverRoster();

    const intervalId = window.setInterval(() => {
      void syncDriverRoster();
    }, ROSTER_SYNC_SECONDS * 1000);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [activeHospitalRef.id, hospitalUser]);

  useEffect(() => {
    if (!hospitalUser) {
      return;
    }

    window.localStorage.setItem(stateStorageKey(activeHospitalRef.id), JSON.stringify(opsState));
  }, [opsState, activeHospitalRef.id, hospitalUser]);

  useEffect(() => {
    if (!selectedRequestId) return;
    if (!opsState.requests.some((r) => r.id === selectedRequestId)) setSelectedRequestId(null);
  }, [opsState.requests, selectedRequestId]);

  useEffect(() => {
    if (!selectedDriverId) return;
    if (
      !opsState.drivers.some((d) => d.id === selectedDriverId) &&
      !globalAvailableMapDrivers.some((d) => d.id === selectedDriverId)
    ) {
      setSelectedDriverId(null);
    }
  }, [globalAvailableMapDrivers, opsState.drivers, selectedDriverId]);

  useEffect(() => {
    if (!dispatchNotice) return;
    const id = window.setTimeout(() => setDispatchNotice(null), 4200);
    return () => window.clearTimeout(id);
  }, [dispatchNotice]);

  const refreshCarAccidents = useCallback(
    async (withLoading: boolean) => {
      if (!isHospitalAuthenticated || !hospitalUser) {
        setCarAccidents([]);
        setCarAccidentsError(null);
        setIsCarAccidentsLoading(false);
        return;
      }

      if (withLoading) {
        setIsCarAccidentsLoading(true);
      }

      try {
        const alerts = await listCarAccidentAlerts(100);
        const sortedAlerts = [...alerts].sort(
          (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
        );
        const baselineTimestamp = Date.parse(alertsBaselineIso);
        const baselineFilteredAlerts = Number.isFinite(baselineTimestamp)
          ? sortedAlerts.filter((alert) => Date.parse(alert.createdAt) >= baselineTimestamp)
          : sortedAlerts;
        const visibleAlerts =
          baselineFilteredAlerts.length === 0 && sortedAlerts.length > 0
            ? sortedAlerts
            : baselineFilteredAlerts;

        setCarAccidents(visibleAlerts);
        setCarAccidentsError(null);
        setOpsState((previousState) => syncLiveAlertsIntoOpsState(previousState, visibleAlerts));
      } catch (error) {
        setCarAccidentsError(error instanceof Error ? error.message : 'Unable to load car accident alerts.');
      } finally {
        if (withLoading) {
          setIsCarAccidentsLoading(false);
        }
      }
    },
    [alertsBaselineIso, hospitalUser, isHospitalAuthenticated],
  );

  useEffect(() => {
    if (!isHospitalAuthenticated || !hospitalUser) {
      setCarAccidents([]);
      setCarAccidentsError(null);
      setIsCarAccidentsLoading(false);
      return;
    }

    let isDisposed = false;

    const runRefresh = async (withLoading: boolean) => {
      if (isDisposed) {
        return;
      }

      await refreshCarAccidents(withLoading);
    };

    void runRefresh(true);

    const intervalId = window.setInterval(() => {
      void runRefresh(false);
    }, 3_000);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [hospitalUser, isHospitalAuthenticated, refreshCarAccidents]);

  const linkedDrivers = useMemo(() => {
    const normalizedStateHospitalId = normalizeHospitalIdentifier(opsState.hospital.id);
    const normalizedUserHospitalId = normalizeHospitalIdentifier(hospitalUser?.hospitalId);
    const normalizedUserHospitalCode = findHospitalCodeCandidate([hospitalUser?.name]);

    return opsState.drivers.filter((driver) => {
      const normalizedLinkedHospitalId = normalizeHospitalIdentifier(driver.linkedHospitalId);
      if (!normalizedLinkedHospitalId) {
        return false;
      }

      return (
        normalizedLinkedHospitalId === normalizedStateHospitalId ||
        normalizedLinkedHospitalId === normalizedUserHospitalId ||
        normalizedLinkedHospitalId === normalizedUserHospitalCode
      );
    });
  }, [hospitalUser?.hospitalId, hospitalUser?.name, opsState.drivers, opsState.hospital.id]);

  const currentHospitalIdentitySet = useMemo(() => {
    const identities = new Set<string>();
    const addIdentity = (value: string | null | undefined) => {
      const normalized = normalizeHospitalIdentifier(value);
      if (normalized) {
        identities.add(normalized);
      }
    };

    const derivedHospitalCode = findHospitalCodeCandidate([
      hospitalUser?.hospitalId,
      hospitalUser?.id,
      hospitalUser?.name,
      opsState.hospital.id,
      opsState.hospital.name,
    ]);

    addIdentity(opsState.hospital.id);
    addIdentity(opsState.hospital.name);
    addIdentity(hospitalUser?.hospitalId);
    addIdentity(hospitalUser?.id);
    addIdentity(hospitalUser?.name);
    addIdentity(derivedHospitalCode);

    return identities;
  }, [hospitalUser?.hospitalId, hospitalUser?.id, hospitalUser?.name, opsState.hospital.id, opsState.hospital.name]);

  const currentHospitalDecisionId = useMemo(() => {
    const preferredCode = findHospitalCodeCandidate([
      hospitalUser?.hospitalId,
      hospitalUser?.id,
      hospitalUser?.name,
      opsState.hospital.id,
      opsState.hospital.name,
    ]);

    if (preferredCode) {
      return preferredCode;
    }

    return hospitalUser?.hospitalId ?? hospitalUser?.id ?? opsState.hospital.id;
  }, [hospitalUser?.hospitalId, hospitalUser?.id, hospitalUser?.name, opsState.hospital.id, opsState.hospital.name]);

  const headerHospitalId = useMemo(() => {
    const preferredCode = findHospitalCodeCandidate([
      hospitalUser?.hospitalId,
      hospitalUser?.id,
      opsState.hospital.id,
      hospitalUser?.name,
    ]);

    if (preferredCode) {
      return preferredCode;
    }

    return hospitalUser?.hospitalId ?? hospitalUser?.id ?? opsState.hospital.id;
  }, [hospitalUser?.hospitalId, hospitalUser?.id, hospitalUser?.name, opsState.hospital.id]);

  const isCurrentHospitalIdentity = useCallback(
    (candidateId: string | null | undefined) => {
      const normalized = normalizeHospitalIdentifier(candidateId);
      if (!normalized) {
        return false;
      }

      return currentHospitalIdentitySet.has(normalized);
    },
    [currentHospitalIdentitySet],
  );

  const activeCarAccidents = useMemo(
    () => carAccidents.filter((alert) => alert.status !== 'resolved'),
    [carAccidents],
  );

  const newCarAccidentsCount = useMemo(
    () => carAccidents.filter((alert) => alert.status === 'new').length,
    [carAccidents],
  );

  const openRequests = useMemo(
    () =>
      opsState.requests.filter((request) => {
        if (request.status === 'completed' || request.status === 'cancelled') {
          return false;
        }

        if (isCurrentHospitalIdentity(request.hospitalId)) {
          return true;
        }

        return isCurrentHospitalIdentity(getActiveHospitalCandidateId(request));
      }),
    [isCurrentHospitalIdentity, opsState.requests],
  );

  const dispatchableRequests = useMemo(
    () =>
      openRequests.filter(
        (request) => !request.hospitalId && isCurrentHospitalIdentity(getActiveHospitalCandidateId(request)),
      ),
    [isCurrentHospitalIdentity, openRequests],
  );

  const queueRequests = useMemo(
    () => openRequests.filter((request) => !request.sourceAlertId),
    [openRequests],
  );

  const queueDispatchableRequests = useMemo(
    () =>
      queueRequests.filter(
        (request) => !request.hospitalId && isCurrentHospitalIdentity(getActiveHospitalCandidateId(request)),
      ),
    [isCurrentHospitalIdentity, queueRequests],
  );

  const filteredRequests = useMemo(() => {
    const base = requestFilter === 'all' ? queueRequests : queueRequests.filter((r) => r.status === requestFilter);
    return [...base].sort((a, b) => {
      const sd = severityPriority[b.severity] - severityPriority[a.severity];
      if (sd !== 0) return sd;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });
  }, [queueRequests, requestFilter]);

  const availableDrivers = useMemo(
    () => linkedDrivers.filter((d) => d.status === 'available' && !d.occupied),
    [linkedDrivers],
  );

  const availableAmbulanceCount = backendAvailableDriversCount ?? availableDrivers.length;
  const mapDrivers = globalAvailableMapDrivers.length > 0 ? globalAvailableMapDrivers : linkedDrivers;

  const activeTrips = useMemo(
    () => linkedDrivers.filter((d) => ['to_patient', 'with_patient', 'to_hospital'].includes(d.status)).length,
    [linkedDrivers],
  );

  const avgEtaMinutes = useMemo(() => {
    const pool = linkedDrivers
      .filter((d) => typeof d.etaMinutes === 'number' && d.status !== 'available' && d.status !== 'offline')
      .map((d) => d.etaMinutes ?? 0);
    if (pool.length === 0) return 0;
    return Math.round(pool.reduce((a, v) => a + v, 0) / pool.length);
  }, [linkedDrivers]);

  const availableBeds = opsState.hospital.beds.totalBeds - opsState.hospital.beds.occupiedBeds;
  const availableIcuBeds = opsState.hospital.beds.icuTotal - opsState.hospital.beds.icuOccupied;
  const bedPressure =
    opsState.hospital.beds.totalBeds === 0
      ? 0
      : opsState.hospital.beds.occupiedBeds / opsState.hospital.beds.totalBeds;
  const criticalCases = openRequests.filter((r) => r.severity === 'critical').length;
  const completedCases = opsState.requests.filter((r) => r.status === 'completed').length;
  const completionRate = opsState.requests.length === 0 ? 0 : Math.round((completedCases / opsState.requests.length) * 100);
  const offlineDrivers = linkedDrivers.filter((d) => d.status === 'offline').length;
  const availableFleetPct = linkedDrivers.length === 0 ? 0 : Math.round((availableDrivers.length / linkedDrivers.length) * 100);
  const bedOccupancyPct = opsState.hospital.beds.totalBeds === 0 ? 0 : Math.round((opsState.hospital.beds.occupiedBeds / opsState.hospital.beds.totalBeds) * 100);
  const responseVelocityScore = avgEtaMinutes > 0 ? Math.max(0, 100 - avgEtaMinutes * 3) : 100;
  const dispatchReadinessScore = Math.max(0, Math.min(100, Math.round(availableFleetPct * 0.42 + (100 - bedOccupancyPct) * 0.26 + completionRate * 0.2 + responseVelocityScore * 0.12)));
  const scoreRingCircumference = 2 * Math.PI * 52;
  const miniRingCircumference = 2 * Math.PI * 30;
  const recentPriorityRequests = useMemo(() => [...openRequests].sort((a, b) => { const sd = (severityPriority[b.severity] ?? 0) - (severityPriority[a.severity] ?? 0); return sd !== 0 ? sd : new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(); }).slice(0, 5), [openRequests]);
  const capacityEvents = useMemo(() => opsState.events.filter((e) => e.type === 'capacity'), [opsState.events]);
  const openRequestById = useMemo(
    () => new globalThis.Map(queueRequests.map((request) => [request.id, request])),
    [queueRequests],
  );
  const requestByAlertId = useMemo(
    () => new globalThis.Map(opsState.requests.filter((request) => request.sourceAlertId).map((request) => [request.sourceAlertId as string, request])),
    [opsState.requests],
  );
  const selectedQueueRequest = useMemo(
    () => (selectedRequestId ? queueRequests.find((request) => request.id === selectedRequestId) ?? null : null),
    [queueRequests, selectedRequestId],
  );

  const isAwaitingHospitalDecision = useCallback(
    (request: PatientRequest) =>
      !request.hospitalId && isCurrentHospitalIdentity(getActiveHospitalCandidateId(request)),
    [isCurrentHospitalIdentity],
  );

  const isAcceptedByCurrentHospital = useCallback(
    (request: PatientRequest) => isCurrentHospitalIdentity(request.hospitalId),
    [isCurrentHospitalIdentity],
  );

  useEffect(() => {
    if (!selectedRequestId) {
      return;
    }

    const listNode = requestListRef.current;
    if (!listNode) {
      return;
    }

    const requestNode = listNode.querySelector<HTMLElement>(`[data-request-id="${selectedRequestId}"]`);
    if (!requestNode) {
      return;
    }

    requestNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [filteredRequests, selectedRequestId]);

  const handleHospitalAlertDecision = useCallback(
    async (request: PatientRequest, action: 'accept' | 'reject') => {
      if (!request.sourceAlertId) {
        setDispatchNotice('This request is not linked to a live alert.');
        return;
      }

      if (action === 'accept' && !hasHospitalCapacity(opsState.hospital.beds)) {
        try {
          await rejectHospitalCarAccidentAlert(request.sourceAlertId, currentHospitalDecisionId);
          setDispatchNotice('Capacity unavailable. Alert moved to next nearest hospital.');
          await refreshCarAccidents(false);
        } catch (error) {
          setDispatchNotice(error instanceof Error ? error.message : 'Unable to reject alert for capacity overflow.');
        }

        return;
      }

      try {
        if (action === 'accept') {
          const response = await acceptHospitalCarAccidentAlert(request.sourceAlertId, currentHospitalDecisionId);
          setDispatchNotice(response.message || `Hospital accepted ${request.id}.`);
        } else {
          const response = await rejectHospitalCarAccidentAlert(request.sourceAlertId, currentHospitalDecisionId);
          setDispatchNotice(response.message || `Hospital rejected ${request.id}.`);
        }

        await refreshCarAccidents(false);
      } catch (error) {
        setDispatchNotice(error instanceof Error ? error.message : 'Unable to submit hospital decision.');
      }
    },
    [currentHospitalDecisionId, opsState.hospital.beds, refreshCarAccidents],
  );

  const handleMapSelectRequest = useCallback((requestId: string) => {
    setSelectedRequestId(requestId);
    setRequestFilter('all');
    setDispatchNotice(`Selected ${requestId} from map.`);
  }, []);

  const handleMapAcceptRequest = useCallback((requestId: string) => {
    const request = openRequestById.get(requestId);
    if (!request) {
      setDispatchNotice('Request no longer available in this queue.');
      return;
    }

    if (!isAwaitingHospitalDecision(request)) {
      if (isAcceptedByCurrentHospital(request)) {
        setDispatchNotice(`${request.id} is already accepted by this hospital.`);
      } else {
        setDispatchNotice(`${request.id} is not currently awaiting this hospital.`);
      }
      return;
    }

    setSelectedRequestId(requestId);
    void handleHospitalAlertDecision(request, 'accept');
  }, [handleHospitalAlertDecision, isAcceptedByCurrentHospital, isAwaitingHospitalDecision, openRequestById]);

  const handleMapRejectRequest = useCallback((requestId: string) => {
    const request = openRequestById.get(requestId);
    if (!request) {
      setDispatchNotice('Request no longer available in this queue.');
      return;
    }

    if (!isAwaitingHospitalDecision(request)) {
      if (isAcceptedByCurrentHospital(request)) {
        setDispatchNotice(`${request.id} is already accepted by this hospital.`);
      } else {
        setDispatchNotice(`${request.id} is not currently awaiting this hospital.`);
      }
      return;
    }

    setSelectedRequestId(requestId);
    void handleHospitalAlertDecision(request, 'reject');
  }, [handleHospitalAlertDecision, isAcceptedByCurrentHospital, isAwaitingHospitalDecision, openRequestById]);

  const handleClearExistingRequests = useCallback(() => {
    if (typeof window !== 'undefined') {
      const nowIso = new Date().toISOString();
      window.localStorage.setItem(alertBaselineStorageKey(activeHospitalRef.id), nowIso);
      setAlertsBaselineIso(nowIso);
    }

    setCarAccidents([]);
    setOpsState((previousState) => ({
      ...previousState,
      requests: [],
      pendingDispatchOffers: [],
    }));
    setSelectedRequestId(null);
    setDispatchNotice('Cleared all existing requests. Only new alerts will appear now.');
  }, [activeHospitalRef.id]);

  const handleBedAdjustment = (field: keyof HospitalBedState, delta: number, label: string) => {
    setOpsState((prev) => {
      const { nextBeds, changed } = adjustBeds(prev.hospital.beds, field, delta);
      if (!changed) return prev;
      const direction = delta > 0 ? 'increased' : 'decreased';
      return appendEvent(
        { ...prev, hospital: { ...prev.hospital, beds: nextBeds } },
        'capacity',
        `${label} ${direction}. Beds now ${nextBeds.occupiedBeds}/${nextBeds.totalBeds}.`,
      );
    });
  };

  const handleSectionChange = (section: HospitalSectionKey) => {
    setActiveSection(section);
    if (isMobileViewport()) setIsMobileNavOpen(false);
  };

  const handleSidebarToggle = () => {
    if (isMobileViewport()) { setIsMobileNavOpen((prev) => !prev); return; }
    setIsDesktopNavOpen((prev) => !prev);
  };

  const handleSidebarLogout = () => {
    if (isMobileViewport()) {
      setIsMobileNavOpen(false);
    }
    logoutHospitalUser();
  };

  // Close mobile nav on viewport resize to desktop
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(MOBILE_NAV_QUERY);
    const handler = (e: MediaQueryListEvent) => { if (!e.matches) setIsMobileNavOpen(false); };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
    media.addListener(handler);
    return () => media.removeListener(handler);
  }, []);

  if (!isHospitalAuthenticated || !hospitalUser) {
    if (typeof window !== 'undefined') {
      window.location.hash = '/auth';
    }
    return null;
  }

  return (
    <main className={`hospital-dashboard${isDesktopNavOpen ? ' desktop-nav-open' : ''}${isMobileNavOpen ? ' mobile-nav-open' : ''}`}>

      {/* â”€â”€ Sidebar â”€â”€ */}
      <aside className={`hospital-sidebar${isMobileNavOpen ? ' is-open' : ''}`} aria-label="Hospital dashboard sections">
        <div className="hospital-sidebar-brand">
          <span className="hospital-sidebar-brand-mark" aria-hidden="true">CR</span>
          <div className="hospital-sidebar-brand-copy">
            <strong>Hospital Panel</strong>
            <span>CodeRed Navigation</span>
          </div>
        </div>


        <nav className="hospital-sidebar-nav" aria-label="Hospital controls navigation">
          {hospitalSections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`hospital-sidebar-item${activeSection === section.key ? ' active' : ''}`}
              onClick={() => handleSectionChange(section.key)}
              aria-current={activeSection === section.key ? 'page' : undefined}
              title={section.label}
            >
              <span className="hospital-sidebar-item-icon" aria-hidden="true">
                <section.icon size={18} strokeWidth={2.1} />
                {section.key === 'queue' && criticalCases > 0 && (
                  <span className="hospital-sidebar-item-pulse" />
                )}
                {section.key === 'carAccidents' && newCarAccidentsCount > 0 && (
                  <span className="hospital-sidebar-item-pulse" />
                )}
              </span>
              <span className="hospital-sidebar-label">{section.label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="hospital-sidebar-logout"
          onClick={handleSidebarLogout}
          title={!isMobileViewport() && !isDesktopNavOpen ? 'Logout' : undefined}
        >
          <LogOut size={16} />
          {isMobileViewport() || isDesktopNavOpen ? 'Logout' : null}
        </button>



        {!isMobileViewport() && (
          <button
            type="button"
            className="hospital-sidebar-collapse"
            aria-label={isDesktopNavOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={handleSidebarToggle}
          >
            {isDesktopNavOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
      </aside>

      {/* Mobile backdrop */}
      <button
        type="button"
        className="hospital-sidebar-backdrop"
        aria-hidden={!isMobileNavOpen}
        aria-label="Close navigation"
        onClick={() => setIsMobileNavOpen(false)}
      />

      {/* Mobile menu toggle */}
      {isMobileViewport() && (
        <button
          type="button"
          className="hospital-mobile-menu-toggle"
          aria-label={isMobileNavOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
          onClick={handleSidebarToggle}
        >
          {isMobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      )}

      {/* â”€â”€ Main content â”€â”€ */}
      <div className="hospital-content">
        <div className="hospital-content-inner">

          {/* â”€â”€ Header â”€â”€ */}
          <header className="hospital-head">
            <div className="hospital-head-main">
              <div className="hospital-head-copy">
                <h1>{headerHospitalId}</h1>
                <p className="hospital-auth-meta">Signed in as {hospitalUser.email}</p>
              </div>
            </div>
            <div className="hospital-head-status">
              <span className="hospital-ping-pill">ping every {DRIVER_PING_SECONDS} sec</span>
            </div>
          </header>

          {/* â”€â”€ Alerts â”€â”€ */}
          <div className="alert-stack">
            {bedPressure >= 0.9 && (
              <AlertBanner tone="danger" title="Bed occupancy critical" message="Capacity crossed 90%. Consider releasing beds or rerouting intake." actionLabel="Release 1 Bed" onAction={() => handleBedAdjustment('occupiedBeds', -1, 'Occupied beds')} />
            )}
            {newCarAccidentsCount > 0 && (
              <AlertBanner
                tone="danger"
                title={`${newCarAccidentsCount} new car accident alert${newCarAccidentsCount > 1 ? 's' : ''}`}
                message="Airbag-triggered crash reports are waiting in Car Accidents."
                actionLabel="Open Car Accidents"
                onAction={() => handleSectionChange('carAccidents')}
              />
            )}
            {criticalCases > 0 && (
              <AlertBanner tone="warning" title={`${criticalCases} critical case${criticalCases > 1 ? 's' : ''} in queue`} message="Prioritize triage and dispatch for high-acuity patients." />
            )}
            {dispatchNotice && <AlertBanner tone="info" title={dispatchNotice} />}
          </div>

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
              SECTION: DASHBOARD
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeSection === 'dashboard' && (
            <>
              {/* Readiness score banner */}
              <section className="hospital-performance-banner" aria-label="Hospital performance summary">
                <div className="hospital-performance-left">
                  <div className="hospital-performance-score-ring" aria-hidden="true">
                    <svg viewBox="0 0 120 120" className="hospital-score-svg">
                      <circle cx="60" cy="60" r="52" className="hospital-score-track" />
                      <circle cx="60" cy="60" r="52" className="hospital-score-value"
                        strokeDasharray={`${(dispatchReadinessScore / 100) * scoreRingCircumference} ${scoreRingCircumference}`} />
                    </svg>
                    <div className="hospital-score-copy">
                      <strong>{dispatchReadinessScore}</strong>
                      <span>Score</span>
                    </div>
                  </div>
                  <div className="hospital-performance-copy">
                    <h2>Dispatch Readiness</h2>
                    <p>Based on fleet availability, completion rate, bed occupancy and response velocity.</p>
                    <div className="hospital-performance-badges">
                      <span className="hospital-performance-badge">{openRequests.length} active requests</span>
                      <span className="hospital-performance-badge">{dispatchableRequests.length} dispatch pending</span>
                      <span className="hospital-performance-badge">{criticalCases} critical</span>
                    </div>
                  </div>
                </div>
                <div className="hospital-performance-metrics">
                  {[
                    { label: 'Fleet', value: availableFleetPct, tone: 'fleet' },
                    { label: 'Completion', value: completionRate, tone: 'completion' },
                    { label: 'Beds Free', value: Math.max(0, 100 - bedOccupancyPct), tone: 'beds' },
                  ].map((m) => (
                    <article key={m.label} className="hospital-performance-metric">
                      <div className="hospital-mini-ring" aria-hidden="true">
                        <svg viewBox="0 0 80 80">
                          <circle cx="40" cy="40" r="30" className="hospital-mini-ring-track" />
                          <circle cx="40" cy="40" r="30" className={`hospital-mini-ring-value tone-${m.tone}`}
                            strokeDasharray={`${(m.value / 100) * miniRingCircumference} ${miniRingCircumference}`} />
                        </svg>
                        <span>{m.value}%</span>
                      </div>
                      <p>{m.label}</p>
                    </article>
                  ))}
                </div>
              </section>

              {/* KPI cards */}
              <section className="hospital-kpi-grid" aria-label="Operations summary">
                <article className="kpi-card tone-danger">
                  <div className="kpi-card-headline"><p>Open Requests</p><span className="kpi-card-chip">Live Queue</span></div>
                  <strong>{openRequests.length}</strong>
                  <span className="kpi-card-caption">{dispatchableRequests.length} awaiting dispatch</span>
                </article>
                <article className="kpi-card tone-blue">
                  <div className="kpi-card-headline"><p>Fleet Linked</p><span className="kpi-card-chip">Ambulance Ops</span></div>
                  <strong>{availableAmbulanceCount}</strong>
                  <span className="kpi-card-caption">available now</span>
                </article>
                <article className="kpi-card tone-amber">
                  <div className="kpi-card-headline"><p>Active Trips</p><span className="kpi-card-chip">Route Live</span></div>
                  <strong>{activeTrips}</strong>
                  <span className="kpi-card-caption">{avgEtaMinutes > 0 ? `Avg ETA ${avgEtaMinutes} min` : 'No active ETAs'}</span>
                </article>
                <article className="kpi-card tone-green">
                  <div className="kpi-card-headline"><p>Beds Available</p><span className="kpi-card-chip">Capacity</span></div>
                  <strong>{availableBeds}</strong>
                  <span className="kpi-card-caption">ICU {availableIcuBeds} / {opsState.hospital.beds.icuTotal}</span>
                </article>
              </section>

              {/* Dashboard insight grid */}
              <section className="hospital-dashboard-grid" aria-label="Dashboard analytics panels">
                <section className="hospital-panel dashboard-insight-panel">
                  <div className="panel-head"><h2>Queue Snapshot</h2><p>Highest-acuity patients currently waiting.</p></div>
                  {recentPriorityRequests.length === 0 ? (
                    <p className="empty-state">No open patient requests right now.</p>
                  ) : (
                    <div className="dashboard-priority-list">
                      {recentPriorityRequests.map((r) => (
                        <article key={r.id} className="dashboard-priority-item">
                          <div><strong>{r.id}</strong><p>{r.patientName} - {r.symptom}</p></div>
                          <div className="dashboard-priority-item-meta">
                            <StatusBadge label={r.severity} tone={severityTone[r.severity]} />
                            <span>{formatDate(r.reportedAt)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => handleSectionChange('queue')}>Open Patient Queue</button>
                </section>

                <section className="hospital-panel dashboard-insight-panel">
                  <div className="panel-head"><h2>Fleet Health</h2><p>Availability, fuel, and connectivity at a glance.</p></div>
                  <dl className="dashboard-stat-grid">
                    <div><dt>Availability</dt><dd>{availableFleetPct}%</dd></div>
                    <div><dt>Offline Units</dt><dd>{offlineDrivers}</dd></div>
                    <div><dt>Completed Cases</dt><dd>{completionRate}%</dd></div>
                    <div><dt>Active Trips</dt><dd>{activeTrips}</dd></div>
                  </dl>
                  <button type="button" className="btn btn-secondary" onClick={() => handleSectionChange('ambulance')}>Open Ambulance Dashboard</button>
                </section>

                <section className="hospital-panel dashboard-insight-panel">
                  <div className="panel-head"><h2>Capacity Pressure</h2><p>Real-time occupancy pressure against total bed stock.</p></div>
                  <div className="capacity-meter" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.round(bedPressure * 100))}%` }} />
                  </div>
                  <p className="capacity-copy">{Math.round(bedPressure * 100)}% occupied - {availableBeds} beds and {availableIcuBeds} ICU beds available.</p>
                  <div className="capacity-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => handleBedAdjustment('occupiedBeds', -1, 'Occupied beds')}>Release 1 Bed</button>
                    <button type="button" className="btn btn-primary" onClick={() => handleSectionChange('beds')}>Open Bed Manager</button>
                  </div>
                </section>

                <section className="timeline-panel" aria-label="Operations timeline">
                  <div className="panel-head compact"><h3>Ops Timeline</h3><p>Dispatch, triage and capacity events.</p></div>
                  <div className="timeline-list">
                    {opsState.events.slice(0, 12).map((event) => (
                      <article className="timeline-item" key={event.id}>
                        <div className="timeline-item-head">
                          <StatusBadge label={event.type} tone={eventTone(event.type)} />
                          <time>{formatDate(event.at)}</time>
                        </div>
                        <p>{event.message}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            </>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
              SECTION: PATIENT QUEUE
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeSection === 'queue' && (
            <section className="hospital-queue-layout">
              <section className="hospital-panel request-panel">
                <div className="panel-head"><h2>Patient Queue</h2><p>Live hospital intake queue. Car accident alerts are handled in Car Accidents.</p></div>
                <div className="request-filters" role="tablist" aria-label="Request filters">
                  {requestFilters.map((f) => (
                    <button key={f.key} type="button" className={`filter-chip${requestFilter === f.key ? ' active' : ''}`} onClick={() => setRequestFilter(f.key)}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="request-list" ref={requestListRef}>
                  {filteredRequests.length === 0 ? (
                    <p className="empty-state">No requests for this filter.</p>
                  ) : (
                    filteredRequests.map((request) => {
                      const awaitingDecision = isAwaitingHospitalDecision(request);
                      const acceptedByCurrentHospital = isAcceptedByCurrentHospital(request);

                      return (
                        <article
                          key={request.id}
                          data-request-id={request.id}
                          className={`request-card${selectedRequestId === request.id ? ' selected' : ''}`}
                          onClick={() => setSelectedRequestId(request.id)}
                        >
                          <div className="request-card-head">
                            <div><h3>{request.id}</h3><p>{request.patientName}, {request.age} yrs</p></div>
                            <div className="request-card-badges">
                              <StatusBadge label={request.severity} tone={severityTone[request.severity]} />
                              <StatusBadge label={requestStatusLabel[request.status]} tone={requestStatusTone[request.status]} />
                            </div>
                          </div>
                          <p className="request-symptom">{request.symptom}</p>
                          <dl className="request-meta">
                            <div><dt>Address</dt><dd>{request.address}</dd></div>
                            <div><dt>Channel</dt><dd>{request.channel}</dd></div>
                            <div><dt>Reported</dt><dd>{formatDate(request.reportedAt)}</dd></div>
                          </dl>
                          <div className="request-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={!awaitingDecision}
                              onClick={() => {
                                void handleHospitalAlertDecision(request, 'accept');
                              }}
                            >
                              Accept Case
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={!awaitingDecision}
                              onClick={() => {
                                void handleHospitalAlertDecision(request, 'reject');
                              }}
                            >
                              Reject Case
                            </button>
                            {acceptedByCurrentHospital ? (
                              <button type="button" className="btn btn-ghost" disabled>
                                Accepted by This Hospital
                              </button>
                            ) : null}
                            <button type="button" className="btn btn-ghost" onClick={() => handleMapSelectRequest(request.id)}>Track</button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="hospital-panel map-panel">
                <div className="panel-head"><h2>Live Operations Map</h2><p>All backend-available drivers and active requests rendered live.</p></div>
                <div className="map-view-wrapper">
                  <MapView
                    hospital={opsState.hospital}
                    drivers={mapDrivers}
                    requests={queueRequests}
                    selectedDriverId={selectedDriverId}
                    selectedRequestId={selectedRequestId}
                    onSelectDriver={setSelectedDriverId}
                    onSelectRequest={handleMapSelectRequest}
                    onAcceptRequest={handleMapAcceptRequest}
                    onRejectRequest={handleMapRejectRequest}
                  />
                </div>
                <section className="dispatch-console" aria-label="Dispatch console">
                  <h3>Automated Dispatch Console</h3>
                  <p>
                    The backend sends alerts to the nearest 5 free drivers and nearest hospitals automatically.
                    When one driver or hospital accepts, the case disappears for the remaining candidates.
                  </p>
                  <p>
                    Current hospital decisions pending: <strong>{queueDispatchableRequests.length}</strong>.
                  </p>
                  {selectedQueueRequest ? (
                    <p>
                      Selected from map/list: <strong>{selectedQueueRequest.id}</strong> ({selectedQueueRequest.severity.toUpperCase()})
                    </p>
                  ) : (
                    <p>Select a patient directly on the map to focus that request.</p>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={handleClearExistingRequests}>
                    Clear Existing Requests
                  </button>
                </section>
              </section>
            </section>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
              SECTION: AMBULANCE DASHBOARD
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeSection === 'ambulance' && (
            <>
              <section className="hospital-kpi-grid ambulance-kpi-grid" aria-label="Ambulance summary">
                <article className="kpi-card tone-blue">
                  <div className="kpi-card-headline"><p>Ambulances Linked</p><span className="kpi-card-chip">Roster</span></div>
                  <strong>{linkedDrivers.length}</strong>
                  <span className="kpi-card-caption">{availableAmbulanceCount} currently available</span>
                </article>
                <article className="kpi-card tone-green">
                  <div className="kpi-card-headline"><p>Availability</p><span className="kpi-card-chip">Uptime</span></div>
                  <strong>{availableFleetPct}%</strong>
                  <span className="kpi-card-caption">{offlineDrivers} units offline</span>
                </article>
                <article className="kpi-card tone-amber">
                  <div className="kpi-card-headline"><p>Active Trips</p><span className="kpi-card-chip">In Transit</span></div>
                  <strong>{activeTrips}</strong>
                  <span className="kpi-card-caption">{avgEtaMinutes > 0 ? `Avg ETA ${avgEtaMinutes} min` : 'No active ETAs'}</span>
                </article>
              </section>

              <section className="hospital-panel ambulance-dashboard-panel" aria-label="Ambulance roster">
                <div className="panel-head"><h2>Ambulance Dashboard</h2><p>Driver assignment, speed and GPS ping status for every linked unit.</p></div>
                <div className="driver-list driver-list--expanded">
                  {linkedDrivers.map((driver) => (
                    <article key={driver.id} className={`driver-card${selectedDriverId === driver.id ? ' selected' : ''}`}>
                      <div className="driver-card-head">
                        <div><h4>{driver.callSign}</h4><p>{driver.name}</p></div>
                        <div className="driver-badges">
                          <StatusBadge label={driverStatusLabel[driver.status]} tone={driverStatusTone[driver.status]} />
                          <StatusBadge label={driver.occupied ? 'Occupied' : 'Empty'} tone={driver.occupied ? 'danger' : 'success'} />
                        </div>
                      </div>
                      <dl className="driver-meta">
                        <div><dt>Vehicle</dt><dd>{driver.vehicleNumber}</dd></div>
                        <div><dt>Speed</dt><dd>{Math.round(driver.speedKmph)} km/h</dd></div>
                        <div><dt>Ping</dt><dd>{formatPingAge(driver.lastPingAt)} ago</dd></div>
                      </dl>
                      <div className="driver-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setSelectedDriverId(driver.id)}>Focus</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
              SECTION: BED MANAGER
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeSection === 'beds' && (
            <section className="hospital-bed-layout">
              <aside className="hospital-panel side-panel">
                <div className="panel-head"><h2>Bed Manager</h2><p>Adjust occupancy and ICU availability in real time.</p></div>
                <section className="bed-card">
                  <div className="bed-row">
                    <div><p>Total Beds</p><strong>{opsState.hospital.beds.totalBeds}</strong></div>
                    <div className="stepper">
                      <button type="button" onClick={() => handleBedAdjustment('totalBeds', -1, 'Total beds')}>-</button>
                      <button type="button" onClick={() => handleBedAdjustment('totalBeds', 1, 'Total beds')}>+</button>
                    </div>
                  </div>
                  <div className="bed-row">
                    <div><p>Occupied</p><strong>{opsState.hospital.beds.occupiedBeds}</strong></div>
                    <div className="stepper">
                      <button type="button" onClick={() => handleBedAdjustment('occupiedBeds', -1, 'Occupied beds')}>Release</button>
                      <button type="button" onClick={() => handleBedAdjustment('occupiedBeds', 1, 'Occupied beds')}>Occupy</button>
                    </div>
                  </div>
                  <div className="bed-row">
                    <div><p>ICU Total</p><strong>{opsState.hospital.beds.icuTotal}</strong></div>
                    <div className="stepper">
                      <button type="button" onClick={() => handleBedAdjustment('icuTotal', -1, 'ICU total')}>-</button>
                      <button type="button" onClick={() => handleBedAdjustment('icuTotal', 1, 'ICU total')}>+</button>
                    </div>
                  </div>
                  <div className="bed-row">
                    <div><p>ICU Occupied</p><strong>{opsState.hospital.beds.icuOccupied}</strong></div>
                    <div className="stepper">
                      <button type="button" onClick={() => handleBedAdjustment('icuOccupied', -1, 'ICU occupied')}>Release</button>
                      <button type="button" onClick={() => handleBedAdjustment('icuOccupied', 1, 'ICU occupied')}>Occupy</button>
                    </div>
                  </div>
                </section>
              </aside>

              <section className="timeline-panel" aria-label="Capacity timeline">
                <div className="panel-head compact"><h3>Capacity Timeline</h3><p>Bed updates and capacity actions from operators.</p></div>
                <div className="timeline-list">
                  {capacityEvents.length === 0 ? (
                    <p className="empty-state">No bed-capacity changes recorded yet.</p>
                  ) : (
                    capacityEvents.slice(0, 14).map((event) => (
                      <article className="timeline-item" key={event.id}>
                        <div className="timeline-item-head">
                          <StatusBadge label={event.type} tone={eventTone(event.type)} />
                          <time>{formatDate(event.at)}</time>
                        </div>
                        <p>{event.message}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </section>
          )}

          {activeSection === 'carAccidents' && (
            <section className="hospital-panel car-accident-feed-panel">
              <div className="panel-head">
                <h2>Car Accident Alerts</h2>
                <p>
                  Live alerts from the car site API. Showing car, person, and location details.{' '}
                  {activeCarAccidents.length} active.
                </p>
              </div>

              {isCarAccidentsLoading ? (
                <p className="empty-state">Loading alerts...</p>
              ) : null}

              {!isCarAccidentsLoading && carAccidentsError ? (
                <p className="empty-state">{carAccidentsError}</p>
              ) : null}

              {!isCarAccidentsLoading && !carAccidentsError && carAccidents.length === 0 ? (
                <p className="empty-state">No car accident alerts found yet.</p>
              ) : null}

              {!isCarAccidentsLoading && !carAccidentsError && carAccidents.length > 0 ? (
                <div className="car-accident-list">
                  {carAccidents.map((alert) => {
                    const linkedRequest = requestByAlertId.get(alert.id) ?? toLiveRequest(alert);
                    const awaitingDecision = isAwaitingHospitalDecision(linkedRequest);
                    const acceptedByCurrentHospital = isAcceptedByCurrentHospital(linkedRequest);

                    return (
                      <article className={`car-accident-card status-${alert.status}`} key={alert.id}>
                        <div className="car-accident-head">
                          <div>
                            <h3>{alert.carName} {alert.carModel}</h3>
                            <p>{alert.id} - {formatCarAlertDateTime(alert.createdAt)}</p>
                          </div>
                          <div className="car-accident-badges">
                            <StatusBadge label={alert.severity.toUpperCase()} tone={severityTone[alert.severity]} />
                          </div>
                        </div>

                        <dl className="car-accident-meta">
                          <div><dt>Person</dt><dd>{alert.personName}</dd></div>
                          <div><dt>Phone</dt><dd>{alert.personPhone}</dd></div>
                          <div><dt>Location</dt><dd>{alert.lat.toFixed(5)}, {alert.lng.toFixed(5)}</dd></div>
                          <div><dt>Drivers Notified</dt><dd>{alert.notifiedDriverIds.length}</dd></div>
                        </dl>

                        <div className="request-actions">
                          <button type="button" className="btn btn-primary" disabled={!awaitingDecision} onClick={() => {
                            void handleHospitalAlertDecision(linkedRequest, 'accept');
                          }}>
                            Accept Request
                          </button>
                          <button type="button" className="btn btn-secondary" disabled={!awaitingDecision} onClick={() => {
                            void handleHospitalAlertDecision(linkedRequest, 'reject');
                          }}>
                            Reject Request
                          </button>
                          {acceptedByCurrentHospital ? (
                            <button type="button" className="btn btn-ghost" disabled>
                              Accepted by This Hospital
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          )}

        </div>
      </div>
    </main>
  );
}
