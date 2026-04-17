import type { CSSProperties } from 'react';

export interface NavigationPanelProps {
  currentInstruction: string;
  nextInstruction: string;
  distanceToTurn: number;
  maneuverType: string;
  maneuverModifier: string;
  eta: number;
  totalDistanceRemaining: number;
  destinationName: string;
  isSimulating: boolean;
}

function formatDistance(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return '0 m';
  }

  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function formatEta(etaSeconds: number) {
  if (!Number.isFinite(etaSeconds) || etaSeconds <= 0) {
    return '0 min';
  }

  const minutes = Math.max(1, Math.round(etaSeconds / 60));
  return `${minutes} min`;
}

function formatRemaining(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return '0.0 km';
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function maneuverArrow(type: string, modifier: string) {
  const normalized = `${type} ${modifier}`.toLowerCase();

  if (normalized.includes('uturn')) {
    return '↶';
  }

  if (normalized.includes('left')) {
    return '←';
  }

  if (normalized.includes('right')) {
    return '→';
  }

  if (normalized.includes('depart') || normalized.includes('continue') || normalized.includes('straight')) {
    return '↑';
  }

  if (normalized.includes('arrive')) {
    return '◎';
  }

  return '↑';
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: '14px',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(760px, calc(100% - 24px))',
  zIndex: 50,
  borderRadius: '14px',
  border: '1px solid rgba(15, 23, 42, 0.12)',
  background: 'rgba(255, 255, 255, 0.96)',
  boxShadow: '0 16px 30px rgba(15, 23, 42, 0.16)',
  backdropFilter: 'blur(6px)',
  overflow: 'hidden',
  color: '#0f172a',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 14px',
};

const separatorStyle: CSSProperties = {
  borderTop: '1px solid rgba(148, 163, 184, 0.26)',
};

export function NavigationPanel({
  currentInstruction,
  nextInstruction,
  distanceToTurn,
  maneuverType,
  maneuverModifier,
  eta,
  totalDistanceRemaining,
  destinationName,
  isSimulating,
}: NavigationPanelProps) {
  const arrow = maneuverArrow(maneuverType, maneuverModifier);

  return (
    <section style={panelStyle} aria-label="Turn-by-turn navigation panel">
      <div style={rowStyle}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#fee2e2',
            color: '#b91c1c',
            fontSize: '24px',
            fontWeight: 800,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {arrow}
        </div>

        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              lineHeight: 1.25,
              color: '#0f172a',
            }}
          >
            {currentInstruction || 'Continue to destination'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#334155' }}>
            In {formatDistance(distanceToTurn)}
          </p>
        </div>
      </div>

      <div style={separatorStyle}>
        <div style={rowStyle}>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: 700, flexShrink: 0 }}>NEXT ▶</p>
          <p style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>
            {nextInstruction || 'Stay on the current road'} - in {formatDistance(Math.max(distanceToTurn, 0))}
          </p>
        </div>
      </div>

      <div style={separatorStyle}>
        <div style={{ ...rowStyle, justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 14px' }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#14532d' }}>
            🏥 {destinationName}
          </p>
          <p style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>
            ETA: {formatEta(eta)}
          </p>
          <p style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>
            {formatRemaining(totalDistanceRemaining)} left
          </p>
        </div>
      </div>

      {isSimulating ? (
        <div style={{ ...separatorStyle, padding: '8px 14px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>🔄 Demo simulation active</p>
        </div>
      ) : null}
    </section>
  );
}
