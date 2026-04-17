import { useEffect, useMemo, useRef } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';

import 'leaflet/dist/leaflet.css';

import {
  DriverStatus,
  DriverUnit,
  HospitalUnit,
  PatientRequest,
} from '../types/hospitalOps.types';
import { StatusBadge } from './StatusBadge';
import './MapView.css';

interface MapViewProps {
  hospital: HospitalUnit;
  drivers: DriverUnit[];
  requests: PatientRequest[];
  selectedDriverId: string | null;
  selectedRequestId: string | null;
  onSelectDriver: (driverId: string) => void;
  onSelectRequest: (requestId: string) => void;
  onSuggestClosestDriver?: (requestId: string) => void;
  suggestedDriversByRequest?: Record<string, string>;
}

const driverStatusLabel: Record<DriverStatus, string> = {
  available: 'Available',
  to_patient: 'To Patient',
  with_patient: 'On Scene',
  to_hospital: 'To Hospital',
  offline: 'Offline',
};

function driverStatusColor(status: DriverStatus) {
  if (status === 'available') {
    return '#1d7a4b';
  }

  if (status === 'to_patient') {
    return '#d12d3b';
  }

  if (status === 'with_patient') {
    return '#a76a00';
  }

  if (status === 'to_hospital') {
    return '#1f6db2';
  }

  return '#6f7a88';
}

function requestSeverityColor(severity: PatientRequest['severity']) {
  if (severity === 'critical') {
    return '#c62828';
  }

  if (severity === 'high') {
    return '#e46a00';
  }

  if (severity === 'moderate') {
    return '#1f6db2';
  }

  return '#5e6a7a';
}

function FitToMarkers({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (hasFittedRef.current) {
      return;
    }

    map.fitBounds(bounds, {
      padding: [34, 34],
      maxZoom: 15,
      animate: true,
    });

    hasFittedRef.current = true;
  }, [bounds, map]);

  return null;
}

