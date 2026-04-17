import { useCallback, useEffect, useRef, useState } from 'react';

type LngLat = [number, number];

const DEFAULT_SIMULATION_INTERVAL_MS = 1000;
const DEFAULT_PING_INTERVAL_MS = 5000;
const DEFAULT_TARGET_LEG_DURATION_SECONDS = 30;
const DEFAULT_ARRIVAL_METERS = 30;

export interface UseDriverSimulationOptions {
  initialPosition: LngLat | null;
  simulationIntervalMs?: number;
  pingIntervalMs?: number;
  speedMultiplier?: number;
  targetLegDurationSeconds?: number;
  arrivalDistanceMeters?: number;
  onPositionUpdate?: (position: {
    lng: number;
    lat: number;
    index: number;
    hasArrived: boolean;
  }) => void | Promise<void>;
}

export interface DriverSimulationControls {
  currentPosition: LngLat | null;
  isSimulating: boolean;
  currentIndex: number;
  currentStepIndex: number;
  distanceToNextTurn: number;
  isMoving: boolean;
  hasArrived: boolean;
  startSimulation: (routeCoordinates: LngLat[]) => void;
  stopSimulation: () => void;
  resetSimulation: () => void;
  bearingDegrees: number;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function distanceMeters(from: LngLat, to: LngLat) {
  const earthRadius = 6371000;
  const dLat = toRadians(to[1] - from[1]);
  const dLng = toRadians(to[0] - from[0]);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1])) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function bearingBetween(from: LngLat, to: LngLat) {
  const fromLat = toRadians(from[1]);
  const toLat = toRadians(to[1]);
  const dLng = toRadians(to[0] - from[0]);

  const y = Math.sin(dLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function sanitizeRoute(routeCoordinates: LngLat[]) {
  const sanitized: LngLat[] = [];

  for (const coordinate of routeCoordinates) {
    if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
      continue;
    }

    const previous = sanitized[sanitized.length - 1];
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) {
      continue;
    }

    sanitized.push(coordinate);
  }

  return sanitized;
}

