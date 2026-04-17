import os

output_file = 'd:/Maxwell/Projects/CodeRedAI/frontend/src/modules/driver/pages/LiveMission.tsx'

content = """import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crosshair, Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX, PhoneCall, CheckCircle } from 'lucide-react';
import Map, { Layer, Marker, NavigationControl, Source, type LayerProps, type MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

import { NavigationPanel } from '@/components/driver/NavigationPanel';
import { useDriverSimulation } from '@/hooks/useDriverSimulation';
import { useVoiceNavigation } from '@/hooks/useVoiceNavigation';
import { useDriverDispatch } from '@/hooks/useDriverDispatch';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import { pingDriverLocation } from '@shared/utils/driverOpsApi';
import { DriverAuthPage } from './DriverAuthPage';
import { DriverLayout } from './DriverLayout';

type ActiveLeg = 'to_pickup' | 'to_hospital' | 'arrived';

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
  bannerInstructions: { distanceAlongGeometry: number; primary: { text: string; type: string; modifier?: string }; secondary?: { text: string } }[];
}

interface NavigationRoute {
  coordinates: [number, number][];
  steps: RouteStep[];
  etaSeconds: number;
  remainingDistanceMeters: number;
  loadedAt: number;
  leg: Exclude<ActiveLeg, 'arrived'>;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const TURN_ANNOUNCE_200_METERS = 200;
const TURN_ANNOUNCE_50_METERS = 50;
const ARRIVAL_METERS = 30;
const REROUTE_METERS = 50;

const routeLineLayer: LayerProps = {
  id: 'live-mission-route-main',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#ef4444', 'line-width': 5, 'line-opacity': 0.96 },
};

function toRadians(value: number) { return (value * Math.PI) / 180; }
function distanceMeters(from: [number, number], to: [number, number]) {
  const earthRadius = 6371000;
  const dLat = toRadians(to[1] - from[1]);
  const dLng = toRadians(to[0] - from[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1])) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildDirectionsUrl(origin: [number, number], dest: [number, number], token: string) {
  const search = new URLSearchParams({
    steps: 'true',
    voice_instructions: 'true',
    banner_instructions: 'true',
    voice_units: 'metric',
    geometries: 'geojson',
    overview: 'full',
    access_token: token,
  });
  return `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?${search.toString()}`;
}

async function fetchDirectionsRoute(origin: [number, number], dest: [number, number], leg: ActiveLeg, token: string, signal: AbortSignal): Promise<NavigationRoute> {
  const response = await fetch(buildDirectionsUrl(origin, dest, token), { signal });
  if (!response.ok) throw new Error('Mapbox request failed');
  const payload = await response.json();
  const route = payload.routes?.[0];
  if (!route?.geometry?.coordinates || route.geometry.coordinates.length < 2) throw new Error('Route unavailable');
  
  const steps = (route.legs?.[0]?.steps || []).map((step: any) => ({
    instruction: step.maneuver?.instruction || step.bannerInstructions?.[0]?.primary?.text || 'Continue',
    distance: step.distance || 0,
    duration: step.duration || 0,
    maneuver: {
      type: step.maneuver?.type || 'continue',
      modifier: step.maneuver?.modifier,
      instruction: step.maneuver?.instruction || 'Continue',
      location: step.maneuver?.location,
    },
    voiceInstructions: step.voiceInstructions || [],
    bannerInstructions: step.bannerInstructions || [],
  }));

  return {
    coordinates: route.geometry.coordinates,
    steps,
    etaSeconds: Math.round(route.duration || 0),
    remainingDistanceMeters: route.distance || 0,
    loadedAt: Date.now(),
    leg: leg as any,
  };
}

function emptyState(message: string) {
  return (
    <section style={{ border: '1px solid #e2e8f0', background: '#ffffff', borderRadius: '14px', padding: '24px', color: '#1e293b' }}>
      <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Live Mission</h2>
      <p style={{ margin: '8px 0 0', color: '#475569' }}>{message}</p>
    </section>
  );
}

export function LiveMission() {
  const { isDriverAuthenticated, driverUser, logoutDriverUser } = useHospitalAuth();
  const driverId = driverUser?.email;
  const { pendingOffers, activeMission, isLoading, acceptOffer, rejectOffer, updateStatus } = useDriverDispatch(driverId);

  const [routeData, setRouteData] = useState<NavigationRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [navStepIndex, setNavStepIndex] = useState(0);

  const mapRef = useRef<MapRef | null>(null);
  const announced200Ref = useRef<Set<number>>(new Set());
  const announced50Ref = useRef<Set<number>>(new Set());
  const pickupArrivalAnnouncedRef = useRef(false);
  const hospitalArrivalAnnouncedRef = useRef(false);

  const { speak, voiceEnabled, setVoiceEnabled, supportsSpeech } = useVoiceNavigation();

  const isMissionActive = Boolean(activeMission && activeMission.status !== 'COMPLETED');
  
  // Maps API status values to internal activeLeg
  const activeLeg = useMemo<ActiveLeg>(() => {
    if (!activeMission) return 'arrived';
    if (activeMission.status === 'DRIVER_ASSIGNED' || activeMission.status === 'EN_ROUTE_PATIENT') return 'to_pickup';
    if (activeMission.status === 'PATIENT_PICKED' || activeMission.status === 'HOSPITAL_ASSIGNED' || activeMission.status === 'EN_ROUTE_HOSPITAL') return 'to_hospital';
    return 'arrived';
  }, [activeMission]);

  const pickupPosition = activeMission?.patient_lng && activeMission?.patient_lat ? [activeMission.patient_lng, activeMission.patient_lat] as [number, number] : null;
  const hospitalPosition = activeMission?.hospital_lng && activeMission?.hospital_lat ? [activeMission.hospital_lng, activeMission.hospital_lat] as [number, number] : null;
  
  const destinationPosition = activeLeg === 'to_pickup' ? pickupPosition : hospitalPosition;

  // Simple initial position fallback for demo
  const initialDriverPosition = useMemo<[number, number]>(() => {
     if (activeMission && pickupPosition) {
         // place driver 1km away naturally for demo navigation
         return [pickupPosition[0] - 0.01, pickupPosition[1] - 0.01];
     }
     return [72.8777, 19.076];
  }, [activeMission, pickupPosition]);

  const handlePingLocation = useCallback(({ lng, lat }: { lng: number, lat: number }) => {
     if (driverId) {
         pingDriverLocation({ driver_id: driverId, lng, lat, speed_kmph: 30 }).catch(() => {});
     }
  }, [driverId]);

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
    simulationIntervalMs: 1000,
    pingIntervalMs: 5000,
    targetLegDurationSeconds: 30,
    onPositionUpdate: handlePingLocation,
  });

  const effectiveDriverPosition = currentPosition ?? initialDriverPosition;

  useEffect(() => {
    if (!activeMission || !effectiveDriverPosition || !destinationPosition || !MAPBOX_TOKEN) return;
    if (activeLeg === 'arrived') return;

    const controller = new AbortController();
    setIsLoadingRoute(true);
    setRouteError(null);

    fetchDirectionsRoute(effectiveDriverPosition, destinationPosition, activeLeg, MAPBOX_TOKEN, controller.signal)
      .then(route => {
        setRouteData(route);
        setNavStepIndex(0);
        announced200Ref.current.clear();
        announced50Ref.current.clear();
      })
      .catch(err => setRouteError("Route unavailable. " + err.message))
      .finally(() => setIsLoadingRoute(false));

    return () => controller.abort();
  }, [activeLeg, activeMission, destinationPosition]); // Intentionally not dependent on full location updates to avoid refetching

  useEffect(() => {
      if (routeData && activeLeg !== 'arrived') {
          startSimulation(routeData.coordinates);
      }
  }, [routeData, activeLeg]);

  const distanceToDestination = effectiveDriverPosition && destinationPosition ? distanceMeters(effectiveDriverPosition, destinationPosition) : Infinity;

  // --- Voice Announcer Logic ---
  const currentStep = routeData?.steps[Math.min(navStepIndex, routeData.steps.length - 1)];
  const maneuverDistanceMeters = currentStep?.maneuver.location && effectiveDriverPosition ? distanceMeters(effectiveDriverPosition, currentStep.maneuver.location) : distanceToNextTurn;

  useEffect(() => {
      if (!currentStep) return;
      if (maneuverDistanceMeters <= 50 && navStepIndex < routeData!.steps.length - 1) {
          setNavStepIndex(n => n + 1);
      }
  }, [maneuverDistanceMeters, currentStep]);

  useEffect(() => {
      if (!currentStep) return;
      const voice = currentStep.voiceInstructions[0]?.announcement || currentStep.instruction;
      if (maneuverDistanceMeters <= 200 && maneuverDistanceMeters > 50 && !announced200Ref.current.has(navStepIndex)) {
          speak(`In 200 meters, ${voice}`, true);
          announced200Ref.current.add(navStepIndex);
      }
      if (maneuverDistanceMeters <= 50 && !announced50Ref.current.has(navStepIndex)) {
          speak(voice, true);
          announced50Ref.current.add(navStepIndex);
      }
  }, [navStepIndex, maneuverDistanceMeters]);

  useEffect(() => {
      if (activeLeg === 'to_pickup' && distanceToDestination < 30 && !pickupArrivalAnnouncedRef.current) {
          pickupArrivalAnnouncedRef.current = true;
          stopSimulation();
          speak('Arrived at pickup location. Please confirm patient pickup.', true);
      }
      if (activeLeg === 'to_hospital' && distanceToDestination < 30 && !hospitalArrivalAnnouncedRef.current) {
          hospitalArrivalAnnouncedRef.current = true;
          stopSimulation();
          speak('Arrived at hospital. Mission complete.', true);
      }
  }, [activeLeg, distanceToDestination]);

  const fitRouteOverview = useCallback(() => {
    if (!mapRef.current || !routeData || routeData.coordinates.length === 0) return;
    const bounds = routeData.coordinates.reduce((b, c) => [
        [Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],
        [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])]
    ], [[routeData.coordinates[0][0], routeData.coordinates[0][1]], [routeData.coordinates[0][0], routeData.coordinates[0][1]]]);
    mapRef.current.fitBounds(bounds as any, { padding: 50, duration: 800 });
  }, [routeData]);

  if (!isDriverAuthenticated || !driverUser) return <DriverAuthPage />;

  return (
    <DriverLayout missionActive={isMissionActive} pickupCount={pendingOffers.length} onLogout={logoutDriverUser}>
      
      {/* 🔴 INCOMING OFFER MODAL */}
      {pendingOffers.length > 0 && !activeMission && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.92)', display: 'grid', placeItems: 'center', padding: '20px' }}>
              <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '440px', padding: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '2px solid #ef4444' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                      <div style={{ background: '#fef2f2', color: '#ef4444', padding: '12px', borderRadius: '50%' }}><PhoneCall size={28} /></div>
                      <div>
                          <h2 style={{ fontSize: '22px', margin: 0, fontWeight: 800, color: '#0f172a' }}>EMERGENCY DISPATCH</h2>
                          <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#ef4444' }}>Respond immediately</p>
                      </div>
                  </div>
                  
                  {pendingOffers.map(offer => (
                      <div key={offer.offer_id} style={{ marginBottom: '24px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '18px', color: '#1e293b' }}>{offer.emergency_type.toUpperCase().replace('_', ' ')} • {offer.severity.toUpperCase()}</p>
                          <p style={{ margin: '4px 0', color: '#475569', fontSize: '15px' }}>📍 {offer.patient_address}</p>
                          <p style={{ margin: '4px 0', color: '#475569', fontSize: '15px' }}>📞 {offer.patient_phone}</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '20px' }}>
                              <button onClick={() => acceptOffer(offer.emergency_id, offer.offer_id)} style={{ background: '#16a34a', color: 'white', padding: '14px', borderRadius: '12px', border: 'none', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>ACCEPT</button>
                              <button onClick={() => rejectOffer(offer.emergency_id, offer.offer_id)} style={{ background: '#e2e8f0', color: '#475569', padding: '14px', borderRadius: '12px', border: 'none', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>REJECT</button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* 🗺 MAIN DASHBOARD */}
      <main style={{ padding: '16px', display: 'grid', gap: '12px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '14px 16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#64748b' }}>LIVE MISSION</p>
            <h1 style={{ margin: '4px 0 0', fontSize: '22px', color: '#0f172a' }}>{activeMission?.emergency_id ?? 'Waiting for dispatch'}</h1>
            <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '14px' }}>Status: {activeMission?.status ?? 'Idle'}</p>
          </div>
          <div style={{ display: 'grid', justifyItems: 'end', gap: '6px' }}>
            <span style={{ background: '#fff1f2', color: '#9f1239', padding: '6px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 700, border: '1px solid #fecaca' }}>🚑 Production Connected</span>
          </div>
        </header>

        {routeError && <section style={{ background: '#fff1f2', color: '#991b1b', padding: '10px 12px', borderRadius: '12px', border: '1px solid #fecaca', display: 'flex', gap: '8px', alignItems: 'center' }}><AlertTriangle size={16} /> {routeError}</section>}

        {!activeMission && pendingOffers.length === 0 ? (
           <div style={{ padding: '20px' }}>{emptyState('Standing by. Connected to standard CodeRed dispatch center.')}</div>
        ) : !MAPBOX_TOKEN ? (
            <div style={{ padding: '20px' }}>{emptyState('Mapbox token is missing. Please configure VITE_MAPBOX_ACCESS_TOKEN.')}</div>
        ) : (
        <section style={{ position: 'relative', minHeight: '70vh', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <Map
            ref={mapRef}
            initialViewState={{ longitude: initialDriverPosition[0], latitude: initialDriverPosition[1], zoom: 14, pitch: 45 }}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle="mapbox://styles/mapbox/navigation-day-v1"
            attributionControl={false}
          >
            <NavigationControl position="top-right" />
            
            {routeData && <Source type="geojson" data={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeData.coordinates }, properties: {} }}><Layer {...routeLineLayer} /></Source>}

            {effectiveDriverPosition && (
              <Marker longitude={effectiveDriverPosition[0]} latitude={effectiveDriverPosition[1]} anchor="center">
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#ef4444', border: '2px solid white', transform: `rotate(${bearingDegrees}deg)`, boxShadow: '0 8px 18px rgba(0,0,0,0.3)', display: 'grid', placeItems: 'center' }}>
                  <div style={{ width: '8px', height: '8px', background: 'white', borderRadius: '50%' }} />
                </div>
              </Marker>
            )}

            {pickupPosition && activeLeg === 'to_pickup' && (
              <Marker longitude={pickupPosition[0]} latitude={pickupPosition[1]} anchor="bottom">
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f97316', border: '2px solid white' }} />
              </Marker>
            )}

            {hospitalPosition && (
              <Marker longitude={hospitalPosition[0]} latitude={hospitalPosition[1]} anchor="bottom">
                 <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#16a34a', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 'bold' }}>+</div>
              </Marker>
            )}
          </Map>

          <NavigationPanel
            currentInstruction={currentStep?.instruction || 'Proceed to destination'}
            nextInstruction="Follow route"
            distanceToTurn={maneuverDistanceMeters}
            maneuverType={currentStep?.maneuver.type || 'straight'}
            maneuverModifier={currentStep?.maneuver.modifier || 'straight'}
            eta={routeData?.etaSeconds || 0}
            totalDistanceRemaining={routeData?.remainingDistanceMeters || 0}
            destinationName={activeLeg === 'to_pickup' ? (activeMission?.patient_address || 'Patient') : (activeMission?.assigned_hospital_name || 'Hospital')}
            isSimulating={isSimulating}
          />
          
          <div style={{ position: 'absolute', right: '14px', bottom: '14px', zIndex: 45, display: 'grid', gap: '8px' }}>
              <button onClick={fitRouteOverview} style={{ background: '#111827', color: 'white', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}><Maximize2 size={18} /></button>
          </div>

          <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', gap: '12px' }}>
             {activeMission?.status === 'DRIVER_ASSIGNED' && (
                 <button onClick={() => updateStatus(activeMission.emergency_id, 'EN_ROUTE_PATIENT')} style={{ background: '#2563eb', color: 'white', padding: '14px 24px', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '15px', cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(37,99,235,0.4)' }}>
                    Start Navigation
                 </button>
             )}
             {(activeMission?.status === 'EN_ROUTE_PATIENT' || activeMission?.status === 'DRIVER_ASSIGNED') && distanceToDestination <= 50 && (
                 <button onClick={() => updateStatus(activeMission.emergency_id, 'PATIENT_PICKED')} style={{ background: '#dc2626', color: 'white', padding: '14px 24px', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '15px', cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(220,38,38,0.4)' }}>
                    <CheckCircle size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} /> Mark Patient Picked Up
                 </button>
             )}
             {activeMission?.status === 'PATIENT_PICKED' && (
                 <button onClick={() => updateStatus(activeMission.emergency_id, 'EN_ROUTE_HOSPITAL')} style={{ background: '#16a34a', color: 'white', padding: '14px 24px', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '15px', cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(22,163,74,0.4)' }}>
                    Proceed to {activeMission.assigned_hospital_name || 'Hospital'}
                 </button>
             )}
             {(activeMission?.status === 'EN_ROUTE_HOSPITAL' || activeMission?.status === 'PATIENT_PICKED' || activeMission?.status === 'HOSPITAL_ASSIGNED') && activeLeg === 'to_hospital' && distanceToDestination <= 50 && (
                 <button onClick={() => updateStatus(activeMission.emergency_id, 'COMPLETED')} style={{ background: '#1e293b', color: 'white', padding: '14px 24px', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '15px', cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(30,41,59,0.4)' }}>
                    <CheckCircle size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} /> Complete Mission
                 </button>
             )}
          </div>

        </section>
        )}
      </main>
    </DriverLayout>
  );
}
"""

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Successfully wrote {output_file}")
