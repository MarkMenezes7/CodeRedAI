import {
  DriverUnit,
  GeoPoint,
  HospitalBedState,
  HospitalOpsState,
  OpsEvent,
  OpsEventType,
  PatientRequest,
  SeverityLevel,
} from '../types/hospitalOps.types';

const LAT_KM = 111;
const MAX_EVENTS = 60;

const ROAD_NODES: Array<{ id: string; point: GeoPoint }> = [
  { id: 'karuna_borivali', point: { lat: 19.2412, lng: 72.8530 } },
  { id: 'borivali_station_e', point: { lat: 19.2296, lng: 72.8572 } },
  { id: 'borivali_national_park', point: { lat: 19.2311, lng: 72.8618 } },
  { id: 'dahisar_check_naka', point: { lat: 19.2507, lng: 72.8590 } },
  { id: 'kandivali_station_e', point: { lat: 19.2052, lng: 72.8519 } },
  { id: 'kandivali_thakur_village', point: { lat: 19.2107, lng: 72.8728 } },
  { id: 'goregaon_station_e', point: { lat: 19.1669, lng: 72.8617 } },
  { id: 'andheri_station_e', point: { lat: 19.1197, lng: 72.8477 } },
  { id: 'midc_central', point: { lat: 19.1142, lng: 72.8599 } },
  { id: 'chakala_metro', point: { lat: 19.1092, lng: 72.8745 } },
  { id: 'marol_naka', point: { lat: 19.1126, lng: 72.8868 } },
  { id: 'saki_naka', point: { lat: 19.1039, lng: 72.8865 } },
  { id: 'sahar_road', point: { lat: 19.1075, lng: 72.8640 } },
  { id: 'airport_cargo', point: { lat: 19.1001, lng: 72.8712 } },
  { id: 'jvlr_junction', point: { lat: 19.1183, lng: 72.9052 } },
  { id: 'powai_gate', point: { lat: 19.1176, lng: 72.9077 } },
  { id: 'kurla_west', point: { lat: 19.0901, lng: 72.8794 } },
];

const ROAD_GRAPH: Record<string, string[]> = {
  karuna_borivali: ['borivali_station_e', 'borivali_national_park', 'dahisar_check_naka'],
  borivali_station_e: ['karuna_borivali', 'borivali_national_park', 'kandivali_station_e'],
  borivali_national_park: ['karuna_borivali', 'borivali_station_e', 'kandivali_thakur_village'],
  dahisar_check_naka: ['karuna_borivali'],
  kandivali_station_e: ['borivali_station_e', 'kandivali_thakur_village', 'goregaon_station_e'],
  kandivali_thakur_village: ['borivali_national_park', 'kandivali_station_e', 'goregaon_station_e'],
  goregaon_station_e: ['kandivali_station_e', 'kandivali_thakur_village', 'andheri_station_e'],
  andheri_station_e: ['midc_central', 'chakala_metro', 'goregaon_station_e'],
  midc_central: ['andheri_station_e', 'chakala_metro', 'sahar_road'],
  chakala_metro: ['andheri_station_e', 'midc_central', 'marol_naka', 'sahar_road'],
  marol_naka: ['chakala_metro', 'saki_naka', 'jvlr_junction'],
  saki_naka: ['marol_naka', 'airport_cargo', 'kurla_west'],
  sahar_road: ['chakala_metro', 'midc_central', 'airport_cargo', 'kurla_west'],
  airport_cargo: ['saki_naka', 'sahar_road', 'kurla_west'],
  jvlr_junction: ['marol_naka', 'powai_gate'],
  powai_gate: ['jvlr_junction'],
  kurla_west: ['saki_naka', 'airport_cargo', 'sahar_road'],
};

const roadNodeLookup = new Map(ROAD_NODES.map((node) => [node.id, node.point]));
const osrmRouteCache = new Map<string, GeoPoint[]>();

const incomingNames = ['Sonal G.', 'Amit V.', 'Reena P.', 'Arjun T.', 'Maya K.', 'Ritesh N.', 'Neha S.', 'Karan D.'];

