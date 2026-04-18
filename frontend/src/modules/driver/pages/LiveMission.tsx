import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crosshair, Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type LayerProps,
  type MapRef,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

import { NavigationPanel } from '@/components/driver/NavigationPanel';
import { useDriverSimulation } from '@/hooks/useDriverSimulation';
import { useVoiceNavigation } from '@/hooks/useVoiceNavigation';
import {
  acceptDriverCarAccidentAlert,
  listCarAccidentAlerts,
  rejectDriverCarAccidentAlert,
} from '@shared/utils/carAccidentApi';
import type { DriverAuthUser } from '@shared/utils/driverAuthApi';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import type { DispatchOffer, DriverStatus, DriverUnit, HospitalLocationRef, HospitalOpsState, PatientRequest } from '@shared/types/hospitalOps.types';
import { buildRoadRoute, fetchRoadRouteFromApi, routeDistanceKm } from '@shared/utils/hospitalOpsSimulator';
import { createInitialHospitalOpsState, MUMBAI_REAL_HOSPITALS } from '@shared/utils/hospitalDemoData';
import { DriverLayout } from './DriverLayout';
import { resolveDriverUnitId } from '../utils/driverIdentity';

type ActiveLeg = 'to_pickup' | 'to_hospital' | 'arrived';
type MissionStatusValue = DriverStatus | PatientRequest['status'] | 'picked_up';

interface MissionCoordinates {
  id: string;
  patientId: string;
  patientAge: number;
  complaint: string;
  driverLocation: { lat: number; lng: number };
  pickupLocation: { lat: number; lng: number; address: string };
  hospitalLocation: { lat: number; lng: number; name: string; address: string } | null;
}

interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    instruction: string;
    location?: [number, number];
  };
  voiceInstructions: { distanceAlongGeometry: number; announcement: string }[];
  bannerInstructions: {
    distanceAlongGeometry: number;
    primary: { text: string; type: string; modifier?: string };
    secondary?: { text: string };
  }[];
}

interface NavigationRoute {
  coordinates: [number, number][];
  steps: RouteStep[];
  etaSeconds: number;
  remainingDistanceMeters: number;
  loadedAt: number;
  leg: Exclude<ActiveLeg, 'arrived'>;
}

interface MapboxDirectionsStep {
  distance?: number;
  duration?: number;
  maneuver?: {
    type?: string;
    modifier?: string;
    instruction?: string;
    location?: [number, number];
  };
  voiceInstructions?: { distanceAlongGeometry: number; announcement: string }[];
  bannerInstructions?: {
    distanceAlongGeometry: number;
    primary: { text: string; type: string; modifier?: string };
    secondary?: { text: string };
  }[];
}

interface MapboxDirectionsLeg {
  distance?: number;
  duration?: number;
  steps?: MapboxDirectionsStep[];
}

interface MapboxDirectionsRoute {
  distance?: number;
  duration?: number;
  geometry?: { coordinates?: [number, number][] };
  legs?: MapboxDirectionsLeg[];
}

interface MapboxDirectionsResponse {
  routes?: MapboxDirectionsRoute[];
}

const STORAGE_KEY_PREFIX = 'codered-hospital-demo-v3';
const DEFAULT_HOSPITAL_ID = 'HSP-MUM-009';
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const TURN_ANNOUNCE_200_METERS = 200;
const TURN_ANNOUNCE_50_METERS = 50;
const ARRIVAL_METERS = 30;
const REROUTE_METERS = 50;
const FAST_SIMULATION_INTERVAL_MS = 1000;
const FAST_SIMULATION_TARGET_LEG_SECONDS = 30;
const DISPATCH_OFFER_SECONDS = 60;

const routeLineLayer: LayerProps = {
  id: 'live-mission-route-main',
  type: 'line',
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#ef4444',
    'line-width': 5,
    'line-opacity': 0.96,
  },
};

function stateStorageKey(hospitalId: string) {
  return `${STORAGE_KEY_PREFIX}-${hospitalId}`;
}

function isHospitalOpsState(candidate: unknown): candidate is HospitalOpsState {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const value = candidate as Partial<HospitalOpsState>;
  return Boolean(
    value.hospital &&
      Array.isArray(value.drivers) &&
      Array.isArray(value.requests) &&
      Array.isArray(value.events) &&
      typeof value.nextRequestNumber === 'number',
  );
}

function loadOpsStateByKey(key: string): HospitalOpsState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isHospitalOpsState(parsed)) {
      return {
        ...parsed,
        pendingDispatchOffers: Array.isArray(parsed.pendingDispatchOffers) ? parsed.pendingDispatchOffers : [],
      };
    }
  } catch {
    return null;
  }

  return null;
}

function resolveLatestOpsStorageKey(preferredHospitalId?: string): string | null {
  if (typeof window === 'undefined' || !preferredHospitalId) {
    return null;
  }

  const preferredKey = stateStorageKey(preferredHospitalId);
  if (!window.localStorage.getItem(preferredKey)) {
    return null;
  }

  return preferredKey;
}

function resolveHospitalRefForDriver(hospitalId?: string): HospitalLocationRef {
  const normalizedHospitalId = (hospitalId ?? DEFAULT_HOSPITAL_ID).trim().toUpperCase();
  const knownHospital = MUMBAI_REAL_HOSPITALS.find((hospital) => hospital.id.toUpperCase() === normalizedHospitalId);

  if (knownHospital) {
    return knownHospital;
  }

  return MUMBAI_REAL_HOSPITALS.find((hospital) => hospital.id === DEFAULT_HOSPITAL_ID) ?? MUMBAI_REAL_HOSPITALS[0];
}

function fallbackDriverCallSign(driverUser: DriverAuthUser) {
  const fromName = (driverUser.name || driverUser.email).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const suffix = driverUser.id.slice(-3).toUpperCase();
  return `${fromName || 'DRV'}-${suffix}`;
}

function ensureDriverUnitInState(state: HospitalOpsState, driverUser: DriverAuthUser | null): HospitalOpsState {
  if (!driverUser) {
    return state;
  }

  if (state.drivers.some((driver) => driver.id === driverUser.id)) {
    return state;
  }

  const nowIso = new Date().toISOString();
  const fallbackVehicleSuffix = driverUser.id.slice(-4).toUpperCase().padStart(4, '0');
  const driverUnit: DriverUnit = {
    id: driverUser.id,
    callSign: driverUser.callSign?.trim() || fallbackDriverCallSign(driverUser),
    name: driverUser.name || driverUser.email,
    vehicleNumber: driverUser.vehicleNumber || `MH-01-EM-${fallbackVehicleSuffix}`,
    phone: driverUser.phone || '+91 90000 00000',
    linkedHospitalId: (driverUser.linkedHospitalId ?? state.hospital.id).toUpperCase(),
    status: 'available',
    occupied: false,
    location: { ...state.hospital.location },
    speedKmph: 40,
    fuelPct: 76,
    lastPingAt: nowIso,
    pingIntervalSec: 6,
    secondsSincePing: 0,
  };

  return {
    ...state,
    drivers: [driverUnit, ...state.drivers],
    lastSimulationAt: nowIso,
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(from: [number, number], to: [number, number]) {
  const earthRadius = 6371000;
  const dLat = toRadians(to[1] - from[1]);
  const dLng = toRadians(to[0] - from[0]);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1])) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function estimateEtaMinutes(distanceKmValue: number, speedKmph: number) {
  if (speedKmph <= 0) {
    return undefined;
  }

  return Math.max(1, Math.round((distanceKmValue / speedKmph) * 60));
}