export function MapView({
  hospital,
  drivers,
  requests,
  selectedDriverId,
  selectedRequestId,
  onSelectDriver,
  onSelectRequest,
  onSuggestClosestDriver,
  suggestedDriversByRequest,
}: MapViewProps) {
  const visibleRequests = useMemo(
    () => requests.filter((request) => request.status !== 'completed' && request.status !== 'cancelled'),
    [requests],
  );

  const requestById = useMemo(
    () => new Map(visibleRequests.map((request) => [request.id, request])),
    [visibleRequests],
  );

  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const points = [
      hospital.location,
      ...drivers.map((driver) => driver.location),
      ...visibleRequests.map((request) => request.location),
    ].map((point) => [point.lat, point.lng] as [number, number]);

    if (points.length === 1) {
      const [lat, lng] = points[0];
      return [
        [lat - 0.005, lng - 0.005],
        [lat + 0.005, lng + 0.005],
      ];
    }

    return points;
  }, [drivers, hospital.location, visibleRequests]);

  const routeSegments = useMemo(() => {
    return drivers
      .filter((driver) => driver.assignment && driver.status !== 'available' && driver.status !== 'offline')
      .map((driver) => {
        const assignment = driver.assignment;
        if (!assignment) {
          return null;
        }

        const linkedRequest = driver.assignment ? requestById.get(driver.assignment.requestId) : undefined;
        if (!linkedRequest) {
          return null;
        }

        const target = driver.status === 'to_hospital' ? hospital.location : linkedRequest.location;

        const routeTail =
          assignment.route && assignment.route.length > 1
            ? assignment.route
                .slice(Math.max(1, Math.min(assignment.route.length - 1, assignment.routeIndex ?? 1)))
                .map((point) => [point.lat, point.lng] as [number, number])
            : [[target.lat, target.lng] as [number, number]];

        const positions: [number, number][] = [[driver.location.lat, driver.location.lng], ...routeTail];

        return {
          id: driver.id,
          positions,
          color: driverStatusColor(driver.status),
          dashArray: driver.status === 'to_hospital' ? undefined : '8 8',
        };
      })
      .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
  }, [drivers, hospital.location, requestById]);

  const initialCenter = useMemo<[number, number]>(
    () => [hospital.location.lat, hospital.location.lng],
    [hospital.location.lat, hospital.location.lng],
  );

  return (
    <div className="map-view">
      <div className="map-canvas" aria-label="Live hospital fleet map" role="region">
        <MapContainer
          center={initialCenter}
          zoom={13}
          className="leaflet-map"
          scrollWheelZoom
          preferCanvas
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitToMarkers bounds={bounds} />

          <CircleMarker
            center={[hospital.location.lat, hospital.location.lng]}
            radius={10}
            pathOptions={{
              color: '#165d9f',
              fillColor: '#7dc1ff',
              fillOpacity: 0.95,
              weight: 2,
            }}
          >
            <Tooltip className="map-tooltip map-tooltip-hospital" direction="top" offset={[0, -7]} permanent>
              Hospital
            </Tooltip>
          </CircleMarker>

          {routeSegments.map((segment) => (
            <Polyline
              key={segment.id}
              positions={segment.positions}
              pathOptions={{
                color: segment.color,
                weight: 3,
                opacity: 0.86,
                dashArray: segment.dashArray,
              }}
            />
          ))}

          {visibleRequests.map((request) => (
            <CircleMarker
              key={request.id}
              center={[request.location.lat, request.location.lng]}
              radius={selectedRequestId === request.id ? 9 : 7}
              pathOptions={{
                color: '#ffffff',
                fillColor: requestSeverityColor(request.severity),
                fillOpacity: 0.94,
                weight: selectedRequestId === request.id ? 3 : 2,
              }}
              eventHandlers={{
                click: () => onSelectRequest(request.id),
              }}
            >
              <Tooltip
                className="map-tooltip map-tooltip-request"
                direction="top"
                offset={[0, -6]}
                permanent={selectedRequestId === request.id}
              >
                {request.id}
              </Tooltip>

              <Popup className="map-popup" autoPanPadding={[18, 18]}>
                <div className="map-popup-card">
                  <p className="map-popup-title">
                    {request.id} · {request.severity.toUpperCase()}
                  </p>
                  <p className="map-popup-sub">
                    {request.patientName} · {request.address}
                  </p>

                  {suggestedDriversByRequest?.[request.id] ? (
                    <p className="map-popup-suggestion">
                      Closest: <strong>{suggestedDriversByRequest[request.id]}</strong>
                    </p>
                  ) : null}

                  <div className="map-popup-actions">
                    <button type="button" onClick={() => onSelectRequest(request.id)}>
                      Select Request
                    </button>
                    {onSuggestClosestDriver ? (
                      <button type="button" onClick={() => onSuggestClosestDriver(request.id)}>
                        Auto Select Closest
                      </button>
                    ) : null}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {drivers.map((driver) => (
            <CircleMarker
              key={driver.id}
              center={[driver.location.lat, driver.location.lng]}
              radius={selectedDriverId === driver.id ? 10 : 8}
              pathOptions={{
                color: '#ffffff',
                fillColor: driverStatusColor(driver.status),
                fillOpacity: driver.status === 'offline' ? 0.55 : 0.93,
                weight: selectedDriverId === driver.id ? 3 : 2,
              }}
              eventHandlers={{
                click: () => onSelectDriver(driver.id),
              }}
            >
              <Tooltip
                className="map-tooltip map-tooltip-driver"
                direction="top"
                offset={[0, -6]}
                permanent={selectedDriverId === driver.id}
              >
                {driver.callSign} - {driverStatusLabel[driver.status]}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        <p className="map-note">
          Mumbai live view with real map tiles and road-aligned ambulance movement on each ping cycle.
        </p>
      </div>

      <div className="map-legend">
        <StatusBadge label="Hospital" tone="info" />
        <StatusBadge label="Request" tone="warning" />
        <StatusBadge label="Available Driver" tone="success" />
        <StatusBadge label="Active Trip" tone="danger" />
        <StatusBadge label="Offline Driver" tone="neutral" />
      </div>
    </div>
  );
}