const incomingSymptoms = [
  'Acute chest discomfort with sweating',
  'Breathing difficulty with wheezing',
  'Seizure episode reported by family',
  'High fever with confusion',
  'Fall injury and shoulder trauma',
  'Severe abdominal pain with vomiting',
  'Diabetic dizziness and weakness',
  'Roadside collision with limb injury',
];

const incomingAreas = [
  { label: 'Karuna Hospital Borivali', lat: 19.2412, lng: 72.8530 },
  { label: 'Borivali station east', lat: 19.2296, lng: 72.8572 },
  { label: 'Dahisar check naka', lat: 19.2507, lng: 72.8590 },
  { label: 'Kandivali station east', lat: 19.2052, lng: 72.8519 },
  { label: 'Saki Naka junction', lat: 19.1004, lng: 72.8862 },
  { label: 'Andheri station east', lat: 19.1197, lng: 72.8477 },
  { label: 'Powai lake entry gate', lat: 19.1176, lng: 72.9077 },
  { label: 'Chakala metro exit', lat: 19.1084, lng: 72.8791 },
  { label: 'Marol fire station lane', lat: 19.1112, lng: 72.8878 },
  { label: 'MIDC central road', lat: 19.1141, lng: 72.8599 },
];

const severityWeights: Array<{ severity: SeverityLevel; threshold: number }> = [
  { severity: 'critical', threshold: 0.18 },
  { severity: 'high', threshold: 0.45 },
  { severity: 'moderate', threshold: 0.8 },
  { severity: 'low', threshold: 1 },
];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1));
}

function randomFrom<T>(items: T[]) {
  return items[randomInt(0, items.length - 1)];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function weightedSeverity(): SeverityLevel {
  const sample = Math.random();
  const match = severityWeights.find((bucket) => sample <= bucket.threshold);
  return match ? match.severity : 'moderate';
}

function normalizeBeds(beds: HospitalBedState): HospitalBedState {
  const totalBeds = Math.max(0, Math.round(beds.totalBeds));
  const occupiedBeds = clamp(Math.round(beds.occupiedBeds), 0, totalBeds);
  const icuTotal = clamp(Math.round(beds.icuTotal), 0, totalBeds);
  const icuOccupied = clamp(Math.round(beds.icuOccupied), 0, Math.min(icuTotal, occupiedBeds));

  return {
    totalBeds,
    occupiedBeds,
    icuTotal,
    icuOccupied,
  };
}

function clonePoint(point: GeoPoint): GeoPoint {
  return {
    lat: point.lat,
    lng: point.lng,
  };
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const latDiffKm = (b.lat - a.lat) * LAT_KM;
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const lngDiffKm = (b.lng - a.lng) * LAT_KM * lngScale;
  return Math.sqrt(latDiffKm * latDiffKm + lngDiffKm * lngDiffKm);
}

function nearestRoadNodeId(point: GeoPoint): string {
  let bestNodeId = ROAD_NODES[0].id;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of ROAD_NODES) {
    const candidateDistance = distanceKm(point, node.point);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestNodeId = node.id;
    }
  }

  return bestNodeId;
}