function appendSystemEvent(
  state: HospitalOpsState,
  message: string,
  requestId?: string,
  driverId?: string,
): HospitalOpsState {
  const nowIso = new Date().toISOString();
  const nextEvent: HospitalOpsState['events'][number] = {
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 100_000)}`,
    at: nowIso,
    type: 'dispatch',
    message,
    requestId,
    driverId,
  };

  return {
    ...state,
    events: [nextEvent, ...state.events].slice(0, 60),
    lastSimulationAt: nowIso,
  };
}

function isDispatchableOfferRequest(request: PatientRequest | null) {
  return Boolean(request && (request.status === 'new' || request.status === 'triaged'));
}

function isDispatchOfferDriverAvailable(driverStatus: DriverStatus | undefined, occupied: boolean | undefined) {
  return Boolean(driverStatus === 'available' && !occupied);
}

function offerSecondsLeft(offer: DispatchOffer, nowMs: number) {
  const expiresAtMs = Date.parse(offer.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

function buildDirectionsUrl(params: {
  origin: [number, number];
  pickup: [number, number];
  destination: [number, number];
  activeLeg: ActiveLeg;
  token: string;
}) {
  const { origin, pickup, destination, activeLeg, token } = params;
  const waypoints =
    activeLeg === 'to_hospital'
      ? `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`
      : `${origin[0]},${origin[1]};${pickup[0]},${pickup[1]}`;

  const search = new URLSearchParams({
    steps: 'true',
    voice_instructions: 'true',
    banner_instructions: 'true',
    voice_units: 'metric',
    geometries: 'geojson',
    overview: 'full',
    access_token: token,
  });

  return `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?${search.toString()}`;
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fetchDirectionsRoute(params: {
  token: string;
  origin: [number, number];
  pickup: [number, number];
  destination: [number, number];
  activeLeg: ActiveLeg;
  signal: AbortSignal;
}): Promise<NavigationRoute> {
  const response = await fetch(
    buildDirectionsUrl({
      origin: params.origin,
      pickup: params.pickup,
      destination: params.destination,
      activeLeg: params.activeLeg,
      token: params.token,
    }),
    { signal: params.signal },
  );

  if (!response.ok) {
    throw new Error('Mapbox directions request failed');
  }

  const payload = (await response.json()) as MapboxDirectionsResponse;
  const route = payload.routes?.[0];
  if (!route?.geometry?.coordinates || route.geometry.coordinates.length < 2) {
    throw new Error('Directions route unavailable');
  }

  const legs = Array.isArray(route.legs) ? route.legs : [];
  const legIndex = params.activeLeg === 'to_pickup' ? 0 : Math.max(0, legs.length - 1);
  const activeLeg = legs[legIndex] ?? legs[0];
  const rawSteps = activeLeg?.steps ?? [];

  const steps: RouteStep[] = rawSteps.map((step) => {
    const voiceInstructions = Array.isArray(step.voiceInstructions) ? step.voiceInstructions : [];
    const bannerInstructions = Array.isArray(step.bannerInstructions) ? step.bannerInstructions : [];
    const maneuverInstruction = step.maneuver?.instruction || bannerInstructions[0]?.primary?.text || 'Continue';

    return {
      instruction: maneuverInstruction,
      distance: step.distance ?? 0,
      duration: step.duration ?? 0,
      maneuver: {
        type: step.maneuver?.type ?? 'continue',
        modifier: step.maneuver?.modifier,
        instruction: maneuverInstruction,
        location:
          Array.isArray(step.maneuver?.location) &&
          isFiniteCoordinate(step.maneuver?.location?.[0]) &&
          isFiniteCoordinate(step.maneuver?.location?.[1])
            ? [step.maneuver.location[0], step.maneuver.location[1]]
            : undefined,
      },
      voiceInstructions,
      bannerInstructions,
    };
  });

  return {
    coordinates: route.geometry.coordinates,
    steps,
    etaSeconds: Math.round(activeLeg?.duration ?? route.duration ?? 0),
    remainingDistanceMeters: activeLeg?.distance ?? route.distance ?? 0,
    loadedAt: Date.now(),
    leg: params.activeLeg === 'to_hospital' ? 'to_hospital' : 'to_pickup',
  };
}

function emptyState(message: string) {
  return (
    <section
      style={{
        border: '1px solid #e2e8f0',
        background: '#ffffff',
        borderRadius: '14px',
        padding: '24px',
        color: '#1e293b',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Live Mission</h2>
      <p style={{ margin: '8px 0 0', color: '#475569' }}>{message}</p>
    </section>
  );
}

export function LiveMission() {
  const {
    isDriverAuthenticated,
    driverUser,
    logoutDriverUser,
  } = useHospitalAuth();

  const [opsStorageKey, setOpsStorageKey] = useState<string | null>(null);
  const [opsState, setOpsState] = useState<HospitalOpsState | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [routeData, setRouteData] = useState<NavigationRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [navStepIndex, setNavStepIndex] = useState(0);
  const [missionStatusOverride, setMissionStatusOverride] = useState<'picked_up' | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [isAcceptingDispatchOffer, setIsAcceptingDispatchOffer] = useState(false);

  const mapRef = useRef<MapRef | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const lastMissionIdRef = useRef<string | null>(null);
  const lastFetchRef = useRef<{ origin: [number, number]; leg: Exclude<ActiveLeg, 'arrived'>; missionId: string } | null>(
    null,
  );

  const announced200Ref = useRef<Set<number>>(new Set());
  const announced50Ref = useRef<Set<number>>(new Set());
  const straightAnnouncedRef = useRef<Set<number>>(new Set());
  const pickupArrivalAnnouncedRef = useRef(false);
  const hospitalArrivalAnnouncedRef = useRef(false);
  const missionCompleteAnnouncedRef = useRef(false);

  const { speak, voiceEnabled, setVoiceEnabled, supportsSpeech } = useVoiceNavigation();

  const syncLinkedState = useCallback(() => {
    if (!isDriverAuthenticated) {
      setOpsStorageKey(null);
      setOpsState(null);
      setSelectedDriverId(null);
      return;
    }

    const preferredHospitalId = (driverUser?.linkedHospitalId ?? DEFAULT_HOSPITAL_ID).trim().toUpperCase();
    let resolvedKey = resolveLatestOpsStorageKey(preferredHospitalId);

    if (!resolvedKey && typeof window !== 'undefined') {
      const hospitalRef = resolveHospitalRefForDriver(preferredHospitalId);
      const seededState = ensureDriverUnitInState(createInitialHospitalOpsState(hospitalRef), driverUser);
      resolvedKey = stateStorageKey(hospitalRef.id);
      window.localStorage.setItem(resolvedKey, JSON.stringify(seededState));
    }

    if (!resolvedKey) {
      setOpsStorageKey(null);
      setOpsState(null);
      setSelectedDriverId(null);
      return;
    }

    const parsed = loadOpsStateByKey(resolvedKey);
    if (!parsed) {
      return;
    }

    const withDriverState = ensureDriverUnitInState(parsed, driverUser);
    if (withDriverState !== parsed && typeof window !== 'undefined') {
      window.localStorage.setItem(resolvedKey, JSON.stringify(withDriverState));
    }

    const resolvedDriverId = resolveDriverUnitId({
      driverUser,
      drivers: withDriverState.drivers,
    });

    setOpsStorageKey(resolvedKey);
    setOpsState(withDriverState);
    setSelectedDriverId(resolvedDriverId ?? (driverUser ? driverUser.id : null));
  }, [driverUser, isDriverAuthenticated]);

  useEffect(() => {
    syncLinkedState();

    const intervalId = window.setInterval(() => {
      syncLinkedState();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [syncLinkedState]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith(STORAGE_KEY_PREFIX)) {
        return;
      }

      syncLinkedState();
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [syncLinkedState]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const linkedDrivers = opsState?.drivers ?? [];
  const authenticatedDriverUnitId = useMemo(
    () => resolveDriverUnitId({ driverUser, drivers: linkedDrivers }),
    [driverUser, linkedDrivers],
  );

  useEffect(() => {
    setSelectedDriverId((previousId) => {
      const targetId = authenticatedDriverUnitId ?? null;
      return previousId === targetId ? previousId : targetId;
    });
  }, [authenticatedDriverUnitId]);

  const selectedDriver = useMemo(() => {
    const targetDriverId = selectedDriverId ?? authenticatedDriverUnitId;
    return opsState?.drivers.find((driver) => driver.id === targetDriverId) ?? null;
  }, [authenticatedDriverUnitId, opsState, selectedDriverId]);

  const pendingDispatchOffers = opsState?.pendingDispatchOffers ?? [];

  const dispatchOffer = useMemo(() => {
    if (!opsState || !selectedDriver?.id) {
      return null;
    }

    const offersForDriver = pendingDispatchOffers
      .filter((offer) => offer.offeredDriverId === selectedDriver.id)
      .sort((left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt));

    for (const offer of offersForDriver) {
      const request = opsState.requests.find((candidate) => candidate.id === offer.requestId) ?? null;
      const driver = opsState.drivers.find((candidate) => candidate.id === offer.offeredDriverId) ?? null;

      if (!isDispatchableOfferRequest(request)) {
        continue;
      }

      if (!isDispatchOfferDriverAvailable(driver?.status, driver?.occupied)) {
        continue;
      }

      if (offerSecondsLeft(offer, nowTick) <= 0) {
        continue;
      }

      return offer;
    }

    return null;
  }, [nowTick, opsState, pendingDispatchOffers, selectedDriver?.id]);

  const dispatchOfferRequest = useMemo(() => {
    if (!opsState || !dispatchOffer) {
      return null;
    }

    return opsState.requests.find((request) => request.id === dispatchOffer.requestId) ?? null;
  }, [dispatchOffer, opsState]);

  const dispatchOfferDriver = useMemo(() => {
    if (!opsState || !dispatchOffer) {
      return null;
    }

    return opsState.drivers.find((driver) => driver.id === dispatchOffer.offeredDriverId) ?? null;
  }, [dispatchOffer, opsState]);

  const dispatchOfferSecondsRemaining = useMemo(
    () => (dispatchOffer ? offerSecondsLeft(dispatchOffer, nowTick) : 0),
    [dispatchOffer, nowTick],
  );

  const activeRequest = useMemo(() => {
    if (!opsState || !selectedDriver) {
      return null;
    }

    if (selectedDriver.assignment?.requestId) {
      const assignmentRequest =
        opsState.requests.find((request) => request.id === selectedDriver.assignment?.requestId) ?? null;

      if (assignmentRequest && assignmentRequest.status !== 'cancelled' && assignmentRequest.status !== 'completed') {
        return assignmentRequest;
      }

      return null;
    }

    return (
      opsState.requests.find(
        (request) =>
          request.assignedDriverId === selectedDriver.id &&
          request.status !== 'cancelled' &&
          request.status !== 'completed',
      ) ?? null
    );
  }, [opsState, selectedDriver]);

  useEffect(() => {
    if (!isDriverAuthenticated || !selectedDriver?.id || !opsStorageKey || typeof window === 'undefined') {
      return;
    }

    let isDisposed = false;

    const syncCarAlertsIntoMissionFlow = async () => {
      try {
        const alerts = await listCarAccidentAlerts(80);
        if (isDisposed) {
          return;
        }

        const latestState = loadOpsStateByKey(opsStorageKey);
        if (!latestState) {
          return;
        }

        const driverFromState = latestState.drivers.find((driver) => driver.id === selectedDriver.id);
        if (!driverFromState) {
          return;
        }

        const nowIso = new Date().toISOString();
        const previousCarRequestsById = new globalThis.Map<string, PatientRequest>(
          latestState.requests
            .filter((request) => request.id.startsWith('CAR-'))
            .map((request) => [request.id, request]),
        );

        const nextCarRequests: PatientRequest[] = alerts
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
          .map((alert) => {
            const requestId = `CAR-${alert.id}`;
            const previousRequest = previousCarRequestsById.get(requestId);
            const assignedHospitalLocation =
              typeof alert.assignedHospitalLat === 'number' && typeof alert.assignedHospitalLng === 'number'
                ? { lat: alert.assignedHospitalLat, lng: alert.assignedHospitalLng }
                : previousRequest?.destinationHospitalLocation;

            const status: PatientRequest['status'] =
              alert.status === 'resolved'
                ? 'completed'
                : alert.assignedDriverId
                  ? 'dispatched'
                  : alert.assignedHospitalId
                    ? 'triaged'
                    : 'new';

            return {
              id: requestId,
              sourceAlertId: alert.id,
              patientName: alert.personName,
              age: previousRequest?.age ?? 35,
              severity: alert.severity,
              symptom: previousRequest?.symptom ?? `Car accident alert from ${alert.carName} ${alert.carModel}`,
              address: previousRequest?.address ?? `Crash location (${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)})`,
              location: {
                lat: alert.lat,
                lng: alert.lng,
              },
              channel: 'whatsapp',
              reportedAt: alert.createdAt,
              status,
              assignedDriverId: alert.assignedDriverId ?? undefined,
              hospitalId: alert.assignedHospitalId ?? undefined,
              destinationHospitalName: alert.assignedHospitalName ?? previousRequest?.destinationHospitalName,
              destinationHospitalAddress:
                alert.assignedHospitalAddress ?? previousRequest?.destinationHospitalAddress,
              destinationHospitalLocation: assignedHospitalLocation,
              driverCandidateIds: Array.isArray(alert.notifiedDriverIds) ? alert.notifiedDriverIds : [],
              hospitalCandidateIds: Array.isArray(alert.notifiedHospitalIds) ? alert.notifiedHospitalIds : [],
              driverRejectedIds: Array.isArray(alert.driverRejectedIds) ? alert.driverRejectedIds : [],
              hospitalRejectedIds: Array.isArray(alert.hospitalRejectedIds) ? alert.hospitalRejectedIds : [],
              notes:
                [previousRequest?.notes, alert.notes, `[car-alert:${alert.id}] Contact ${alert.personPhone}`]
                  .filter(Boolean)
                  .join(' | ') || undefined,
            };
          });

        const nextDriverOffers: DispatchOffer[] = [];
        if (isDispatchOfferDriverAvailable(driverFromState.status, driverFromState.occupied)) {
          nextCarRequests.forEach((request) => {
            if (!request.sourceAlertId || request.assignedDriverId || request.status === 'completed') {
              return;
            }

            if (request.driverRejectedIds?.includes(driverFromState.id)) {
              return;
            }

            if (request.driverCandidateIds?.length && !request.driverCandidateIds.includes(driverFromState.id)) {
              return;
            }

            const offeredAtMs = Date.parse(request.reportedAt);
            const baseTs = Number.isFinite(offeredAtMs) ? offeredAtMs : Date.now();

            nextDriverOffers.push({
              id: `ALERT-${request.id}-${driverFromState.id}`,
              requestId: request.id,
              offeredDriverId: driverFromState.id,
              offeredAt: new Date(baseTs).toISOString(),
              expiresAt: new Date(baseTs + DISPATCH_OFFER_SECONDS * 1000).toISOString(),
            });
          });
        }

        const nonCarRequests = latestState.requests.filter((request) => !request.id.startsWith('CAR-'));
        const nonCarOffers = (latestState.pendingDispatchOffers ?? []).filter(
          (offer) => !offer.requestId.startsWith('CAR-') && offerSecondsLeft(offer, Date.now()) > 0,
        );

        const nextState: HospitalOpsState = {
          ...latestState,
          requests: [...nextCarRequests, ...nonCarRequests],
          pendingDispatchOffers: [...nextDriverOffers, ...nonCarOffers],
          lastSimulationAt: nowIso,
        };

        window.localStorage.setItem(opsStorageKey, JSON.stringify(nextState));
        setOpsState(nextState);
      } catch {
        // Keep current mission state; next poll will retry.
      }
    };

    void syncCarAlertsIntoMissionFlow();

    const intervalId = window.setInterval(() => {
      void syncCarAlertsIntoMissionFlow();
    }, 3_000);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [isDriverAuthenticated, opsStorageKey, selectedDriver?.id]);

  const mission = useMemo<MissionCoordinates | null>(() => {
    if (!selectedDriver || !activeRequest || !opsState) {
      return null;
    }

    const fallbackHospitalLocation = activeRequest.hospitalId ? opsState.hospital.location : null;
    const fallbackHospitalName = activeRequest.hospitalId ? opsState.hospital.name : undefined;
    const fallbackHospitalAddress = activeRequest.hospitalId ? opsState.hospital.address : undefined;

    const destinationHospitalLocation = activeRequest.destinationHospitalLocation ?? fallbackHospitalLocation;
    const destinationHospitalName = activeRequest.destinationHospitalName ?? fallbackHospitalName;
    const destinationHospitalAddress = activeRequest.destinationHospitalAddress ?? fallbackHospitalAddress;

    const hospitalLocation =
      destinationHospitalLocation && destinationHospitalName && destinationHospitalAddress
        ? {
            lat: destinationHospitalLocation.lat,
            lng: destinationHospitalLocation.lng,
            address: destinationHospitalAddress,
            name: destinationHospitalName,
          }
        : null;

    return {
      id: activeRequest.id,
      patientId: activeRequest.id,
      patientAge: activeRequest.age,
      complaint: activeRequest.symptom,
      driverLocation: {
        lat: selectedDriver.location.lat,
        lng: selectedDriver.location.lng,
      },
      pickupLocation: {
        lat: activeRequest.location.lat,
        lng: activeRequest.location.lng,
        address: activeRequest.address,
      },
      hospitalLocation,
    };
  }, [activeRequest, opsState, selectedDriver]);

  const missionDriverPickupDistance = useMemo(() => {
    if (!mission) {
      return Number.POSITIVE_INFINITY;
    }

    return distanceMeters(
      [mission.driverLocation.lng, mission.driverLocation.lat],
      [mission.pickupLocation.lng, mission.pickupLocation.lat],
    );
  }, [mission]);

  const missionStatus = useMemo<MissionStatusValue | null>(() => {
    if (!selectedDriver || !activeRequest) {
      return null;
    }

    if (activeRequest.status === 'completed') {
      return activeRequest.status;
    }

    if (missionStatusOverride === 'picked_up') {
      return 'picked_up';
    }

    return selectedDriver.status;
  }, [activeRequest, missionStatusOverride, selectedDriver]);

  const shouldConfirmPickup =
    missionStatusOverride !== 'picked_up' && missionDriverPickupDistance <= ARRIVAL_METERS;

  const activeLeg = useMemo<ActiveLeg>(() => {
    if (missionStatus === 'completed') {
      return 'arrived';
    }

    // Keep the driver on pickup leg until explicit pickup confirmation.
    if (shouldConfirmPickup) {
      return 'to_pickup';
    }

    if (missionStatus === 'picked_up' || missionStatus === 'with_patient' || missionStatus === 'to_hospital') {
      if (!mission?.hospitalLocation) {
        return 'to_pickup';
      }

      return 'to_hospital';
    }

    return 'to_pickup';
  }, [mission, missionStatus, shouldConfirmPickup]);

  const missionActive = Boolean(
    missionStatus === 'to_patient' ||
      missionStatus === 'picked_up' ||
      missionStatus === 'with_patient' ||
      missionStatus === 'to_hospital',
  );

  const setMissionStatus = useCallback(
    (nextStatus: 'picked_up') => {
      setMissionStatusOverride(nextStatus);

      if (nextStatus !== 'picked_up' || !opsStorageKey || !selectedDriver?.id || typeof window === 'undefined') {
        return;
      }

      const latestState = loadOpsStateByKey(opsStorageKey);
      if (!latestState) {
        return;
      }

      const nowIso = new Date().toISOString();
      let updated = false;

      const nextDrivers = latestState.drivers.map((driver): typeof driver => {
        if (driver.id !== selectedDriver.id) {
          return driver;
        }

        updated = true;
        return {
          ...driver,
          status: 'to_hospital' as const,
          occupied: true,
          assignment: driver.assignment
            ? {
                ...driver.assignment,
                stage: 'to_hospital' as const,
                stageTicks: 0,
              }
            : driver.assignment,
        };
      });

      if (!updated) {
        return;
      }

      const nextState: HospitalOpsState = {
        ...latestState,
        drivers: nextDrivers,
        lastSimulationAt: nowIso,
      };

      window.localStorage.setItem(opsStorageKey, JSON.stringify(nextState));
      setOpsState(nextState);
    },
    [opsStorageKey, selectedDriver],
  );

  const handleAcceptDispatchOffer = useCallback(async () => {
    if (!opsState || !dispatchOffer || !dispatchOfferRequest || !dispatchOfferDriver || !opsStorageKey || typeof window === 'undefined') {
      setRouteError('No valid dispatch offer available.');
      return;
    }

    if (!dispatchOfferRequest.sourceAlertId) {
      setRouteError('Dispatch offer is missing live alert metadata.');
      return;
    }

    if (dispatchOfferSecondsRemaining <= 0) {
      setRouteError('Dispatch offer already expired.');
      return;
    }

    if (!isDispatchOfferDriverAvailable(dispatchOfferDriver.status, dispatchOfferDriver.occupied)) {
      setRouteError('Driver unit is no longer available for this request.');
      return;
    }

    setIsAcceptingDispatchOffer(true);
    setRouteError(null);

    try {
      const response = await acceptDriverCarAccidentAlert(
        dispatchOfferRequest.sourceAlertId,
        dispatchOfferDriver.id,
      );

      const acceptedAlert = response.alert;
      const assignedHospitalLocation =
        typeof acceptedAlert.assignedHospitalLat === 'number' &&
        typeof acceptedAlert.assignedHospitalLng === 'number'
          ? { lat: acceptedAlert.assignedHospitalLat, lng: acceptedAlert.assignedHospitalLng }
          : null;

      const routeToPatientFromApi = await fetchRoadRouteFromApi(
        dispatchOfferDriver.location,
        dispatchOfferRequest.location,
      );

      const routeToPatient =
        routeToPatientFromApi.length > 1
          ? routeToPatientFromApi
          : buildRoadRoute(dispatchOfferDriver.location, dispatchOfferRequest.location);

      let routeToHospital: Array<{ lat: number; lng: number }> | undefined;
      if (assignedHospitalLocation) {
        const routeToHospitalFromApi = await fetchRoadRouteFromApi(
          dispatchOfferRequest.location,
          assignedHospitalLocation,
        );

        routeToHospital =
          routeToHospitalFromApi.length > 1
            ? routeToHospitalFromApi
            : buildRoadRoute(dispatchOfferRequest.location, assignedHospitalLocation);
      }

      const nowIso = new Date().toISOString();
      const etaToPatient = estimateEtaMinutes(
        routeDistanceKm(routeToPatient),
        Math.max(dispatchOfferDriver.speedKmph, 24),
      );

      const nextDrivers = opsState.drivers.map((driver) => {
        if (driver.id !== dispatchOfferDriver.id) {
          return driver;
        }

        return {
          ...driver,
          status: 'to_patient' as const,
          occupied: false,
          assignment: {
            requestId: dispatchOfferRequest.id,
            stage: 'to_patient' as const,
            stageTicks: 0,
            route: routeToPatient,
            routeIndex: 1,
            hospitalRoute: routeToHospital,
          },
          etaMinutes: etaToPatient,
          lastPingAt: nowIso,
          secondsSincePing: 0,
        };
      });

      const nextRequests = opsState.requests.map((request) => {
        if (request.id !== dispatchOfferRequest.id) {
          return request;
        }

        return {
          ...request,
          status: 'dispatched' as const,
          assignedDriverId: dispatchOfferDriver.id,
          hospitalId: acceptedAlert.assignedHospitalId ?? request.hospitalId,
          destinationHospitalName: acceptedAlert.assignedHospitalName ?? request.destinationHospitalName,
          destinationHospitalAddress:
            acceptedAlert.assignedHospitalAddress ?? request.destinationHospitalAddress,
          destinationHospitalLocation: assignedHospitalLocation ?? request.destinationHospitalLocation,
          notes: `${request.notes ? `${request.notes} | ` : ''}Dispatch accepted by ${dispatchOfferDriver.callSign}. ${response.message}`,
        };
      });

      let nextState: HospitalOpsState = {
        ...opsState,
        drivers: nextDrivers,
        requests: nextRequests,
        pendingDispatchOffers: (opsState.pendingDispatchOffers ?? []).filter(
          (offer) => offer.requestId !== dispatchOfferRequest.id,
        ),
        lastSimulationAt: nowIso,
      };

      nextState = appendSystemEvent(
        nextState,
        `${dispatchOfferDriver.callSign} accepted dispatch request for ${dispatchOfferRequest.id}.`,
        dispatchOfferRequest.id,
        dispatchOfferDriver.id,
      );

      window.localStorage.setItem(opsStorageKey, JSON.stringify(nextState));
      setOpsState(nextState);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Unable to accept dispatch request right now. Please retry.');
    } finally {
      setIsAcceptingDispatchOffer(false);
    }
  }, [
    dispatchOffer,
    dispatchOfferDriver,
    dispatchOfferRequest,
    dispatchOfferSecondsRemaining,
    opsState,
    opsStorageKey,
  ]);

  const handleDismissDispatchOffer = useCallback(async () => {
    if (!opsState || !dispatchOfferRequest || !dispatchOfferDriver || !opsStorageKey || typeof window === 'undefined') {
      setRouteError('No dispatch offer to dismiss.');
      return;
    }

    if (!dispatchOfferRequest.sourceAlertId) {
      setRouteError('Dispatch offer is missing live alert metadata.');
      return;
    }

    setIsAcceptingDispatchOffer(true);

    try {
      const response = await rejectDriverCarAccidentAlert(
        dispatchOfferRequest.sourceAlertId,
        dispatchOfferDriver.id,
      );

      const nowIso = new Date().toISOString();

      let nextState: HospitalOpsState = {
        ...opsState,
        requests: opsState.requests.map((request) => {
          if (request.id !== dispatchOfferRequest.id) {
            return request;
          }

          const rejectedDriverIds = new Set(request.driverRejectedIds ?? []);
          rejectedDriverIds.add(dispatchOfferDriver.id);

          return {
            ...request,
            driverRejectedIds: Array.from(rejectedDriverIds),
            notes: `${request.notes ? `${request.notes} | ` : ''}${response.message}`,
          };
        }),
        pendingDispatchOffers: (opsState.pendingDispatchOffers ?? []).filter(
          (offer) => offer.requestId !== dispatchOfferRequest.id,
        ),
        lastSimulationAt: nowIso,
      };

      nextState = appendSystemEvent(
        nextState,
        `${dispatchOfferDriver.callSign} rejected dispatch offer for ${dispatchOfferRequest.id}.`,
        dispatchOfferRequest.id,
        dispatchOfferDriver.id,
      );

      window.localStorage.setItem(opsStorageKey, JSON.stringify(nextState));
      setOpsState(nextState);
      setRouteError(null);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Unable to reject dispatch offer right now.');
    } finally {
      setIsAcceptingDispatchOffer(false);
    }
  }, [dispatchOfferDriver, dispatchOfferRequest, opsState, opsStorageKey]);

  useEffect(() => {
    if (!opsState || !opsStorageKey || typeof window === 'undefined') {
      return;
    }

    const offers = opsState.pendingDispatchOffers ?? [];
    if (offers.length === 0) {
      return;
    }

    const expiredCarOffers = offers.filter(
      (offer) => offer.requestId.startsWith('CAR-') && offerSecondsLeft(offer, nowTick) <= 0,
    );

    if (expiredCarOffers.length === 0) {
      return;
    }

    const nowIso = new Date().toISOString();

    let nextState: HospitalOpsState = {
      ...opsState,
      pendingDispatchOffers: offers.filter((offer) => offerSecondsLeft(offer, nowTick) > 0),
      lastSimulationAt: nowIso,
    };

    nextState = appendSystemEvent(
      nextState,
      `${expiredCarOffers.length} car dispatch offer${expiredCarOffers.length > 1 ? 's' : ''} expired and cleared.`,
    );

    window.localStorage.setItem(opsStorageKey, JSON.stringify(nextState));
    setOpsState(nextState);
  }, [nowTick, opsState, opsStorageKey]);

  const pickupCount = useMemo(() => {
    const offers = opsState?.pendingDispatchOffers ?? [];

    if (!selectedDriver?.id) {
      return 0;
    }

    return offers.filter((offer) => offer.offeredDriverId === selectedDriver.id && offerSecondsLeft(offer, nowTick) > 0).length;
  }, [nowTick, opsState?.pendingDispatchOffers, selectedDriver?.id]);

  const hasMission = Boolean(mission && selectedDriver && activeRequest);

  const coordinatesReady = Boolean(
    mission &&
      isFiniteCoordinate(mission.driverLocation.lng) &&
      isFiniteCoordinate(mission.driverLocation.lat) &&
      isFiniteCoordinate(mission.pickupLocation.lng) &&
      isFiniteCoordinate(mission.pickupLocation.lat) &&
      (activeLeg !== 'to_hospital' ||
        (mission.hospitalLocation &&
          isFiniteCoordinate(mission.hospitalLocation.lng) &&
          isFiniteCoordinate(mission.hospitalLocation.lat))),
  );

  const initialDriverPosition = mission
    ? ([mission.driverLocation.lng, mission.driverLocation.lat] as [number, number])
    : null;

  const pingDriverLocation = useCallback(
    ({ lng, lat }: { lng: number; lat: number }) => {
      if (!mission?.id) {
        return;
      }

      const timestamp = new Date().toISOString();

      void fetch('/api/driver/update-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: mission.id,
          lat,
          lng,
          timestamp,
        }),
      }).catch(() => {
        // Retry silently on next simulation cycle.
      });

      const targetDriverId = selectedDriverId ?? authenticatedDriverUnitId;

      if (!opsStorageKey || !targetDriverId || typeof window === 'undefined') {
        return;
      }

      const latestState = loadOpsStateByKey(opsStorageKey);
      if (!latestState) {
        return;
      }

      let changed = false;

      const nextDrivers = latestState.drivers.map((driver) => {
        if (driver.id !== targetDriverId) {
          return driver;
        }

        changed = true;
        return {
          ...driver,
          location: { lat, lng },
          lastPingAt: timestamp,
          secondsSincePing: 0,
        };
      });

      if (!changed) {
        return;
      }

      const nextState: HospitalOpsState = {
        ...latestState,
        drivers: nextDrivers,
        lastSimulationAt: timestamp,
      };

      window.localStorage.setItem(opsStorageKey, JSON.stringify(nextState));
      setOpsState(nextState);
    },
    [authenticatedDriverUnitId, mission?.id, opsStorageKey, selectedDriverId],
  );

  const {
    currentPosition,
    isSimulating,
    currentIndex,
    distanceToNextTurn,
    isMoving,
    hasArrived,
    startSimulation,
    stopSimulation,
    resetSimulation,
    bearingDegrees,
  } = useDriverSimulation({
    initialPosition: initialDriverPosition,
    simulationIntervalMs: FAST_SIMULATION_INTERVAL_MS,
    pingIntervalMs: 5000,
    targetLegDurationSeconds: FAST_SIMULATION_TARGET_LEG_SECONDS,
    onPositionUpdate: ({ lng, lat }) => {
      pingDriverLocation({ lng, lat });
    },
  });

  const effectiveDriverPosition = currentPosition ?? initialDriverPosition;

  const pickupPosition = mission
    ? ([mission.pickupLocation.lng, mission.pickupLocation.lat] as [number, number])
    : null;
  const hospitalPosition = useMemo<[number, number] | null>(() => {
    if (!mission?.hospitalLocation) {
      return null;
    }

    return [mission.hospitalLocation.lng, mission.hospitalLocation.lat];
  }, [mission]);

  useEffect(() => {
    const missionId = mission?.id ?? null;

    if (lastMissionIdRef.current === missionId) {
      return;
    }

    lastMissionIdRef.current = missionId;
    setMissionStatusOverride(null);

    lastFetchRef.current = null;
    pickupArrivalAnnouncedRef.current = false;
    hospitalArrivalAnnouncedRef.current = false;
    missionCompleteAnnouncedRef.current = false;
  }, [mission?.id]);

  useEffect(() => {
    if (!mission) {
      announced200Ref.current.clear();
      announced50Ref.current.clear();
      straightAnnouncedRef.current.clear();
      pickupArrivalAnnouncedRef.current = false;
      hospitalArrivalAnnouncedRef.current = false;
      missionCompleteAnnouncedRef.current = false;
    }
  }, [mission]);

  useEffect(() => {
    if (!mission || !coordinatesReady || !effectiveDriverPosition || !pickupPosition) {
      return;
    }

    if (activeLeg === 'arrived' || !MAPBOX_TOKEN) {
      return;
    }

    if (activeLeg === 'to_hospital' && !hospitalPosition) {
      return;
    }

    const destinationPosition = activeLeg === 'to_hospital' ? hospitalPosition : pickupPosition;
    if (!destinationPosition) {
      return;
    }

    const pickupDistanceFromDriver = distanceMeters(effectiveDriverPosition, pickupPosition);
    const hospitalDistanceFromDriver =
      activeLeg === 'to_hospital' ? distanceMeters(effectiveDriverPosition, destinationPosition) : 0;

    if (activeLeg === 'to_pickup' && pickupDistanceFromDriver <= ARRIVAL_METERS) {
      return;
    }

    if (activeLeg === 'to_hospital' && hospitalDistanceFromDriver <= ARRIVAL_METERS) {
      return;
    }

    const currentLeg = activeLeg;
    const lastFetch = lastFetchRef.current;
    const movedSignificantly =
      lastFetch !== null && distanceMeters(lastFetch.origin, effectiveDriverPosition) > REROUTE_METERS;

    const shouldFetch =
      !lastFetch ||
      lastFetch.leg !== currentLeg ||
      lastFetch.missionId !== mission.id ||
      (!isSimulating && movedSignificantly) ||
      retryNonce > 0;

    if (!shouldFetch) {
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    setIsLoadingRoute(true);
    setRouteError(null);

    void fetchDirectionsRoute({
      token: MAPBOX_TOKEN,
      origin: effectiveDriverPosition,
      pickup: pickupPosition,
      destination: destinationPosition,
      activeLeg: currentLeg,
      signal: controller.signal,
    })
      .then((nextRoute) => {
        if (disposed) {
          return;
        }

        setRouteData(nextRoute);
        setNavStepIndex(0);
        announced200Ref.current.clear();
        announced50Ref.current.clear();
        straightAnnouncedRef.current.clear();
        setRetryNonce(0);

        lastFetchRef.current = {
          origin: effectiveDriverPosition,
          leg: currentLeg,
          missionId: mission.id,
        };
      })
      .catch(() => {
        if (disposed) {
          return;
        }

        setRouteError('Route unavailable - retrying in 3s');
        if (retryTimerRef.current !== null) {
          window.clearTimeout(retryTimerRef.current);
        }

        retryTimerRef.current = window.setTimeout(() => {
          setRetryNonce((value) => value + 1);
        }, 3000);
      })
      .finally(() => {
        if (!disposed) {
          setIsLoadingRoute(false);
        }
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    activeLeg,
    coordinatesReady,
    effectiveDriverPosition,
    hospitalPosition,
    isSimulating,
    mission,
    pickupPosition,
    retryNonce,
  ]);

  useEffect(() => {
    if (!routeData || activeLeg === 'arrived') {
      return;
    }

    if (routeData.leg !== activeLeg) {
      return;
    }

    startSimulation(routeData.coordinates);
  }, [activeLeg, routeData, startSimulation]);

  useEffect(() => {
    if (activeLeg === 'arrived') {
      stopSimulation();
    }
  }, [activeLeg, stopSimulation]);

  const fitRouteOverview = useCallback(() => {
    if (!mapRef.current || !routeData || routeData.coordinates.length === 0) {
      return;
    }

    const [firstLng, firstLat] = routeData.coordinates[0];
    let minLng = firstLng;
    let maxLng = firstLng;
    let minLat = firstLat;
    let maxLat = firstLat;

    for (const [lng, lat] of routeData.coordinates) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }

    mapRef.current.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 72, duration: 900 },
    );
  }, [routeData]);

  useEffect(() => {
    if (!routeData) {
      return;
    }

    fitRouteOverview();

    if (activeLeg === 'to_pickup') {
      speak('Route calculated. Navigating to patient pickup.', true);
      return;
    }

    if (activeLeg === 'to_hospital' && missionStatus === 'picked_up') {
      speak('Navigating to assigned hospital.', true);
    }
  }, [activeLeg, fitRouteOverview, missionStatus, routeData, speak]);

  useEffect(() => {
    if (!routeData || !effectiveDriverPosition || activeLeg === 'arrived') {
      return;
    }

    mapRef.current?.easeTo({
      center: effectiveDriverPosition,
      zoom: 15,
      pitch: 45,
      bearing: bearingDegrees,
      duration: 1000,
    });
  }, [activeLeg, bearingDegrees, effectiveDriverPosition, routeData]);

  const steps = routeData?.steps ?? [];
  const boundedStepIndex = Math.min(navStepIndex, Math.max(0, steps.length - 1));
  const currentStep = steps[boundedStepIndex] ?? null;
  const nextStep = steps[boundedStepIndex + 1] ?? null;

  const maneuverDistanceMeters = useMemo(() => {
    if (!effectiveDriverPosition || !currentStep?.maneuver.location) {
      return distanceToNextTurn;
    }

    return distanceMeters(effectiveDriverPosition, currentStep.maneuver.location);
  }, [currentStep?.maneuver.location, distanceToNextTurn, effectiveDriverPosition]);

  useEffect(() => {
    if (!currentStep || !effectiveDriverPosition || !currentStep.maneuver.location) {
      return;
    }

    if (maneuverDistanceMeters <= TURN_ANNOUNCE_50_METERS && boundedStepIndex < steps.length - 1) {
      setNavStepIndex((previous) => Math.min(previous + 1, steps.length - 1));
    }
  }, [boundedStepIndex, currentStep, effectiveDriverPosition, maneuverDistanceMeters, steps.length]);

  useEffect(() => {
    if (!currentStep || activeLeg === 'arrived') {
      return;
    }

    const stepKey = boundedStepIndex;
    const voiceText =
      currentStep.voiceInstructions[0]?.announcement ||
      currentStep.bannerInstructions[0]?.primary?.text ||
      currentStep.instruction;

    if (
      maneuverDistanceMeters <= TURN_ANNOUNCE_200_METERS &&
      maneuverDistanceMeters > TURN_ANNOUNCE_50_METERS &&
      !announced200Ref.current.has(stepKey)
    ) {
      speak(`In 200 meters, ${voiceText}`, true);
      announced200Ref.current.add(stepKey);
    }

    if (maneuverDistanceMeters <= TURN_ANNOUNCE_50_METERS && !announced50Ref.current.has(stepKey)) {
      speak(voiceText, true);
      announced50Ref.current.add(stepKey);
    }
  }, [activeLeg, boundedStepIndex, currentStep, maneuverDistanceMeters, speak]);

  useEffect(() => {
    if (!currentStep) {
      return;
    }

    if (straightAnnouncedRef.current.has(boundedStepIndex)) {
      return;
    }

    const isStraightManeuver =
      currentStep.maneuver.type === 'continue' ||
      currentStep.maneuver.modifier === 'straight';

    if (isStraightManeuver && currentStep.distance > 500) {
      speak(`Continue straight for ${Math.round(currentStep.distance)} meters`);
      straightAnnouncedRef.current.add(boundedStepIndex);
    }
  }, [boundedStepIndex, currentStep, speak]);

  useEffect(() => {
    if (!mission) {
      return;
    }

    if (activeLeg === 'arrived' && !missionCompleteAnnouncedRef.current) {
      speak('Arrived at hospital. Mission complete.', true);
      missionCompleteAnnouncedRef.current = true;
    }
  }, [activeLeg, mission, speak]);

  const pickupDistance = useMemo(() => {
    if (!effectiveDriverPosition || !pickupPosition) {
      return Number.POSITIVE_INFINITY;
    }

    return distanceMeters(effectiveDriverPosition, pickupPosition);
  }, [effectiveDriverPosition, pickupPosition]);

  const hospitalDistance = useMemo(() => {
    if (!effectiveDriverPosition || !hospitalPosition) {
      return Number.POSITIVE_INFINITY;
    }

    return distanceMeters(effectiveDriverPosition, hospitalPosition);
  }, [effectiveDriverPosition, hospitalPosition]);

  const showMarkAsPickedButton =
    missionStatus !== 'completed' && missionStatusOverride !== 'picked_up' && pickupDistance <= ARRIVAL_METERS;
  const hospitalDestinationReady = Boolean(mission?.hospitalLocation);

  useEffect(() => {
    if (!showMarkAsPickedButton || pickupArrivalAnnouncedRef.current) {
      return;
    }

    pickupArrivalAnnouncedRef.current = true;
    stopSimulation();
    speak('You have arrived at pickup location. Please confirm pickup.', true);
  }, [showMarkAsPickedButton, speak, stopSimulation]);

  const handleMarkAsPicked = useCallback(() => {
    if (!mission) {
      return;
    }

    if (!mission.hospitalLocation) {
      setRouteError('Hospital not selected yet. Wait for hospital acceptance before heading to destination.');
      return;
    }

    setMissionStatus('picked_up');
    stopSimulation();
    setRouteData(null);
    setNavStepIndex(0);
    announced200Ref.current.clear();
    announced50Ref.current.clear();
    straightAnnouncedRef.current.clear();
    setRouteError(null);
    speak('Patient on board. Navigating to assigned hospital.', true);

    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    lastFetchRef.current = null;
    setRetryNonce((value) => value + 1);
  }, [mission, setMissionStatus, speak, stopSimulation]);

  useEffect(() => {
    if (!mission) {
      return;
    }

    if (activeLeg === 'to_hospital' && hospitalDistance <= ARRIVAL_METERS && !hospitalArrivalAnnouncedRef.current) {
      speak('Arrived at hospital. Mission complete.', true);
      hospitalArrivalAnnouncedRef.current = true;
      missionCompleteAnnouncedRef.current = true;
      stopSimulation();
    }
  }, [activeLeg, hospitalDistance, mission, speak, stopSimulation]);

  const routeGeoJson = useMemo(() => {
    if (!routeData || routeData.coordinates.length < 2) {
      return null;
    }

    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: routeData.coordinates,
      },
    };
  }, [routeData]);

  const mapInitialView = useMemo(() => {
    if (effectiveDriverPosition) {
      return {
        longitude: effectiveDriverPosition[0],
        latitude: effectiveDriverPosition[1],
        zoom: 13,
        pitch: 45,
        bearing: 0,
      };
    }

    if (pickupPosition) {
      return {
        longitude: pickupPosition[0],
        latitude: pickupPosition[1],
        zoom: 12,
        pitch: 30,
        bearing: 0,
      };
    }

    return {
      longitude: 72.8777,
      latitude: 19.076,
      zoom: 11,
      pitch: 0,
      bearing: 0,
    };
  }, [effectiveDriverPosition, pickupPosition]);

  const currentInstruction = currentStep?.instruction ?? 'Follow the highlighted route';
  const nextInstruction = nextStep?.instruction ?? 'Continue on current road';
  const maneuverType = currentStep?.maneuver.type ?? 'continue';
  const maneuverModifier = currentStep?.maneuver.modifier ?? 'straight';
  const destinationName =
    activeLeg === 'to_hospital'
      ? mission?.hospitalLocation?.name ?? 'Waiting for hospital assignment'
      : mission?.pickupLocation.address ?? 'Pickup location';

  const simulationBannerText = routeData
    ? isSimulating
      ? '🚑 Simulation running - movement every 1s, ping every 5s'
      : 'Simulation paused'
    : null;

  const arrivalOverlayVisible = activeLeg === 'arrived' || (activeLeg === 'to_hospital' && (hospitalDistance <= ARRIVAL_METERS || hasArrived));

  const centerOnDriver = useCallback(() => {
    if (!mapRef.current || !effectiveDriverPosition) {
      return;
    }

    mapRef.current.easeTo({
      center: effectiveDriverPosition,
      zoom: 15,
      pitch: 45,
      bearing: bearingDegrees,
      duration: 800,
    });
  }, [bearingDegrees, effectiveDriverPosition]);

  const handleSosVoice = useCallback(() => {
    speak('SOS activated. Emergency services alerted.', true);
  }, [speak]);
  
  const handleDoneMission = useCallback(() => {
    if (!activeRequest || !selectedDriver || !opsStorageKey || typeof window === 'undefined') {
      return;
    }

    const latestState = loadOpsStateByKey(opsStorageKey);
    if (!latestState) {
      return;
    }

    const nowIso = new Date().toISOString();
    const destinationLocation = mission?.hospitalLocation
      ? { lat: mission.hospitalLocation.lat, lng: mission.hospitalLocation.lng }
      : latestState.hospital.location;

    const nextDrivers = latestState.drivers.map((driver) =>
      driver.id === selectedDriver.id
        ? {
            ...driver,
            status: 'available' as const,
            occupied: false,
            location: { ...destinationLocation },
            assignment: undefined,
            etaMinutes: undefined,
            lastPingAt: nowIso,
            secondsSincePing: 0,
          }
        : driver,
    );

    const nextRequests = latestState.requests.map((request) =>
      request.id === activeRequest.id
        ? {
            ...request,
            status: 'completed' as const,
            assignedDriverId: selectedDriver.id,
            hospitalId: request.hospitalId ?? latestState.hospital.id,
            closedAt: nowIso,
            notes: `${request.notes ? `${request.notes} | ` : ''}Mission marked done by ${selectedDriver.callSign}.`,
          }
        : request,
    );

    let nextState: HospitalOpsState = {
      ...latestState,
      drivers: nextDrivers,
      requests: nextRequests,
      pendingDispatchOffers: (latestState.pendingDispatchOffers ?? []).filter(
        (offer) => offer.requestId !== activeRequest.id,
      ),
      lastSimulationAt: nowIso,
    };

    nextState = appendSystemEvent(
      nextState,
      `${selectedDriver.callSign} marked mission ${activeRequest.id} completed.`,
      activeRequest.id,
      selectedDriver.id,
    );

    window.localStorage.setItem(opsStorageKey, JSON.stringify(nextState));
    setOpsState(nextState);
    setMissionStatusOverride(null);
    setRouteData(null);
    setNavStepIndex(0);
    announced200Ref.current.clear();
    announced50Ref.current.clear();
    straightAnnouncedRef.current.clear();
    pickupArrivalAnnouncedRef.current = false;
    hospitalArrivalAnnouncedRef.current = false;
    missionCompleteAnnouncedRef.current = false;
    setRouteError(null);
    stopSimulation();
    speak('Mission closed. Returning to live mission queue.', true);
  }, [activeRequest, mission, opsStorageKey, selectedDriver, speak, stopSimulation]);
  const showDoneButton = arrivalOverlayVisible && Boolean(activeRequest && selectedDriver);

  if (!isDriverAuthenticated || !driverUser) {
    if (typeof window !== 'undefined') {
      window.location.hash = '/auth';
    }
    return null;
  }

  if (!hasMission) {
    return (
      <DriverLayout missionActive={false} pickupCount={pickupCount} onLogout={logoutDriverUser}>
        <main style={{ padding: '20px', display: 'grid', gap: '12px' }}>
          {routeError ? (
            <section
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '12px',
                border: '1px solid #fecaca',
                background: '#fff1f2',
                color: '#991b1b',
                fontSize: '14px',
                padding: '10px 12px',
              }}
            >
              <AlertTriangle size={16} />
              <span>{routeError}</span>
            </section>
          ) : null}

          {dispatchOffer && dispatchOfferRequest && dispatchOfferDriver ? (
            <section
              style={{
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                borderRadius: '14px',
                padding: '18px',
                display: 'grid',
                gap: '10px',
              }}
            >
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Dispatch Offer
              </p>
              <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>{dispatchOfferRequest.id}</h2>
              <p style={{ margin: 0, color: '#475569' }}>
                {dispatchOfferRequest.patientName} - {dispatchOfferRequest.symptom}
              </p>
              <p style={{ margin: 0, color: '#334155', fontSize: '13px' }}>
                Offered to {dispatchOfferDriver.callSign} for {DISPATCH_OFFER_SECONDS}s.
              </p>
              <p style={{ margin: 0, color: '#991b1b', fontSize: '13px', fontWeight: 700 }}>
                Time left: {dispatchOfferSecondsRemaining}s
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    void handleAcceptDispatchOffer();
                  }}
                  disabled={isAcceptingDispatchOffer || dispatchOfferSecondsRemaining <= 0}
                  style={{
                    width: 'fit-content',
                    border: 'none',
                    borderRadius: '10px',
                    background: '#dc2626',
                    color: '#ffffff',
                    padding: '10px 16px',
                    fontWeight: 700,
                    cursor:
                      isAcceptingDispatchOffer || dispatchOfferSecondsRemaining <= 0
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: isAcceptingDispatchOffer || dispatchOfferSecondsRemaining <= 0 ? 0.65 : 1,
                  }}
                >
                  {dispatchOfferSecondsRemaining <= 0
                    ? 'Offer Expired'
                    : isAcceptingDispatchOffer
                      ? 'Accepting...'
                      : 'Accept Dispatch'}
                </button>

                <button
                  type="button"
                  onClick={handleDismissDispatchOffer}
                  style={{
                    width: 'fit-content',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#ffffff',
                    color: '#334155',
                    padding: '10px 16px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Dismiss Offer
                </button>
              </div>
            </section>
          ) : (
            emptyState('No active mission assigned')
          )}
        </main>
      </DriverLayout>
    );
  }

  if (!coordinatesReady) {
    return (
      <DriverLayout missionActive={missionActive} pickupCount={pickupCount} onLogout={logoutDriverUser}>
        <main style={{ padding: '20px' }}>{emptyState('Waiting for dispatch coordinates...')}</main>
      </DriverLayout>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <DriverLayout missionActive={missionActive} pickupCount={pickupCount} onLogout={logoutDriverUser}>
        <main style={{ padding: '20px' }}>
          {emptyState('Mapbox token missing. Set VITE_MAPBOX_ACCESS_TOKEN to enable live mission navigation.')}
        </main>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout missionActive={missionActive} pickupCount={pickupCount} onLogout={logoutDriverUser}>
      <main style={{ padding: '16px', display: 'grid', gap: '12px' }}>
        <style>
          {`
            @keyframes live-mission-pulse {
              0% { transform: scale(1); opacity: 0.92; }
              50% { transform: scale(1.2); opacity: 0.45; }
              100% { transform: scale(1); opacity: 0.92; }
            }
          `}
        </style>

        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            padding: '14px 16px',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Live Mission
            </p>
            <h1 style={{ margin: '4px 0 0', fontSize: '22px', color: '#0f172a' }}>
              {mission?.id ?? 'Mission'}
            </h1>
            <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '14px' }}>
              Status: {missionStatus ?? 'waiting'} • Storage: {opsStorageKey ? 'linked' : 'waiting'}
            </p>
          </div>

          <div style={{ display: 'grid', gap: '6px', justifyItems: 'end' }}>
            <span
              style={{
                borderRadius: '999px',
                border: '1px solid #fecaca',
                background: '#fff1f2',
                color: '#9f1239',
                fontSize: '12px',
                fontWeight: 700,
                padding: '6px 10px',
              }}
            >
              🚑 Demo Mode (Fast Simulation Enabled)
            </span>

            {simulationBannerText ? (
              <span
                style={{
                  borderRadius: '999px',
                  border: '1px solid #d1d5db',
                  background: '#f8fafc',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '6px 10px',
                }}
              >
                {simulationBannerText}
              </span>
            ) : null}
          </div>
        </header>

        {routeError ? (
          <section
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '12px',
              border: '1px solid #fecaca',
              background: '#fff1f2',
              color: '#991b1b',
              fontSize: '14px',
              padding: '10px 12px',
            }}
          >
            <AlertTriangle size={16} />
            <span>{routeError}</span>
          </section>
        ) : null}

        <section
          style={{
            position: 'relative',
            minHeight: '72vh',
            borderRadius: '14px',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            background: '#e2e8f0',
          }}
        >
          <Map
            ref={mapRef}
            initialViewState={mapInitialView}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle="mapbox://styles/mapbox/navigation-day-v1"
            attributionControl={false}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />

            {routeGeoJson ? (
              <Source id="live-mission-route-source" type="geojson" data={routeGeoJson}>
                <Layer {...routeLineLayer} />
              </Source>
            ) : null}

            {effectiveDriverPosition ? (
              <Marker longitude={effectiveDriverPosition[0]} latitude={effectiveDriverPosition[1]} anchor="center">
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '999px',
                    border: '2px solid #ffffff',
                    background: '#ef4444',
                    position: 'relative',
                    transform: `rotate(${bearingDegrees}deg)`,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.28)',
                  }}
                  title="Driver location"
                >
                  <span
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      position: 'absolute',
                      animation: 'live-mission-pulse 1.4s ease-in-out infinite',
                    }}
                  />
                </div>
              </Marker>
            ) : null}

            {activeLeg === 'to_pickup' && pickupPosition ? (
              <Marker longitude={pickupPosition[0]} latitude={pickupPosition[1]} anchor="bottom">
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '999px',
                    border: '2px solid #fff',
                    background: '#f97316',
                    boxShadow: '0 8px 16px rgba(15, 23, 42, 0.22)',
                  }}
                  title={`${mission?.patientId ?? 'Patient'} • ${mission?.patientAge ?? 0}Y • ${mission?.complaint ?? ''}`}
                />
              </Marker>
            ) : null}

            {hospitalPosition ? (
              <Marker longitude={hospitalPosition[0]} latitude={hospitalPosition[1]} anchor="bottom">
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '999px',
                    border: '2px solid #fff',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontWeight: 800,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 8px 16px rgba(15, 23, 42, 0.22)',
                  }}
                  title={`${mission?.hospitalLocation?.name ?? 'Hospital'} • ${mission?.hospitalLocation?.address ?? ''}`}
                >
                  +
                </div>
              </Marker>
            ) : null}
          </Map>

          <NavigationPanel
            currentInstruction={currentInstruction}
            nextInstruction={nextInstruction}
            distanceToTurn={maneuverDistanceMeters}
            maneuverType={maneuverType}
            maneuverModifier={maneuverModifier}
            eta={routeData?.etaSeconds ?? 0}
            totalDistanceRemaining={routeData?.remainingDistanceMeters ?? 0}
            destinationName={destinationName}
            isSimulating={isSimulating}
          />

          <div
            style={{
              position: 'absolute',
              right: '14px',
              bottom: '14px',
              zIndex: 45,
              display: 'grid',
              gap: '8px',
            }}
          >
            {supportsSpeech ? (
              <button
                type="button"
                onClick={() => setVoiceEnabled((enabled) => !enabled)}
                style={{
                  border: 'none',
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#111827',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
                title={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
              >
                {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            ) : null}

            <button
              type="button"
              onClick={centerOnDriver}
              style={{
                border: 'none',
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#111827',
                color: '#fff',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
              title="Center on driver"
            >
              <Crosshair size={18} />
            </button>

            <button
              type="button"
              onClick={fitRouteOverview}
              style={{
                border: 'none',
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#111827',
                color: '#fff',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
              title="Overview route"
            >
              <Maximize2 size={18} />
            </button>
          </div>

          {routeData && activeLeg !== 'arrived' ? (
            <div
              style={{
                position: 'absolute',
                left: '14px',
                bottom: '14px',
                zIndex: 45,
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: 'rgba(255, 255, 255, 0.95)',
                display: 'grid',
                gap: '8px',
                padding: '10px 12px',
              }}
            >
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                Simulation mode - real route playback
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => startSimulation(routeData.coordinates)}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    background: '#111827',
                    color: '#fff',
                    padding: '7px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Play size={13} /> Start
                </button>
                <button
                  type="button"
                  onClick={stopSimulation}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    background: '#334155',
                    color: '#fff',
                    padding: '7px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Pause size={13} /> Pause
                </button>
                <button
                  type="button"
                  onClick={resetSimulation}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    background: '#e2e8f0',
                    color: '#0f172a',
                    padding: '7px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
            </div>
          ) : null}

          {showMarkAsPickedButton ? (
            <button
              type="button"
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg z-50"
              onClick={handleMarkAsPicked}
              disabled={!hospitalDestinationReady}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '24px',
                transform: 'translateX(-50%)',
                zIndex: 50,
                background: '#dc2626',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '12px 24px',
                fontWeight: 700,
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.3)',
                border: 'none',
                cursor: hospitalDestinationReady ? 'pointer' : 'not-allowed',
                opacity: hospitalDestinationReady ? 1 : 0.72,
              }}
            >
              {hospitalDestinationReady ? 'Mark as Picked' : 'Waiting for Hospital Acceptance'}
            </button>
          ) : null}
          {showDoneButton ? (
            <button
              type="button"
              onClick={handleDoneMission}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '76px',
                transform: 'translateX(-50%)',
                zIndex: 52,
                background: '#16a34a',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '12px 24px',
                fontWeight: 700,
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.3)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleSosVoice}
            style={{
              position: 'absolute',
              left: '14px',
              top: '14px',
              zIndex: 45,
              border: 'none',
              borderRadius: '10px',
              background: '#dc2626',
              color: '#fff',
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            SOS
          </button>

          {arrivalOverlayVisible ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                zIndex: 48,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.86)',
                  color: '#fff',
                  padding: '14px 18px',
                  textAlign: 'center',
                  maxWidth: '420px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '18px' }}>Arrived at destination</h3>
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#e2e8f0' }}>
                  {destinationName}
                </p>
              </div>
            </div>
          ) : null}

          {isLoadingRoute ? (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '20px',
                transform: 'translateX(-50%)',
                zIndex: 46,
                borderRadius: '999px',
                padding: '6px 12px',
                background: 'rgba(15, 23, 42, 0.78)',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              Updating route...
            </div>
          ) : null}
        </section>

        <section
          style={{
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            padding: '12px 14px',
            color: '#334155',
            fontSize: '13px',
            display: 'grid',
            gap: '4px',
          }}
        >
          <p style={{ margin: 0 }}>
            Driver: {selectedDriver?.callSign} • Mission status: {missionStatus ?? 'waiting'}
          </p>
          <p style={{ margin: 0 }}>
            Destination: {destinationName} • ETA: {Math.max(0, Math.round((routeData?.etaSeconds ?? 0) / 60))} min •
            Remaining: {((routeData?.remainingDistanceMeters ?? 0) / 1000).toFixed(1)} km
          </p>
          <p style={{ margin: 0 }}>
            Navigation index: {Math.max(currentIndex, boundedStepIndex)} • Distance to next turn:{' '}
            {Math.round(maneuverDistanceMeters)} m • {isMoving ? 'Moving' : 'Idle'}
          </p>
        </section>
      </main>
    </DriverLayout>
  );
}
