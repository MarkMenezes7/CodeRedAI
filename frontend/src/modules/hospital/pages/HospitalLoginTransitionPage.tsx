import { useEffect, useRef, useState } from 'react';

import { useHospitalAuth } from '@shared/providers/AuthContext';
import './HospitalLoginTransitionPage.css';

const TRANSITION_DELAY_MS = 5000;

/* ─── Inline SVG icons ───────────────────────── */
function HeartPulseIcon({ size = 36 }: { size?: number }) {
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
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </svg>
  );
}

/* ─── Particle data ──────────────────────────── */
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${5 + (i * 97) % 90}%`,
  bottom: `${(i * 37) % 35}%`,
  size: 2 + (i % 3),
  duration: `${5 + (i % 5)}s`,
  delay: `${(i * 0.4) % 4}s`,
}));

/* ─── Ticker items ───────────────────────────── */
const TICKER_ITEMS = [
  'Emergency Response Active',
  'Dispatch System Online',
  'All Units Operational',
  'Patient Intake Ready',
  'Live Monitoring Enabled',
  'Command Center Secured',
  'Driver Coordination Live',
  'Hospital Network Synced',
];

/* ─── Pill definitions ───────────────────────── */
const PILLS = [
  { dot: 'ht-pill-dot-green', label: 'Dispatch Active' },
  { dot: 'ht-pill-dot-red', label: 'Emergency Ready' },
  { dot: 'ht-pill-dot-blue', label: 'Monitoring Live' },
  { dot: 'ht-pill-dot-amber', label: 'Intake Open' },
];

/* ─── Stat definitions ───────────────────────── */
const STATS = [
  { value: '24/7', valueClass: 'stat-green', label: 'Uptime' },
  { value: '< 30s', valueClass: 'stat-red', label: 'Response' },
  { value: '99%', valueClass: 'stat-blue', label: 'Accuracy' },
];

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export function HospitalLoginTransitionPage() {
  const { hospitalUser } = useHospitalAuth();
  const hospitalName = hospitalUser?.name?.trim() || 'Hospital Team';

  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(TRANSITION_DELAY_MS / 1000),
  );

  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  /* Navigation */
  const goToDashboard = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    window.location.hash = '/hospital-dashboard';
  };

  useEffect(() => {
    timerRef.current = window.setTimeout(goToDashboard, TRANSITION_DELAY_MS);

    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
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

  /* ECG path – flat with spike */
  const ecgPath =
    'M0 14 L30 14 L38 14 L42 2 L46 26 L50 14 L56 14 L60 8 L64 14 L300 14';

  /* Doubled ticker items for seamless loop */
  const tickerAll = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <main
      className="hospital-transition-page"
      aria-label="Hospital login transition"
    >
      {/* ── Background layers ── */}
      <div className="hospital-transition-bg" />
      <div className="hospital-transition-grid" />
      <div className="hospital-transition-glow-center" />

      <div className="hospital-transition-orb hospital-transition-orb-1" />
      <div className="hospital-transition-orb hospital-transition-orb-2" />
      <div className="hospital-transition-orb hospital-transition-orb-3" />
      <div className="hospital-transition-orb hospital-transition-orb-4" />

      {/* ── Expanding rings ── */}
      <div className="hospital-transition-rings" aria-hidden="true">
        <div className="ht-ring ht-ring-1" />
        <div className="ht-ring ht-ring-2" />
        <div className="ht-ring ht-ring-3" />
        <div className="ht-ring ht-ring-4" />
      </div>

      {/* ── Particles ── */}
      <div className="hospital-transition-particles" aria-hidden="true">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="ht-particle"
            style={{
              left: p.left,
              bottom: p.bottom,
              width: `${p.size}px`,
              height: `${p.size}px`,
              '--duration': p.duration,
              '--delay': p.delay,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* ── Scan line ── */}
      <div className="hospital-transition-scanline" aria-hidden="true" />

      {/* ── ECG top decoration ── */}
      <div className="hospital-transition-ecg" aria-hidden="true">
        <svg viewBox="0 0 300 28" preserveAspectRatio="none">
          <path className="ecg-path" d={ecgPath} />
        </svg>
      </div>

      {/* ══════════════════════════════════════
          MAIN CARD
          ══════════════════════════════════════ */}
      <section className="hospital-transition-card">
        {/* Animated corner accents */}
        <div className="ht-corner ht-corner-tl" aria-hidden="true" />
        <div className="ht-corner ht-corner-tr" aria-hidden="true" />
        <div className="ht-corner ht-corner-bl" aria-hidden="true" />
        <div className="ht-corner ht-corner-br" aria-hidden="true" />

        {/* Logo */}
        <div className="hospital-transition-logo-wrap" aria-hidden="true">
          <div className="hospital-transition-logo">
            <HeartPulseIcon size={36} />
          </div>
          <div className="hospital-transition-logo-ring" />
          <div className="hospital-transition-logo-status" />
        </div>

        {/* Tag */}
        <p className="hospital-transition-tag">
          <span className="tag-dot" />
          Hospital Command Center
        </p>

        {/* Heading */}
        <h1>
          Welcome To Our{' '}
          <span className="heading-highlight">Mission</span>
        </h1>

        {/* Hospital name */}
        <p className="hospital-transition-name">{hospitalName}</p>

        {/* Stats */}
        <div className="hospital-transition-stats" aria-label="System statistics">
          {STATS.map((stat) => (
            <div key={stat.label} className="ht-stat">
              <span className={`ht-stat-value ${stat.valueClass}`}>
                {stat.value}
              </span>
              <span className="ht-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Feature pills */}
        <div
          className="hospital-transition-pills"
          aria-label="Active system features"
        >
          {PILLS.map((pill) => (
            <span key={pill.label} className="ht-pill">
              <span className={`ht-pill-dot ${pill.dot}`} />
              {pill.label}
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="hospital-transition-progress-wrap">
          <div className="hospital-transition-progress-header">
            <span className="hospital-transition-progress-label">
              <span className="progress-label-dot" />
              Loading Dashboard
            </span>
            <span className="hospital-transition-countdown">
              {secondsLeft}s remaining
            </span>
          </div>
          <div
            className="hospital-transition-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Dashboard loading progress"
          >
            <div className="hospital-transition-progress-fill" />
          </div>
        </div>

        {/* Skip button */}
        <button
          type="button"
          className="hospital-transition-skip"
          onClick={goToDashboard}
        >
          Enter Dashboard Now →
        </button>
      </section>

      {/* ── Bottom ticker ── */}
      <div
        className="hospital-transition-ticker"
        aria-hidden="true"
      >
        <div className="hospital-transition-ticker-inner">
          {tickerAll.map((item, idx) => (
            <span key={idx} className="ht-ticker-item">
              <span className="ticker-dot" />
              {item}
              {idx < tickerAll.length - 1 && (
                <span className="ht-ticker-sep">·</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}