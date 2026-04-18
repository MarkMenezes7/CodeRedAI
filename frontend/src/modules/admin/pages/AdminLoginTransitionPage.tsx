import { useEffect, useRef, useState } from 'react';
import { Shield, Eye, Zap, Activity, CheckCircle, ArrowRight } from 'lucide-react';

import { readStoredAdminSession } from '@/utils/redirectByRole';
import './AdminLoginTransitionPage.css';

const TRANSITION_DELAY_MS = 5000;

const STATUS_PILLS = [
  'Security Verified',
  'Audit Log Active',
  'Operations Synced',
  'System Optimal'
];

const TICKER_MESSAGES = [
  'QUANTUM ENCRYPTION ENABLED',
  'ALL NODES REPORTING',
  'THREAT LEVEL: NOMINAL',
  '42 USERS ONLINE',
  'DATABASE INTEGRITY 100%',
  'SURVEILLANCE GRID ACTIVE',
  'ACCESS LOGGED • SECURE',
];

export function AdminLoginTransitionPage() {
  const session = readStoredAdminSession();
  const adminName = session?.user?.name?.trim() || 'Admin Team';
  const adminRole = session?.user?.role || 'OPERATIONS';

  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(TRANSITION_DELAY_MS / 1000));
  const [isSkipping, setIsSkipping] = useState(false);

  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const goToDashboard = () => {
    setIsSkipping(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    setTimeout(() => {
      window.location.hash = '/admin-dashboard';
    }, 180);
  };

  useEffect(() => {
    timerRef.current = window.setTimeout(goToDashboard, TRANSITION_DELAY_MS);

    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) window.clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
  }, []);

  const doubledTicker = [...TICKER_MESSAGES, ...TICKER_MESSAGES];

  return (
    <main className="admin-transition-page" aria-label="Admin login transition">
      <div className="admin-transition-bg" />
      <div className="admin-transition-grid" />
      <div className="admin-transition-matrix" />
      <div className="admin-transition-glow" />

      {/* Floating Security Nodes */}
      <div className="admin-node" style={{ top: '18%', left: '12%', animationDuration: '18s' }} />
      <div className="admin-node" style={{ top: '65%', left: '18%', animationDuration: '14s' }} />
      <div className="admin-node" style={{ top: '28%', left: '78%', animationDuration: '22s' }} />

      <section className="admin-transition-card">
        {/* Logo */}
        <div className="admin-logo-container">
          <div className="admin-logo">
            <Shield size={42} strokeWidth={1.8} />
            <div className="admin-logo-ring" />
            <div className="admin-logo-ring2" />
            <div className="admin-status-dot" />
          </div>
        </div>

        <p className="admin-transition-tag">
          <Activity size={14} /> OPERATIONS CONTROL HUB
        </p>

        <h1>
          Welcome, <span>{adminName}</span>
        </h1>

        <p className="admin-transition-name">
          {adminRole} • LEVEL 5 CLEARANCE
        </p>

        {/* Stats Row */}
        <div className="admin-stats-row">
          <div className="admin-stat">
            <div className="admin-stat-value">99.98</div>
            <div className="admin-stat-label">Uptime</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">ZERO</div>
            <div className="admin-stat-label">Incidents</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">∞</div>
            <div className="admin-stat-label">Nodes</div>
          </div>
        </div>

        {/* Status Pills */}
        <div className="admin-transition-pill-row" aria-hidden="true">
          {STATUS_PILLS.map((pill, i) => (
            <span
              key={pill}
              className="admin-transition-pill"
              style={{ animationDelay: `${0.6 + i * 0.1}s` }}
            >
              <CheckCircle size={14} />
              {pill}
            </span>
          ))}
        </div>

        {/* Progress */}
        <div className="admin-progress-container">
          <div className="admin-progress-bar">
            <div className="admin-progress-fill" />
          </div>
          <p className="admin-transition-counter">
            Initializing secure dashboard • {secondsLeft}s
          </p>
        </div>

        <button
          type="button"
          className="admin-skip-btn"
          onClick={goToDashboard}
          disabled={isSkipping}
        >
          ENTER COMMAND CENTER
          <ArrowRight size={18} />
        </button>
      </section>

      {/* Bottom Ticker */}
      <div className="admin-ticker">
        <div className="admin-ticker-content">
          {doubledTicker.map((msg, idx) => (
            <span key={idx}>
              ● {msg}
              {idx < doubledTicker.length - 1 && <span style={{ marginLeft: '42px', opacity: 0.3 }}>◆</span>}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}