import { useEffect, useMemo, useState } from 'react';

import { AlertBanner } from '@shared/components/AlertBanner';
import { MapView } from '@shared/components/MapView';
import { StatusBadge } from '@shared/components/StatusBadge';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import { HospitalAuthPage } from './HospitalAuthPage';
import {
  DriverStatus,
  HospitalBedState,
  HospitalLocationRef,
  HospitalOpsState,
  OpsEvent,
  OpsEventType,
  RequestStatus,
  SeverityLevel,
} from '@shared/types/hospitalOps.types';
import { createInitialHospitalOpsState } from '@shared/utils/hospitalDemoData';
import {
  addIncomingPatientRequest,
  buildRoadRoute,
  fetchStrictRoadRouteFromApi,
  routeDistanceKm,
  runDriverPingCycle,
} from '@shared/utils/hospitalOpsSimulator';
import { formatDate } from '@shared/utils/formatters';
import './HospitalDashboard.css';

const STORAGE_KEY_PREFIX = 'codered-hospital-demo-v3';
const DRIVER_PING_SECONDS = 5;
const AUTO_INTAKE_SECONDS = 42;

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

const DEFAULT_HOSPITAL_REF: HospitalLocationRef = {
  id: 'HSP-MUM-009',
  name: 'Seven Hills Hospital',
  address: 'Marol Maroshi Road, Andheri East, Mumbai 400059',
  location: { lat: 19.1177786, lng: 72.8780686 },
};