function roadNodesByDistance(origin: GeoPoint) {
  return ROAD_NODES
    .map((node) => ({
      id: node.id,
      point: node.point,
      distanceKm: distanceKm(origin, node.point),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

export function createRoadAnchorAssignments(params: {
  hospitalLocation: GeoPoint;
  count: number;
  closeShare?: number;
}): GeoPoint[] {
  const { hospitalLocation, count, closeShare = 0.25 } = params;
  if (count <= 0) {
    return [];
  }

  const sortedNodes = roadNodesByDistance(hospitalLocation);
  const closeNodes = sortedNodes.filter((node) => node.distanceKm <= 1.1);
  const farNodes = sortedNodes.filter((node) => node.distanceKm > 0.7);

  const fallbackNodes = sortedNodes.slice(0, Math.max(1, Math.min(sortedNodes.length, 6)));
  const closePool = (closeNodes.length > 0 ? closeNodes : fallbackNodes).map((node) => clonePoint(node.point));
  const farPool = (farNodes.length > 0 ? farNodes : sortedNodes).map((node) => clonePoint(node.point));

  const normalizedShare = clamp(closeShare, 0, 1);
  const closeCount = clamp(Math.round(count * normalizedShare), 0, count);

  return Array.from({ length: count }, (_, index) => {
    if (index < closeCount) {
      return clonePoint(closePool[index % closePool.length]);
    }

    const farIndex = index - closeCount;
    return clonePoint(farPool[farIndex % farPool.length]);
  });
}

function shortestRoadNodePath(startNodeId: string, endNodeId: string): string[] {
  if (startNodeId === endNodeId) {
    return [startNodeId];
  }

  const queue = new Set(ROAD_NODES.map((node) => node.id));
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};

  for (const node of ROAD_NODES) {
    distances[node.id] = Number.POSITIVE_INFINITY;
    previous[node.id] = null;
  }

  distances[startNodeId] = 0;

  while (queue.size > 0) {
    let currentNodeId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const candidateNodeId of queue) {
      if (distances[candidateNodeId] < currentDistance) {
        currentDistance = distances[candidateNodeId];
        currentNodeId = candidateNodeId;
      }
    }

    if (!currentNodeId) {
      break;
    }

    queue.delete(currentNodeId);

    if (currentNodeId === endNodeId) {
      break;
    }

    const neighbors = ROAD_GRAPH[currentNodeId] ?? [];
    for (const neighborNodeId of neighbors) {
      if (!queue.has(neighborNodeId)) {
        continue;
      }

      const currentPoint = roadNodeLookup.get(currentNodeId);
      const neighborPoint = roadNodeLookup.get(neighborNodeId);
      if (!currentPoint || !neighborPoint) {
        continue;
      }

      const altDistance = distances[currentNodeId] + distanceKm(currentPoint, neighborPoint);
      if (altDistance < distances[neighborNodeId]) {
        distances[neighborNodeId] = altDistance;
        previous[neighborNodeId] = currentNodeId;
      }
    }
  }

  const path: string[] = [];
  let cursor: string | null = endNodeId;
  while (cursor) {
    path.unshift(cursor);
    cursor = previous[cursor];
  }

  if (path.length === 0 || path[0] !== startNodeId) {
    return [startNodeId, endNodeId];
  }

  return path;
}

export function routeDistanceKm(route: GeoPoint[]): number {
  if (route.length <= 1) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    sum += distanceKm(route[index], route[index + 1]);
  }

  return sum;
}

export function snapPointToRoad(point: GeoPoint): GeoPoint {
  const nodeId = nearestRoadNodeId(point);
  const nodePoint = roadNodeLookup.get(nodeId);

  if (!nodePoint) {
    return clonePoint(point);
  }

  return clonePoint(nodePoint);
}

export function buildRoadRoute(start: GeoPoint, end: GeoPoint): GeoPoint[] {
  const startNodeId = nearestRoadNodeId(start);
  const endNodeId = nearestRoadNodeId(end);
  const nodePathIds = shortestRoadNodePath(startNodeId, endNodeId);

  const route: GeoPoint[] = [clonePoint(start)];
  for (const nodeId of nodePathIds) {
    const nodePoint = roadNodeLookup.get(nodeId);
    if (nodePoint) {
      route.push(clonePoint(nodePoint));
    }
  }
  route.push(clonePoint(end));

  const deduped: GeoPoint[] = [];
  for (const point of route) {
    const last = deduped[deduped.length - 1];
    if (!last || distanceKm(last, point) > 0.025) {
      deduped.push(point);
    }
  }

  return deduped.length > 1 ? deduped : [clonePoint(start), clonePoint(end)];
}

function routeCacheKey(start: GeoPoint, end: GeoPoint) {
  return `${start.lat.toFixed(5)},${start.lng.toFixed(5)}|${end.lat.toFixed(5)},${end.lng.toFixed(5)}`;
}

export async function fetchStrictRoadRouteFromApi(start: GeoPoint, end: GeoPoint): Promise<GeoPoint[] | null> {
  const key = routeCacheKey(start, end);
  const cached = osrmRouteCache.get(key);
  if (cached) {
    return cached.map(clonePoint);
  }

  try {
    const query =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${start.lng},${start.lat};${end.lng},${end.lat}` +
      '?overview=full&geometries=geojson&alternatives=false&steps=false';

    const response = await fetch(query, {
      method: 'GET',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      routes?: Array<{
        geometry?: {
          coordinates?: number[][];
        };
      }>;
    };

    const routeCoordinates = payload.routes?.[0]?.geometry?.coordinates;
    if (!routeCoordinates || routeCoordinates.length < 2) {
      return null;
    }

    const mappedRoute = routeCoordinates
      .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
      .map((coordinate) => ({
        lat: coordinate[1],
        lng: coordinate[0],
      }));

    if (mappedRoute.length < 2) {
      return null;
    }

    osrmRouteCache.set(key, mappedRoute.map(clonePoint));
    return mappedRoute;
  } catch {
    return null;
  }
}

export async function fetchRoadRouteFromApi(start: GeoPoint, end: GeoPoint): Promise<GeoPoint[]> {
  const strictRoute = await fetchStrictRoadRouteFromApi(start, end);
  if (strictRoute && strictRoute.length > 1) {
    return strictRoute;
  }

  return buildRoadRoute(start, end);
}

function moveToward(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  stepKm: number,
): { lat: number; lng: number } {
  const remaining = distanceKm(start, end);
  if (remaining === 0 || stepKm >= remaining) {
    return { lat: end.lat, lng: end.lng };
  }

  const ratio = stepKm / remaining;
  return {
    lat: start.lat + (end.lat - start.lat) * ratio,
    lng: start.lng + (end.lng - start.lng) * ratio,
  };
}

function routeRemainingDistanceKm(current: GeoPoint, route: GeoPoint[], routeIndex: number) {
  if (routeIndex >= route.length) {
    return 0;
  }

  let remaining = distanceKm(current, route[routeIndex]);
  for (let index = routeIndex; index < route.length - 1; index += 1) {
    remaining += distanceKm(route[index], route[index + 1]);
  }

  return remaining;
}

function advanceAlongRoute(current: GeoPoint, route: GeoPoint[], startIndex: number, stepKm: number) {
  let position = clonePoint(current);
  let nextIndex = Math.max(1, Math.min(route.length - 1, startIndex));
  let stepRemaining = stepKm;

  while (stepRemaining > 0 && nextIndex < route.length) {
    const target = route[nextIndex];
    const targetDistance = distanceKm(position, target);

    if (targetDistance <= stepRemaining) {
      position = clonePoint(target);
      stepRemaining -= targetDistance;
      nextIndex += 1;
      continue;
    }

    position = moveToward(position, target, stepRemaining);
    stepRemaining = 0;
  }

  const reached = nextIndex >= route.length;
  const remainingKm = reached ? 0 : routeRemainingDistanceKm(position, route, nextIndex);

  return {
    position,
    routeIndex: nextIndex,
    reached,
    remainingKm,
  };
}

function estimateEtaMinutes(distance: number, speedKmph: number) {
  if (speedKmph <= 0) {
    return undefined;
  }

  const minutes = (distance / speedKmph) * 60;
  return Math.max(1, Math.round(minutes));
}

function createEvent(
  type: OpsEventType,
  message: string,
  requestId?: string,
  driverId?: string,
  at?: string,
): OpsEvent {
  const timestamp = at ?? new Date().toISOString();
  return {
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 100_000)}`,
    at: timestamp,
    type,
    message,
    requestId,
    driverId,
  };
}

function mergeEvents(existingEvents: OpsEvent[], incomingEvents: OpsEvent[]) {
  if (incomingEvents.length === 0) {
    return existingEvents;
  }

  return [...incomingEvents.reverse(), ...existingEvents].slice(0, MAX_EVENTS);
}

function nudgeAvailableDriver(driver: DriverUnit, targetAnchor: GeoPoint) {
  const currentPoint = snapPointToRoad(driver.location);
  const targetPoint = snapPointToRoad(targetAnchor);

  if (distanceKm(currentPoint, targetPoint) <= 0.03) {
    return clonePoint(targetPoint);
  }

  const patrolRoute = buildRoadRoute(currentPoint, targetPoint);
  const movementKm = Math.max(
    0.06,
    (Math.max(driver.speedKmph, 24) * Math.max(driver.pingIntervalSec, 4)) / 3600,
  );

  const progress = advanceAlongRoute(currentPoint, patrolRoute, 1, movementKm);
  if (progress.reached) {
    return clonePoint(targetPoint);
  }

  return progress.position;
}

export function runDriverPingCycle(state: HospitalOpsState, pingSeconds = 5): HospitalOpsState {
  const nowIso = new Date().toISOString();
  const requests = state.requests.map((request) => ({ ...request, location: { ...request.location } }));
  const requestLookup = new Map(requests.map((request) => [request.id, request]));
  const freshEvents: OpsEvent[] = [];

  const idleDrivers = state.drivers
    .filter((driver) => driver.status === 'available' && !driver.occupied && !driver.assignment)
    .sort((left, right) => left.id.localeCompare(right.id));
  const idleAnchors = createRoadAnchorAssignments({
    hospitalLocation: state.hospital.location,
    count: idleDrivers.length,
    closeShare: 0.28,
  });
  const idleAnchorByDriverId = new Map(idleDrivers.map((driver, index) => [driver.id, idleAnchors[index]]));

  const beds = { ...state.hospital.beds };

  const drivers: DriverUnit[] = state.drivers.map((driver): DriverUnit => {
    const progressedSeconds = driver.secondsSincePing + pingSeconds;
    if (progressedSeconds < driver.pingIntervalSec) {
      return {
        ...driver,
        secondsSincePing: progressedSeconds,
      };
    }

    const nextPingInterval = randomInt(4, 10);
    let updatedDriver: DriverUnit = {
      ...driver,
      secondsSincePing: 0,
      pingIntervalSec: nextPingInterval,
      lastPingAt: nowIso,
    };

    if (updatedDriver.status === 'offline') {
      if (Math.random() < 0.04) {
        updatedDriver = {
          ...updatedDriver,
          status: 'available',
          speedKmph: randomInt(34, 46),
          fuelPct: clamp(updatedDriver.fuelPct + randomInt(4, 9), 0, 100),
        };
        freshEvents.push(
          createEvent('system', `${updatedDriver.callSign} is back online and available for dispatch.`, undefined, updatedDriver.id, nowIso),
        );
      }
      return updatedDriver;
    }

    if (updatedDriver.status === 'available') {
      const targetAnchor = idleAnchorByDriverId.get(updatedDriver.id) ?? state.hospital.location;
      updatedDriver = {
        ...updatedDriver,
        location: nudgeAvailableDriver(updatedDriver, targetAnchor),
        occupied: false,
        etaMinutes: undefined,
        speedKmph: clamp(updatedDriver.speedKmph + randomInt(-3, 3), 25, 56),
        fuelPct: clamp(updatedDriver.fuelPct - randomBetween(0.2, 0.6), 0, 100),
      };
      return updatedDriver;
    }

    if (!updatedDriver.assignment) {
      return {
        ...updatedDriver,
        status: 'available',
        occupied: false,
        etaMinutes: undefined,
      };
    }

    const linkedRequest = requestLookup.get(updatedDriver.assignment.requestId);
    if (!linkedRequest || linkedRequest.status === 'cancelled' || linkedRequest.status === 'completed') {
      return {
        ...updatedDriver,
        status: 'available',
        occupied: false,
        etaMinutes: undefined,
        assignment: undefined,
      };
    }

    const movementKm = Math.max(0.05, (Math.max(updatedDriver.speedKmph, 20) * updatedDriver.pingIntervalSec) / 3600);

    const hasValidRoute =
      Array.isArray(updatedDriver.assignment.route) &&
      updatedDriver.assignment.route.length >= 2;

    if (!hasValidRoute) {
      if (linkedRequest.status === 'dispatched') {
        linkedRequest.status = 'triaged';
        linkedRequest.assignedDriverId = undefined;
        linkedRequest.notes = `${linkedRequest.notes ? `${linkedRequest.notes} | ` : ''}Route refresh required. Returned to triaged queue.`;
      }

      freshEvents.push(
        createEvent(
          'system',
          `${updatedDriver.callSign} route data unavailable. Unit returned to available pool.`,
          linkedRequest.id,
          updatedDriver.id,
          nowIso,
        ),
      );

      return {
        ...updatedDriver,
        status: 'available',
        occupied: false,
        assignment: undefined,
        etaMinutes: undefined,
      };
    }

    const activeRoute = updatedDriver.assignment.route!;
    const activeRouteIndex = updatedDriver.assignment.routeIndex ?? 1;

    const routeProgress = advanceAlongRoute(updatedDriver.location, activeRoute, activeRouteIndex, movementKm);

    if (updatedDriver.assignment.stage === 'to_patient') {
      if (routeProgress.reached || routeProgress.remainingKm <= 0.08) {
        const arrivalPoint = activeRoute[activeRoute.length - 1] ?? linkedRequest.location;

        freshEvents.push(
          createEvent(
            'arrival',
            `${updatedDriver.callSign} reached patient for ${linkedRequest.id}. Stabilization in progress.`,
            linkedRequest.id,
            updatedDriver.id,
            nowIso,
          ),
        );

        return {
          ...updatedDriver,
          location: clonePoint(arrivalPoint),
          status: 'with_patient',
          occupied: true,
          etaMinutes: 0,
          assignment: {
            ...updatedDriver.assignment,
            stage: 'with_patient',
            stageTicks: 0,
            route: undefined,
            routeIndex: undefined,
          },
          fuelPct: clamp(updatedDriver.fuelPct - randomBetween(0.4, 0.8), 0, 100),
        };
      }

      return {
        ...updatedDriver,
        location: routeProgress.position,
        etaMinutes: estimateEtaMinutes(routeProgress.remainingKm, updatedDriver.speedKmph),
        occupied: false,
        status: 'to_patient',
        assignment: {
          ...updatedDriver.assignment,
          route: activeRoute,
          routeIndex: routeProgress.routeIndex,
        },
        fuelPct: clamp(updatedDriver.fuelPct - randomBetween(0.4, 0.8), 0, 100),
      };
    }

    if (updatedDriver.assignment.stage === 'with_patient') {
      const stageTicks = updatedDriver.assignment.stageTicks + 1;

      if (stageTicks >= 2) {
        const hospitalRoute =
          updatedDriver.assignment.hospitalRoute && updatedDriver.assignment.hospitalRoute.length > 1
            ? updatedDriver.assignment.hospitalRoute.map(clonePoint)
            : undefined;

        if (!hospitalRoute) {
          if (stageTicks === 2) {
            freshEvents.push(
              createEvent(
                'system',
                `${updatedDriver.callSign} waiting for return route before transport.`,
                linkedRequest.id,
                updatedDriver.id,
                nowIso,
              ),
            );
          }

          return {
            ...updatedDriver,
            assignment: {
              ...updatedDriver.assignment,
              stageTicks,
            },
            status: 'with_patient',
            occupied: true,
            etaMinutes: undefined,
          };
        }

        const hospitalRouteStart = hospitalRoute[0] ?? updatedDriver.location;

        freshEvents.push(
          createEvent(
            'dispatch',
            `${updatedDriver.callSign} started transport to hospital with patient from ${linkedRequest.id}.`,
            linkedRequest.id,
            updatedDriver.id,
            nowIso,
          ),
        );

        return {
          ...updatedDriver,
          location: clonePoint(hospitalRouteStart),
          status: 'to_hospital',
          occupied: true,
          assignment: {
            ...updatedDriver.assignment,
            stage: 'to_hospital',
            stageTicks: 0,
            route: hospitalRoute,
            routeIndex: 1,
            hospitalRoute: hospitalRoute,
          },
          etaMinutes: estimateEtaMinutes(routeDistanceKm(hospitalRoute), updatedDriver.speedKmph),
        };
      }

      return {
        ...updatedDriver,
        assignment: {
          ...updatedDriver.assignment,
          stageTicks,
        },
        status: 'with_patient',
        occupied: true,
      };
    }

    if (routeProgress.reached || routeProgress.remainingKm <= 0.08) {
      linkedRequest.status = 'completed';
      linkedRequest.closedAt = nowIso;
      linkedRequest.notes = `${linkedRequest.notes ? `${linkedRequest.notes} | ` : ''}Patient handed over to ER team.`;

      if (linkedRequest.severity === 'critical') {
        beds.icuOccupied = Math.min(beds.icuTotal, beds.icuOccupied + 1);
      }
      beds.occupiedBeds = Math.min(beds.totalBeds, beds.occupiedBeds + 1);

      freshEvents.push(
        createEvent(
          'handover',
          `${updatedDriver.callSign} completed handover for ${linkedRequest.id} at ${state.hospital.name}.`,
          linkedRequest.id,
          updatedDriver.id,
          nowIso,
        ),
      );

      return {
        ...updatedDriver,
        location: { ...state.hospital.location },
        status: 'available',
        occupied: false,
        assignment: undefined,
        etaMinutes: undefined,
        speedKmph: clamp(updatedDriver.speedKmph - randomInt(2, 6), 24, 56),
        fuelPct: clamp(updatedDriver.fuelPct - randomBetween(0.6, 1.1), 0, 100),
      };
    }

    return {
      ...updatedDriver,
      location: routeProgress.position,
      status: 'to_hospital',
      occupied: true,
      etaMinutes: estimateEtaMinutes(routeProgress.remainingKm, updatedDriver.speedKmph),
      assignment: {
        ...updatedDriver.assignment,
        route: activeRoute,
        routeIndex: routeProgress.routeIndex,
      },
      fuelPct: clamp(updatedDriver.fuelPct - randomBetween(0.6, 1.1), 0, 100),
    };
  });

  if (Math.random() < 0.1 && beds.occupiedBeds > 0) {
    beds.occupiedBeds = Math.max(0, beds.occupiedBeds - 1);
    if (beds.icuOccupied > beds.occupiedBeds) {
      beds.icuOccupied = beds.occupiedBeds;
    }

    freshEvents.push(
      createEvent('capacity', 'One bed marked available after patient transfer/discharge.', undefined, undefined, nowIso),
    );
  }

  return {
    ...state,
    hospital: {
      ...state.hospital,
      beds: normalizeBeds(beds),
    },
    drivers,
    requests,
    events: mergeEvents(state.events, freshEvents),
    lastSimulationAt: nowIso,
  };
}

export function addIncomingPatientRequest(state: HospitalOpsState): HospitalOpsState {
  const severity = weightedSeverity();
  const area = randomFrom(incomingAreas);
  const requestId = `ER-${state.nextRequestNumber}`;
  const nowIso = new Date().toISOString();

  const request: PatientRequest = {
    id: requestId,
    patientName: randomFrom(incomingNames),
    age: randomInt(18, 82),
    severity,
    symptom: randomFrom(incomingSymptoms),
    address: area.label,
    location: {
      lat: area.lat + randomBetween(-0.0023, 0.0023),
      lng: area.lng + randomBetween(-0.0023, 0.0023),
    },
    channel: randomFrom(['whatsapp', 'call-center', 'mobile-app']),
    reportedAt: nowIso,
    status: 'new',
    notes: 'Auto-ingested demo request from patient intake channel.',
  };

  const incomingEvent = createEvent(
    'incoming',
    `New ${severity.toUpperCase()} request ${request.id} received from ${request.channel}.`,
    request.id,
    undefined,
    nowIso,
  );

  return {
    ...state,
    requests: [request, ...state.requests],
    events: mergeEvents(state.events, [incomingEvent]),
    nextRequestNumber: state.nextRequestNumber + 1,
  };
}