export function useDriverSimulation({
  initialPosition,
  simulationIntervalMs = DEFAULT_SIMULATION_INTERVAL_MS,
  pingIntervalMs = DEFAULT_PING_INTERVAL_MS,
  speedMultiplier,
  targetLegDurationSeconds = DEFAULT_TARGET_LEG_DURATION_SECONDS,
  arrivalDistanceMeters = DEFAULT_ARRIVAL_METERS,
  onPositionUpdate,
}: UseDriverSimulationOptions): DriverSimulationControls {
  const [currentPosition, setCurrentPosition] = useState<LngLat | null>(initialPosition);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [distanceToNextTurn, setDistanceToNextTurn] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [bearingDegrees, setBearingDegrees] = useState(0);

  const intervalRef = useRef<number | null>(null);
  const routeRef = useRef<LngLat[]>([]);
  const indexRef = useRef(0);
  const stepSizeRef = useRef(1);
  const lastPingAtRef = useRef(0);
  const initialPositionRef = useRef<LngLat | null>(initialPosition);
  const onPositionUpdateRef = useRef(onPositionUpdate);

  useEffect(() => {
    initialPositionRef.current = initialPosition;
  }, [initialPosition]);

  useEffect(() => {
    onPositionUpdateRef.current = onPositionUpdate;
  }, [onPositionUpdate]);

  const clearSimulationInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const emitPositionUpdate = useCallback((position: LngLat, index: number, arrived: boolean) => {
    const callback = onPositionUpdateRef.current;
    if (!callback) {
      return;
    }

    void Promise.resolve(
      callback({
        lng: position[0],
        lat: position[1],
        index,
        hasArrived: arrived,
      }),
    ).catch(() => {
      // Silently retry on the next 5 second cycle.
    });
  }, []);

  const applyIndexPosition = useCallback(
    (index: number, shouldPing = true) => {
      const route = routeRef.current;
      if (route.length === 0) {
        setCurrentPosition(initialPositionRef.current);
        setCurrentIndex(0);
        setDistanceToNextTurn(0);
        setIsMoving(false);
        setHasArrived(false);
        return;
      }

      const safeIndex = Math.min(Math.max(index, 0), route.length - 1);
      const point = route[safeIndex];
      const nextPoint = safeIndex < route.length - 1 ? route[safeIndex + 1] : null;
      const arrived = safeIndex >= route.length - 1;

      setCurrentPosition(point);
      setCurrentIndex(safeIndex);
      setHasArrived(arrived);
      setIsMoving(!arrived);
      setDistanceToNextTurn(nextPoint ? distanceMeters(point, nextPoint) : 0);

      if (nextPoint) {
        setBearingDegrees(bearingBetween(point, nextPoint));
      }

      if (shouldPing) {
        emitPositionUpdate(point, safeIndex, arrived);
      }
    },
    [emitPositionUpdate],
  );

  const stopSimulation = useCallback(() => {
    clearSimulationInterval();
    setIsSimulating(false);
    setIsMoving(false);
  }, [clearSimulationInterval]);

  const startSimulation = useCallback(
    (routeCoordinates: LngLat[]) => {
      const sanitizedRoute = sanitizeRoute(routeCoordinates);
      routeRef.current = sanitizedRoute;

      const tickDurationMs = Math.max(250, simulationIntervalMs);
      const targetTickCount = Math.max(1, Math.floor((targetLegDurationSeconds * 1000) / tickDurationMs));
      const computedStepSize =
        typeof speedMultiplier === 'number' && Number.isFinite(speedMultiplier) && speedMultiplier > 0
          ? Math.max(1, Math.floor(speedMultiplier))
          : Math.max(1, Math.ceil((sanitizedRoute.length - 1) / targetTickCount));

      clearSimulationInterval();
      setHasArrived(false);
      setCurrentIndex(0);
      indexRef.current = 0;
      stepSizeRef.current = computedStepSize;
      lastPingAtRef.current = 0;

      if (sanitizedRoute.length === 0) {
        setIsSimulating(false);
        setIsMoving(false);
        setDistanceToNextTurn(0);
        setCurrentPosition(initialPositionRef.current);
        return;
      }

      setIsSimulating(true);
      lastPingAtRef.current = Date.now();
      applyIndexPosition(0, true);

      if (sanitizedRoute.length === 1) {
        stopSimulation();
        setHasArrived(true);
        return;
      }

      intervalRef.current = window.setInterval(() => {
        const stepSize = Math.max(1, stepSizeRef.current);
        const nextIndex = indexRef.current + stepSize;
        const routeLength = routeRef.current.length;
        const reachedEnd = nextIndex >= routeLength - 1;
        const boundedIndex = reachedEnd ? routeLength - 1 : nextIndex;
        indexRef.current = boundedIndex;

        const now = Date.now();
        const shouldPing = now - lastPingAtRef.current >= pingIntervalMs || reachedEnd;
        if (shouldPing) {
          lastPingAtRef.current = now;
        }

        applyIndexPosition(boundedIndex, shouldPing);

        if (reachedEnd) {
          stopSimulation();
          setHasArrived(true);
          return;
        }

        const latestRoute = routeRef.current;
        const latestPoint = latestRoute[boundedIndex];
        const destination = latestRoute[latestRoute.length - 1];
        if (latestPoint && destination && distanceMeters(latestPoint, destination) <= arrivalDistanceMeters) {
          setHasArrived(true);
        }
      }, tickDurationMs);
    },
    [
      applyIndexPosition,
      arrivalDistanceMeters,
      clearSimulationInterval,
      pingIntervalMs,
      simulationIntervalMs,
      speedMultiplier,
      stopSimulation,
      targetLegDurationSeconds,
    ],
  );

  const resetSimulation = useCallback(() => {
    clearSimulationInterval();
    setIsSimulating(false);
    setHasArrived(false);
    setCurrentIndex(0);
    indexRef.current = 0;
    stepSizeRef.current = 1;
    lastPingAtRef.current = 0;

    const firstRoutePoint = routeRef.current[0] ?? null;
    const resetPosition = initialPositionRef.current ?? firstRoutePoint;
    setCurrentPosition(resetPosition);
    setDistanceToNextTurn(0);
    setIsMoving(false);

    if (resetPosition) {
      emitPositionUpdate(resetPosition, 0, false);
    }
  }, [clearSimulationInterval, emitPositionUpdate]);

  useEffect(() => {
    if (!isSimulating) {
      setCurrentPosition((previous) => previous ?? initialPosition);
    }
  }, [initialPosition, isSimulating]);

  useEffect(
    () => () => {
      clearSimulationInterval();
    },
    [clearSimulationInterval],
  );

  return {
    currentPosition,
    isSimulating,
    currentIndex,
    currentStepIndex: currentIndex,
    distanceToNextTurn,
    isMoving,
    hasArrived,
    startSimulation,
    stopSimulation,
    resetSimulation,
    bearingDegrees,
  };
}