interface ClosestDriverSuggestion {
  requestId: string;
  driverId: string;
  driverCallSign: string;
  driverName: string;
  distanceKm: number;
  etaMinutes: number;
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

function loadInitialState(hospitalRef: HospitalLocationRef) {
  if (typeof window === 'undefined') return createInitialHospitalOpsState(hospitalRef);
  const persisted = window.localStorage.getItem(stateStorageKey(hospitalRef.id));
  if (!persisted) return createInitialHospitalOpsState(hospitalRef);
  try {
    const parsed = JSON.parse(persisted) as unknown;
    if (isHospitalOpsState(parsed)) return parsed;
  } catch {
    return createInitialHospitalOpsState(hospitalRef);
  }
  return createInitialHospitalOpsState(hospitalRef);
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

function dispatchRequestToDriver(
  state: HospitalOpsState,
  requestId: string,
  driverId: string,
  routeToPatient: { lat: number; lng: number }[],
  routeToHospital: { lat: number; lng: number }[],
) {
  const request = state.requests.find((item) => item.id === requestId);
  const driver = state.drivers.find((item) => item.id === driverId);
  if (!request || !driver) return state;
  if (!(request.status === 'new' || request.status === 'triaged')) return state;
  if (driver.status !== 'available' || driver.occupied) return state;
  if (routeToPatient.length < 2 || routeToHospital.length < 2) return state;

  const routeStartPoint = routeToPatient[0] ?? driver.location;
  const routeDistance = routeDistanceKm(routeToPatient);
  const etaMinutes = Math.max(1, Math.round((routeDistance / Math.max(driver.speedKmph, 24)) * 60));
  const nowIso = new Date().toISOString();

  const requests = state.requests.map((item) =>
    item.id !== requestId
      ? item
      : {
          ...item,
          status: 'dispatched' as const,
          assignedDriverId: driverId,
          hospitalId: state.hospital.id,
          notes: `${item.notes ? `${item.notes} | ` : ''}Dispatched to ${driver.callSign}.`,
        },
  );

  const drivers = state.drivers.map((item) =>
    item.id !== driverId
      ? item
      : {
          ...item,
          location: { lat: routeStartPoint.lat, lng: routeStartPoint.lng },
          status: 'to_patient' as const,
          occupied: false,
          assignment: {
            requestId,
            stage: 'to_patient' as const,
            stageTicks: 0,
            route: routeToPatient,
            routeIndex: 1,
            hospitalRoute: routeToHospital,
          },
          etaMinutes,
          lastPingAt: nowIso,
          secondsSincePing: 0,
        },
  );

  return appendEvent(
    { ...state, requests, drivers },
    'dispatch',
    `${driver.callSign} dispatched to ${request.id} (${request.severity.toUpperCase()}).`,
    request.id,
    driver.id,
  );
}

function formatPingAge(lastPingAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(lastPingAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}

function eventTone(eventType: OpsEventType): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (eventType === 'incoming') return 'danger';
  if (eventType === 'triage' || eventType === 'capacity') return 'warning';
  if (eventType === 'handover') return 'success';
  if (eventType === 'dispatch' || eventType === 'arrival') return 'info';
  return 'neutral';
}

export function HospitalDashboard() {
  const {
    driverUser,
    hospitalUser,
    isHospitalAuthenticated,
    logoutHospitalUser,
  } = useHospitalAuth();

  const activeHospitalRef = useMemo<HospitalLocationRef>(
    () =>
      hospitalUser
        ? {
            id: hospitalUser.id,
            name: hospitalUser.name,
            address: hospitalUser.address ?? DEFAULT_HOSPITAL_REF.address,
            location: hospitalUser.location
              ? { ...hospitalUser.location }
              : { ...DEFAULT_HOSPITAL_REF.location },
          }
        : DEFAULT_HOSPITAL_REF,
    [hospitalUser],
  );

  const [opsState, setOpsState] = useState<HospitalOpsState>(() => loadInitialState(activeHospitalRef));
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [requestFilter, setRequestFilter] = useState<'all' | RequestStatus>('all');
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [closestSuggestion, setClosestSuggestion] = useState<ClosestDriverSuggestion | null>(null);
  const [isResolvingRoute, setIsResolvingRoute] = useState(false);

  useEffect(() => {
    if (!hospitalUser) {
      return;
    }

    setOpsState(loadInitialState(activeHospitalRef));
    setSelectedRequestId(null);
    setSelectedDriverId(null);
    setRequestFilter('all');
    setClosestSuggestion(null);
    setDispatchNotice(null);
  }, [activeHospitalRef, hospitalUser]);

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

    const id = window.setInterval(() => {
      setOpsState((prev) => {
        const active = prev.requests.filter(
          (r) => r.status !== 'completed' && r.status !== 'cancelled',
        ).length;
        if (active >= 10) return prev;
        if (Math.random() < 0.58) return addIncomingPatientRequest(prev);
        return prev;
      });
    }, AUTO_INTAKE_SECONDS * 1000);

    return () => window.clearInterval(id);
  }, [hospitalUser]);

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
    if (!opsState.drivers.some((d) => d.id === selectedDriverId)) setSelectedDriverId(null);
  }, [opsState.drivers, selectedDriverId]);

  useEffect(() => {
    if (!closestSuggestion) return;
    if (selectedRequestId !== closestSuggestion.requestId) setClosestSuggestion(null);
  }, [closestSuggestion, selectedRequestId]);

  useEffect(() => {
    if (!dispatchNotice) return;
    const id = window.setTimeout(() => setDispatchNotice(null), 4200);
    return () => window.clearTimeout(id);
  }, [dispatchNotice]);

  const linkedDrivers = useMemo(
    () => opsState.drivers.filter((d) => d.linkedHospitalId === opsState.hospital.id),
    [opsState.drivers, opsState.hospital.id],
  );

  const openRequests = useMemo(
    () => opsState.requests.filter((r) => r.status !== 'completed' && r.status !== 'cancelled'),
    [opsState.requests],
  );

  const dispatchableRequests = useMemo(
    () => openRequests.filter((r) => r.status === 'new' || r.status === 'triaged'),
    [openRequests],
  );

  const filteredRequests = useMemo(() => {
    const base = requestFilter === 'all' ? openRequests : openRequests.filter((r) => r.status === requestFilter);
    return [...base].sort((a, b) => {
      const sd = severityPriority[b.severity] - severityPriority[a.severity];
      if (sd !== 0) return sd;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });
  }, [openRequests, requestFilter]);

  const availableDrivers = useMemo(
    () => linkedDrivers.filter((d) => d.status === 'available' && !d.occupied),
    [linkedDrivers],
  );

  const loggedInAvailableDriver = useMemo(
    () => (driverUser ? availableDrivers.find((driver) => driver.id === driverUser.id) ?? null : null),
    [availableDrivers, driverUser],
  );

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

  const selectedRequest = useMemo(
    () => (selectedRequestId ? opsState.requests.find((r) => r.id === selectedRequestId) ?? null : null),
    [opsState.requests, selectedRequestId],
  );

  const selectedDriver = useMemo(
    () => (selectedDriverId ? linkedDrivers.find((d) => d.id === selectedDriverId) ?? null : null),
    [linkedDrivers, selectedDriverId],
  );

  const availableBeds = opsState.hospital.beds.totalBeds - opsState.hospital.beds.occupiedBeds;
  const availableIcuBeds = opsState.hospital.beds.icuTotal - opsState.hospital.beds.icuOccupied;
  const bedPressure =
    opsState.hospital.beds.totalBeds === 0
      ? 0
      : opsState.hospital.beds.occupiedBeds / opsState.hospital.beds.totalBeds;
  const criticalCases = openRequests.filter((r) => r.severity === 'critical').length;

  const handleSimulateIncoming = () => {
    setOpsState((prev) => addIncomingPatientRequest(prev));
    setDispatchNotice('Simulated one incoming patient request.');
  };

  const handleResetDemo = () => {
    setOpsState(createInitialHospitalOpsState(activeHospitalRef));
    setSelectedDriverId(null);
    setSelectedRequestId(null);
    setRequestFilter('all');
    setClosestSuggestion(null);
    setDispatchNotice('Demo data has been reset to baseline.');
  };

  const handleTriageRequest = (requestId: string) => {
    setOpsState((prev) => {
      const request = prev.requests.find((r) => r.id === requestId);
      if (!request || request.status !== 'new') return prev;
      const requests = prev.requests.map((r) =>
        r.id !== requestId
          ? r
          : {
              ...r,
              status: 'triaged' as const,
              hospitalId: prev.hospital.id,
              notes: `${r.notes ? `${r.notes} | ` : ''}Triaged by hospital desk.`,
            },
      );
      return appendEvent({ ...prev, requests }, 'triage', `${request.id} triaged as ${request.severity.toUpperCase()}.`, request.id);
    });
    setSelectedRequestId(requestId);
    setDispatchNotice(`Request ${requestId} moved to triaged queue.`);
  };

  const dispatchWithDriver = async (requestId: string, driverId: string, mode: 'manual' | 'auto') => {
    const request = opsState.requests.find((r) => r.id === requestId);
    const driver = linkedDrivers.find((d) => d.id === driverId);
    if (!request || !driver) { setDispatchNotice('Unable to dispatch. Reselect request/driver.'); return; }
    if (!(request.status === 'new' || request.status === 'triaged')) { setDispatchNotice('Only new or triaged requests can be dispatched.'); return; }
    if (driver.status !== 'available' || driver.occupied) { setDispatchNotice('Selected driver is not available.'); return; }

    setIsResolvingRoute(true);

    try {
      const [routeToPatient, routeToHospital] = await Promise.all([
        fetchStrictRoadRouteFromApi(driver.location, request.location),
        fetchStrictRoadRouteFromApi(request.location, opsState.hospital.location),
      ]);

      if (!routeToPatient || !routeToHospital) {
        setDispatchNotice('Could not fetch a drivable road route right now. Please try again.');
        return;
      }

      setOpsState((prev) =>
        dispatchRequestToDriver(prev, requestId, driverId, routeToPatient, routeToHospital),
      );
      setSelectedRequestId(requestId);
      setSelectedDriverId(driverId);
      setClosestSuggestion(null);
      setDispatchNotice(`${mode === 'auto' ? 'Auto-dispatched' : 'Dispatched'} ${driver.callSign} → ${request.id}.`);
    } finally {
      setIsResolvingRoute(false);
    }
  };

  const suggestClosestDriverForRequest = (requestId: string) => {
    const request = opsState.requests.find((r) => r.id === requestId);
    if (!request) {
      setDispatchNotice('Request no longer available.');
      return;
    }

    if (!(request.status === 'new' || request.status === 'triaged')) {
      setDispatchNotice('Only new or triaged requests can be allocated.');
      return;
    }

    if (availableDrivers.length === 0) {
      setSelectedRequestId(requestId);
      setSelectedDriverId(null);
      setClosestSuggestion(null);
      setDispatchNotice('No available drivers currently.');
      return;
    }

    const nearest = availableDrivers.reduce((best, current) => {
      const bestDistance = routeDistanceKm(buildRoadRoute(best.location, request.location));
      const currentDistance = routeDistanceKm(buildRoadRoute(current.location, request.location));
      return currentDistance < bestDistance ? current : best;
    }, availableDrivers[0]);

    const chosenDriver = loggedInAvailableDriver ?? nearest;

    const chosenRoute = buildRoadRoute(chosenDriver.location, request.location);
    const chosenDistanceKm = routeDistanceKm(chosenRoute);
    const chosenEta = Math.max(1, Math.round((chosenDistanceKm / Math.max(chosenDriver.speedKmph, 24)) * 60));

    const isLoggedInPrioritized = Boolean(loggedInAvailableDriver && loggedInAvailableDriver.id === chosenDriver.id);

    setSelectedRequestId(requestId);
    setSelectedDriverId(chosenDriver.id);
    setClosestSuggestion({
      requestId,
      driverId: chosenDriver.id,
      driverCallSign: chosenDriver.callSign,
      driverName: chosenDriver.name,
      distanceKm: chosenDistanceKm,
      etaMinutes: chosenEta,
    });

    if (isLoggedInPrioritized) {
      setDispatchNotice(
        `Logged-in nearby driver selected: ${chosenDriver.callSign} (${chosenDistanceKm.toFixed(1)} km).`,
      );
      return;
    }

    setDispatchNotice(`Closest driver selected: ${chosenDriver.callSign} (${chosenDistanceKm.toFixed(1)} km).`);
  };

  const handleAutoDispatchNearest = (requestId: string) => {
    suggestClosestDriverForRequest(requestId);
  };

  const handleDispatchSelected = () => {
    if (!selectedRequestId || !selectedDriverId) { setDispatchNotice('Select one request and one driver first.'); return; }
    void dispatchWithDriver(selectedRequestId, selectedDriverId, 'manual');
  };

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

  if (!isHospitalAuthenticated || !hospitalUser) {
    return <HospitalAuthPage />;
  }

  return (
    <main className="hospital-dashboard">
      {/* ── Header ── */}
      <header className="hospital-head">
        <div className="hospital-head-copy">
          <p className="hospital-eyebrow">Hospital Operations Console</p>
          <h1>{opsState.hospital.name}</h1>
          <p>
            Live demo — real-time request intake, GPS ping simulation, fleet linkage and dispatch flow.
          </p>
          <p className="hospital-auth-meta">
            Signed in as {hospitalUser.email}
          </p>
          <div className="hospital-live-meta">
            <span className="live-pill">Live · pings every {DRIVER_PING_SECONDS}s</span>
            <span className="hospital-timestamp">Last tick {formatDate(opsState.lastSimulationAt)}</span>
          </div>
        </div>

        <div className="hospital-head-actions">
          <button type="button" className="btn btn-secondary" onClick={handleSimulateIncoming}>
            + Simulate Request
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleResetDemo}>
            Reset Demo
          </button>
          <button type="button" className="btn btn-ghost" onClick={logoutHospitalUser}>
            Logout
          </button>
        </div>
      </header>

      {/* ── Alerts ── */}
      <div className="alert-stack">
        {bedPressure >= 0.9 && (
          <AlertBanner
            tone="danger"
            title="Bed occupancy critical"
            message="Capacity crossed 90%. Consider releasing beds or rerouting intake."
            actionLabel="Release 1 Bed"
            onAction={() => handleBedAdjustment('occupiedBeds', -1, 'Occupied beds')}
          />
        )}
        {criticalCases > 0 && (
          <AlertBanner
            tone="warning"
            title={`${criticalCases} critical case${criticalCases > 1 ? 's' : ''} in queue`}
            message="Prioritize triage and dispatch for high-acuity patients."
          />
        )}
        {dispatchNotice && <AlertBanner tone="info" title={dispatchNotice} />}
      </div>

      {/* ── KPIs ── */}
      <section className="hospital-kpi-grid" aria-label="Operations summary">
        <article className="kpi-card">
          <p>Open Requests</p>
          <strong>{openRequests.length}</strong>
          <span>{dispatchableRequests.length} awaiting dispatch</span>
        </article>
        <article className="kpi-card">
          <p>Fleet Linked</p>
          <strong>{linkedDrivers.length}</strong>
          <span>{availableDrivers.length} available now</span>
        </article>
        <article className="kpi-card">
          <p>Active Trips</p>
          <strong>{activeTrips}</strong>
          <span>{avgEtaMinutes > 0 ? `Avg ETA ${avgEtaMinutes} min` : 'No active ETAs'}</span>
        </article>
        <article className="kpi-card">
          <p>Beds Available</p>
          <strong>{availableBeds}</strong>
          <span>ICU {availableIcuBeds} / {opsState.hospital.beds.icuTotal}</span>
        </article>
      </section>

      {/* ── Main three-column layout ── */}
      <section className="hospital-layout">

        {/* ── LEFT: Request queue ── */}
        <section className="hospital-panel request-panel">
          <div className="panel-head">
            <h2>Patient Queue</h2>
            <p>Receive, triage, and dispatch.</p>
          </div>

          <div className="request-filters" role="tablist" aria-label="Request filters">
            {requestFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-chip ${requestFilter === f.key ? 'active' : ''}`}
                onClick={() => setRequestFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="request-list">
            {filteredRequests.length === 0 ? (
              <p className="empty-state">No requests for this filter.</p>
            ) : (
              filteredRequests.map((request) => (
                <article
                  key={request.id}
                  className={`request-card ${selectedRequestId === request.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRequestId(request.id)}
                >
                  <div className="request-card-head">
                    <div>
                      <h3>{request.id}</h3>
                      <p>{request.patientName}, {request.age} yrs</p>
                    </div>
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
                    {request.status === 'new' && (
                      <button type="button" className="btn btn-secondary" onClick={() => handleTriageRequest(request.id)}>
                        Triage
                      </button>
                    )}
                    {(request.status === 'new' || request.status === 'triaged') && availableDrivers.length > 0 && (
                      <button type="button" className="btn btn-primary" onClick={() => handleAutoDispatchNearest(request.id)}>
                        Auto Select Closest
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost" onClick={() => setSelectedRequestId(request.id)}>
                      Track
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* ── CENTER: Map + Dispatch + Fleet ── */}
        <section className="hospital-panel map-panel">
          <div className="panel-head">
            <h2>Live Operations Map</h2>
            <p>All linked drivers and active requests rendered live.</p>
          </div>

          {/* Map — prominent and tall */}
          <div className="map-view-wrapper">
            <MapView
              hospital={opsState.hospital}
              drivers={linkedDrivers}
              requests={opsState.requests}
              selectedDriverId={selectedDriverId}
              selectedRequestId={selectedRequestId}
              onSelectDriver={setSelectedDriverId}
              onSelectRequest={setSelectedRequestId}
              onSuggestClosestDriver={handleAutoDispatchNearest}
              suggestedDriversByRequest={
                closestSuggestion
                  ? {
                      [closestSuggestion.requestId]: `${closestSuggestion.driverCallSign} (${closestSuggestion.distanceKm.toFixed(1)} km, ${closestSuggestion.etaMinutes} min)`,
                    }
                  : undefined
              }
            />
          </div>

          {/* Dispatch console */}
          <section className="dispatch-console" aria-label="Dispatch console">
            <h3>Dispatch Console</h3>
            <div className="dispatch-fields">
              <label>
                Request
                <select
                  value={selectedRequestId ?? ''}
                  onChange={(e) => setSelectedRequestId(e.target.value || null)}
                >
                  <option value="">Select request…</option>
                  {dispatchableRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} · {r.severity.toUpperCase()} · {r.address}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Driver
                <select
                  value={selectedDriverId ?? ''}
                  onChange={(e) => setSelectedDriverId(e.target.value || null)}
                >
                  <option value="">Select driver…</option>
                  {availableDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.callSign} · {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {closestSuggestion && selectedRequestId === closestSuggestion.requestId ? (
              <p className="closest-driver-note">
                Closest driver selected: <strong>{closestSuggestion.driverCallSign}</strong> ({closestSuggestion.driverName}) ·{' '}
                {closestSuggestion.distanceKm.toFixed(1)} km · ETA {closestSuggestion.etaMinutes} min. Press{' '}
                <strong>Dispatch Selected Pair</strong> to proceed.
              </p>
            ) : null}

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDispatchSelected}
              disabled={!selectedRequest || !selectedDriver || isResolvingRoute}
            >
              {isResolvingRoute ? 'Preparing Road Route...' : 'Dispatch Selected Pair'}
            </button>
          </section>

          {/* Fleet roster */}
          <section className="driver-roster" aria-label="Linked drivers">
            <div className="panel-head compact">
              <h3>Linked Fleet</h3>
              <p>Status, fuel, speed and ping for every unit.</p>
            </div>
            <div className="driver-list">
              {linkedDrivers.map((driver) => (
                <article
                  key={driver.id}
                  className={`driver-card ${selectedDriverId === driver.id ? 'selected' : ''}`}
                >
                  <div className="driver-card-head">
                    <div>
                      <h4>{driver.callSign}</h4>
                      <p>{driver.name}</p>
                    </div>
                    <div className="driver-badges">
                      <StatusBadge label={driverStatusLabel[driver.status]} tone={driverStatusTone[driver.status]} />
                      <StatusBadge label={driver.occupied ? 'Occupied' : 'Empty'} tone={driver.occupied ? 'danger' : 'success'} />
                    </div>
                  </div>

                  <dl className="driver-meta">
                    <div><dt>Vehicle</dt><dd>{driver.vehicleNumber}</dd></div>
                    <div><dt>Fuel</dt><dd>{Math.round(driver.fuelPct)}%</dd></div>
                    <div><dt>Speed</dt><dd>{Math.round(driver.speedKmph)} km/h</dd></div>
                    <div><dt>Ping</dt><dd>{formatPingAge(driver.lastPingAt)} ago</dd></div>
                  </dl>

                  <div className="driver-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setSelectedDriverId(driver.id)}>
                      Focus
                    </button>
                    {selectedRequest && driver.status === 'available' && !driver.occupied && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          void dispatchWithDriver(selectedRequest.id, driver.id, 'manual');
                        }}
                        disabled={isResolvingRoute}
                      >
                        Dispatch Here
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        {/* ── RIGHT: Beds + Timeline ── */}
        <aside className="hospital-panel side-panel">
          <div className="panel-head">
            <h2>Bed Manager</h2>
            <p>Adjust occupancy in real time.</p>
          </div>

          <section className="bed-card">
            <div className="bed-row">
              <div>
                <p>Total Beds</p>
                <strong>{opsState.hospital.beds.totalBeds}</strong>
              </div>
              <div className="stepper">
                <button type="button" onClick={() => handleBedAdjustment('totalBeds', -1, 'Total beds')}>−</button>
                <button type="button" onClick={() => handleBedAdjustment('totalBeds', 1, 'Total beds')}>+</button>
              </div>
            </div>
            <div className="bed-row">
              <div>
                <p>Occupied</p>
                <strong>{opsState.hospital.beds.occupiedBeds}</strong>
              </div>
              <div className="stepper">
                <button type="button" onClick={() => handleBedAdjustment('occupiedBeds', -1, 'Occupied beds')}>Release</button>
                <button type="button" onClick={() => handleBedAdjustment('occupiedBeds', 1, 'Occupied beds')}>Occupy</button>
              </div>
            </div>
            <div className="bed-row">
              <div>
                <p>ICU Total</p>
                <strong>{opsState.hospital.beds.icuTotal}</strong>
              </div>
              <div className="stepper">
                <button type="button" onClick={() => handleBedAdjustment('icuTotal', -1, 'ICU total')}>−</button>
                <button type="button" onClick={() => handleBedAdjustment('icuTotal', 1, 'ICU total')}>+</button>
              </div>
            </div>
            <div className="bed-row">
              <div>
                <p>ICU Occupied</p>
                <strong>{opsState.hospital.beds.icuOccupied}</strong>
              </div>
              <div className="stepper">
                <button type="button" onClick={() => handleBedAdjustment('icuOccupied', -1, 'ICU occupied')}>Release</button>
                <button type="button" onClick={() => handleBedAdjustment('icuOccupied', 1, 'ICU occupied')}>Occupy</button>
              </div>
            </div>
          </section>

          <section className="timeline-panel" aria-label="Operations timeline">
            <div className="panel-head compact">
              <h3>Ops Timeline</h3>
              <p>Dispatch, triage &amp; capacity events.</p>
            </div>
            <div className="timeline-list">
              {opsState.events.slice(0, 14).map((event) => (
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
        </aside>

      </section>
    </main>
  );
}