import { useEffect, useRef, useState } from 'react';

import { useHospitalAuth } from '@shared/providers/AuthContext';
import './DriverLoginTransitionPage.css';

const TRANSITION_DELAY_MS = 5000;

/* ─── SVG Icon Components ─────────────────── */
function NavigationIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}

function AmbulanceIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 10H6" />
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14" />
      <path d="M8 8v4" />
      <path d="M9 18h6" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

function ArrowRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/* ─── Static data ─────────────────────────── */
const LANE_DASHES = Array.from({ length: 16 });

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  left: `${8 + (i * 94) % 84}%`,
  bottom: `${10 + (i * 47) % 50}%`,
  size: 2 + (i % 3),
  dur: `${4 + (i % 4)}s`,
  delay: `${(i * 0.35) % 3.5}s`,
}));

const SPEED_LINES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  top: `${5 + (i * 91) % 88}%`,
  left: `${(i * 67) % 40}%`,
  width: `${60 + (i * 37) % 140}px`,
  dur: `${1.5 + (i % 3) * 0.6}s`,
  delay: `${(i * 0.28) % 2.5}s`,
}));

const STATS = [
  { value: '0.3s', valueClass: 'sv-blue', label: 'Dispatch' },
  { value: '99%', valueClass: 'sv-green', label: 'On-Time' },
  { value: '24/7', valueClass: 'sv-amber', label: 'Coverage' },
];

const PILLS = [
  { dot: 'dt-dot-blue', label: 'Navigation Live' },
  { dot: 'dt-dot-green', label: 'Fleet Online' },
  { dot: 'dt-dot-amber', label: 'Missions Ready' },
  { dot: 'dt-dot-red', label: 'Emergency Active' },
];

const TICKER_ITEMS = [
  'Fleet Operations Online',
  'GPS Tracking Active',
  'Dispatch System Ready',
  'Route Optimization Live',
  'Mission Queue Synced',
  'Driver Network Secured',
  'Ambulance Units Live',
  'Command Bridge Linked',
];

