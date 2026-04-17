import { useCallback, useEffect, useRef, useState } from 'react';

type LngLat = [number, number];

const DEFAULT_SIMULATION_INTERVAL_MS = 5000;
const DEFAULT_ARRIVAL_METERS = 30;

export interface UseDriverSimulationOptions {
  initialPosition: LngLat | null;
  pingIntervalMs?: number;
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
  pingIntervalMs = DEFAULT_SIMULATION_INTERVAL_MS,
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
    (index: number) => {
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

      emitPositionUpdate(point, safeIndex, arrived);
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

      clearSimulationInterval();
      setHasArrived(false);
      setCurrentIndex(0);
      indexRef.current = 0;

      if (sanitizedRoute.length === 0) {
        setIsSimulating(false);
        setIsMoving(false);
        setDistanceToNextTurn(0);
        setCurrentPosition(initialPositionRef.current);
        return;
      }

      setIsSimulating(true);
      applyIndexPosition(0);

      if (sanitizedRoute.length === 1) {
        stopSimulation();
        setHasArrived(true);
        return;
      }

      intervalRef.current = window.setInterval(() => {
        const nextIndex = indexRef.current + 1;
        indexRef.current = nextIndex;

        if (nextIndex >= routeRef.current.length) {
          applyIndexPosition(routeRef.current.length - 1);
          stopSimulation();
          setHasArrived(true);
          return;
        }

        applyIndexPosition(nextIndex);

        const latestRoute = routeRef.current;
        const latestPoint = latestRoute[nextIndex];
        const destination = latestRoute[latestRoute.length - 1];
        if (latestPoint && destination && distanceMeters(latestPoint, destination) <= arrivalDistanceMeters) {
          setHasArrived(true);
        }
      }, pingIntervalMs);
    },
    [applyIndexPosition, arrivalDistanceMeters, clearSimulationInterval, pingIntervalMs, stopSimulation],
  );

  const resetSimulation = useCallback(() => {
    clearSimulationInterval();
    setIsSimulating(false);
    setHasArrived(false);
    setCurrentIndex(0);
    indexRef.current = 0;

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