const HUD_LABELS = [
  { cls: 'dt-hud-label-tl', text: 'GPS Lock' },
  { cls: 'dt-hud-label-tr', text: 'Fleet · 12' },
  { cls: 'dt-hud-label-bl', text: 'Dispatch' },
  { cls: 'dt-hud-label-br', text: 'Secure' },
];

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export function DriverLoginTransitionPage() {
  const { driverUser } = useHospitalAuth();
  const driverName = driverUser?.name?.trim() || 'Driver Team';
  const callSign = driverUser?.callSign ?? 'Alpha-01';

  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(TRANSITION_DELAY_MS / 1000),
  );

  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const goToDashboard = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    window.location.hash = '/driver/dashboard';
  };

  useEffect(() => {
    timerRef.current = window.setTimeout(goToDashboard, TRANSITION_DELAY_MS);

    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current !== null)
            window.clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    };
  }, []);

  /* Doubled ticker items for seamless loop */
  const tickerAll = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <main
      className="driver-transition-page"
      aria-label="Driver login transition"
    >
      {/* ── Background ── */}
      <div className="driver-transition-bg" />
      <div className="driver-transition-dot-grid" />

      {/* ── Ambient orbs ── */}
      <div className="driver-transition-orb driver-transition-orb-1" />
      <div className="driver-transition-orb driver-transition-orb-2" />
      <div className="driver-transition-orb driver-transition-orb-3" />

      {/* ── Speed lines ── */}
      <div className="driver-transition-speedlines" aria-hidden="true">
        {SPEED_LINES.map((sl) => (
          <div
            key={sl.id}
            className="dt-speedline"
            style={{
              top: sl.top,
              left: sl.left,
              width: sl.width,
              '--sl-dur': sl.dur,
              '--sl-delay': sl.delay,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* ── Road / perspective ── */}
      <div className="driver-transition-road" aria-hidden="true">
        <div className="driver-transition-road-perspective" />
        <div className="driver-transition-road-edge driver-transition-road-edge-left" />
        <div className="driver-transition-road-edge driver-transition-road-edge-right" />
        <div className="driver-transition-lane">
          <div className="driver-transition-lane-inner">
            {LANE_DASHES.map((_, i) => (
              <div key={i} className="dt-lane-dash" />
            ))}
          </div>
        </div>
      </div>

      {/* ── Particles ── */}
      <div className="driver-transition-particles" aria-hidden="true">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="dt-particle"
            style={{
              left: p.left,
              bottom: p.bottom,
              width: `${p.size}px`,
              height: `${p.size}px`,
              '--dur': p.dur,
              '--delay': p.delay,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* ── Scan line ── */}
      <div className="driver-transition-scanline" aria-hidden="true" />

      {/* ── Headlights ── */}
      <div className="driver-transition-headlights" aria-hidden="true">
        <div className="dt-beam dt-beam-left" />
        <div className="dt-beam dt-beam-right" />
      </div>

      {/* ── Vehicle silhouette ── */}
      <div className="driver-transition-vehicle" aria-hidden="true">
        <AmbulanceIcon size={64} />
      </div>

      {/* ── HUD viewport corners ── */}
      <div className="driver-transition-hud" aria-hidden="true">
        <div className="dt-hud-corner dt-hud-tl" />
        <div className="dt-hud-corner dt-hud-tr" />
        <div className="dt-hud-corner dt-hud-bl" />
        <div className="dt-hud-corner dt-hud-br" />
        {HUD_LABELS.map((l) => (
          <span key={l.cls} className={`dt-hud-label ${l.cls}`}>
            {l.text}
          </span>
        ))}
      </div>

      {/* ══════════════════════════════════════
          MAIN CARD
          ══════════════════════════════════════ */}
      <section className="driver-transition-card">
        {/* Corner accents */}
        <div className="dt-corner dt-corner-tl" aria-hidden="true" />
        <div className="dt-corner dt-corner-tr" aria-hidden="true" />
        <div className="dt-corner dt-corner-bl" aria-hidden="true" />
        <div className="dt-corner dt-corner-br" aria-hidden="true" />

        {/* Logo */}
        <div className="driver-transition-logo-wrap" aria-hidden="true">
          <div className="driver-transition-logo">
            <NavigationIcon size={34} />
          </div>
          <div className="driver-transition-logo-ring" />
          <div className="driver-transition-logo-ring-outer" />
          <div className="driver-transition-logo-status" />
        </div>

        {/* Tag */}
        <p className="driver-transition-tag">
          <span className="dt-tag-dot" />
          Emergency Fleet Operations
        </p>

        {/* Heading */}
        <h1>
          Ready For Your{' '}
          <span className="dt-heading-highlight">Mission</span>
        </h1>

        {/* Driver name */}
        <p className="driver-transition-name">{driverName}</p>

        {/* Call sign badge */}
        <div className="driver-transition-callsign">
          <span className="dt-callsign-label">Unit ID</span>
          <span className="dt-callsign-value">{callSign}</span>
        </div>

        {/* Stats */}
        <div
          className="driver-transition-stats"
          aria-label="Performance statistics"
        >
          {STATS.map((s) => (
            <div key={s.label} className="dt-stat">
              <span className={`dt-stat-value ${s.valueClass}`}>
                {s.value}
              </span>
              <span className="dt-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Feature pills */}
        <div
          className="driver-transition-pills"
          aria-label="System status"
        >
          {PILLS.map((p) => (
            <span key={p.label} className="dt-pill">
              <span className={`dt-pill-dot ${p.dot}`} />
              {p.label}
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="driver-transition-progress-wrap">
          <div className="driver-transition-progress-header">
            <span className="driver-transition-progress-label">
              <span className="dt-progress-dot" />
              Initializing Dashboard
            </span>
            <span className="driver-transition-countdown">
              {secondsLeft}s
            </span>
          </div>
          <div
            className="driver-transition-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Dashboard loading progress"
          >
            <div className="driver-transition-progress-fill" />
          </div>
        </div>

        {/* Skip button */}
        <button
          type="button"
          className="driver-transition-skip"
          onClick={goToDashboard}
        >
          Enter Dashboard Now
          <span className="dt-skip-arrow">
            <ArrowRightIcon size={14} />
          </span>
        </button>
      </section>

      {/* ── Bottom ticker ── */}
      <div className="driver-transition-ticker" aria-hidden="true">
        <div className="driver-transition-ticker-inner">
          {tickerAll.map((item, idx) => (
            <span key={idx} className="dt-ticker-item">
              <span className="dt-ticker-dot" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}