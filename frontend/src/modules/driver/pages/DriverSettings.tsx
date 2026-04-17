import { useState, useCallback, useMemo } from 'react';
import {
  Camera,
  KeyRound,
  Save,
  User,
  Wifi,
  WifiOff,
  Bell,
  Palette,
  Shield,
  AlertTriangle,
  Radio,
  TrendingUp,

  Activity,
  CheckCircle,
  XCircle,
  Loader,
  Clock,
  Zap,
  Navigation,
} from 'lucide-react';

import { DriverLayout } from '@modules/driver/pages/DriverLayout';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import { DRIVER_MISSIONS } from '../mockDriverData';
import './DriverSettings.css';

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface ToastData {
  id: number;
  message: string;
  type: 'success' | 'error';
  exiting?: boolean;
}

type MapStyleOption = 'Standard' | 'Satellite' | 'Traffic';
type LanguageOption = 'English' | 'Marathi' | 'Hindi';

/* ═══════════════════════════════════════════
   TOGGLE SWITCH COMPONENT
   ═══════════════════════════════════════════ */
interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  icon?: React.ReactNode;
  iconBg?: string;
}

function ToggleSwitch({ label, description, checked, onChange, icon, iconBg }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`toggle-row ${checked ? 'toggle-active' : ''}`}
    >
      <div className="toggle-label-area">
        {icon && (
          <div className="toggle-label-icon" style={{ background: iconBg ?? 'rgba(100,116,139,0.08)' }}>
            {icon}
          </div>
        )}
        <div>
          <div className="toggle-label-text">{label}</div>
          {description && <div className="toggle-label-desc">{description}</div>}
        </div>
      </div>
      <div className={`toggle-track ${checked ? 'track-on' : 'track-off'}`}>
        <div className={`toggle-thumb ${checked ? 'thumb-on' : 'thumb-off'}`} />
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════
   PASSWORD STRENGTH HELPER
   ═══════════════════════════════════════════ */
function getPasswordStrength(pw: string): { level: number; label: string; key: string } {
  if (!pw) return { level: 0, label: '', key: '' };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) return { level: 1, label: 'Weak', key: 'weak' };
  if (score <= 2) return { level: 2, label: 'Fair', key: 'fair' };
  if (score <= 3) return { level: 3, label: 'Good', key: 'good' };
  return { level: 4, label: 'Strong', key: 'strong' };
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export function DriverSettings() {
  const { isDriverAuthenticated, driverUser, logoutDriverUser } = useHospitalAuth();

  // Profile
  const [fullName, setFullName] = useState(driverUser?.name ?? 'Aaditya Driver');
  const [phone, setPhone] = useState(driverUser?.phone ?? '+91 90000 11223');

  // Availability
  const [availabilityOnline, setAvailabilityOnline] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);

  // Notifications
  const [missionAlerts, setMissionAlerts] = useState(true);
  const [dispatchAlerts, setDispatchAlerts] = useState(true);
  const [backupAlerts, setBackupAlerts] = useState(true);
  const [earningsAlerts, setEarningsAlerts] = useState(false);

  // Preferences
  const [darkMode, setDarkMode] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleOption>('Traffic');
  const [language, setLanguage] = useState<LanguageOption>('English');

  // Password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Toast
  const [toasts, setToasts] = useState<ToastData[]>([]);
  let toastCounter = 0;

  // Saving state per section
  const [savingSection, setSavingSection] = useState<string | null>(null);

  // Auth guard
  if (!isDriverAuthenticated || !driverUser) {
    if (typeof window !== 'undefined') {
      window.location.hash = '/auth';
    }
    return null;
  }

  const linkedHospitalName = DRIVER_MISSIONS[0]?.dropHospitalName ?? 'Karuna Hospital';

  const pushToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + ++toastCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 2200);
  }, []);

  const saveSection = useCallback(
    (label: string) => {
      setSavingSection(label);
      setTimeout(() => {
        setSavingSection(null);
        pushToast(`${label} saved successfully.`, 'success');
      }, 800);
    },
    [pushToast],
  );

  const handlePasswordSave = useCallback(() => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      pushToast('Please fill all password fields.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      pushToast('New and confirm passwords do not match.', 'error');
      return;
    }
    if (getPasswordStrength(newPassword).level < 2) {
      pushToast('Password is too weak. Use at least 8 characters with mixed case.', 'error');
      return;
    }

    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    pushToast('Password updated successfully (demo).', 'success');
  }, [currentPassword, newPassword, confirmPassword, pushToast]);

  const pwStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const mapOptions: { value: MapStyleOption; label: string; emoji: string; bg: string }[] = [
    { value: 'Standard', label: 'Standard', emoji: '🗺️', bg: 'rgba(99,102,241,0.08)' },
    { value: 'Satellite', label: 'Satellite', emoji: '🛰️', bg: 'rgba(14,165,233,0.08)' },
    { value: 'Traffic', label: 'Traffic', emoji: '🚦', bg: 'rgba(234,179,8,0.08)' },
  ];

  const langOptions: { value: LanguageOption; label: string; emoji: string }[] = [
    { value: 'English', label: 'English', emoji: '🇬🇧' },
    { value: 'Marathi', label: 'मराठी', emoji: '🇮🇳' },
    { value: 'Hindi', label: 'हिन्दी', emoji: '🇮🇳' },
  ];

  const recentActivity = [
    { text: 'Mission M-2041 completed', time: '2h ago', dotClass: 'dot-green' },
    { text: 'Availability set to online', time: '4h ago', dotClass: 'dot-blue' },
    { text: 'Backup alert acknowledged', time: '1d ago', dotClass: 'dot-yellow' },
  ];

  return (
    <DriverLayout
      missionActive={DRIVER_MISSIONS.some((m) => m.status === 'Ongoing')}
      pickupCount={0}
      onLogout={logoutDriverUser}
    >
      <div className="driver-settings-page">
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', lineHeight: 1.15, fontWeight: 800, color: '#0f172a' }}>
            Driver Settings
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            Manage profile, availability, notifications, and account controls.
          </p>
        </div>

        {/* ── TOASTS ────────────────────────── */}
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`settings-toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''}`}
          >
            <span className="toast-icon">
              {t.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
            </span>
            {t.message}
            <div className="toast-progress" />
          </div>
        ))}

        {/* ══════════════════════════════════════
            PROFILE SECTION
            ══════════════════════════════════════ */}
        <section className="settings-section">
          <div className="section-header-row">
            <div className="section-icon-wrap profile-icon">
              <User size={18} />
            </div>
            <div>
              <h2 className="section-title">Profile</h2>
              <p className="section-subtitle">Personal information & linked hospital</p>
            </div>
          </div>

          <div className="profile-avatar-row">
            <div className="avatar-wrapper">
              <div className="avatar-circle">
                {fullName.slice(0, 2).toUpperCase()}
              </div>
              <div
                className={`avatar-status-dot ${availabilityOnline ? 'online' : 'offline'}`}
              />
            </div>

            <div className="avatar-info">
              <span className="avatar-name">{fullName}</span>
              <span className="avatar-role">
                <span className="role-badge">
                  <Zap size={10} />
                  Active Driver
                </span>
                · {driverUser.callSign ?? 'Alpha-21'}
              </span>
            </div>

            <label className="avatar-upload-btn">
              <Camera size={15} />
              Upload Photo
              <input type="file" accept="image/*" />
            </label>
          </div>

          {/* Quick stats */}
          <div className="profile-stats-row">
            <div className="profile-stat-card">
              <div className="profile-stat-value">142</div>
              <div className="profile-stat-label">Missions</div>
            </div>
            <div className="profile-stat-card">
              <div className="profile-stat-value">98%</div>
              <div className="profile-stat-label">On-Time</div>
            </div>
            <div className="profile-stat-card">
              <div className="profile-stat-value">4.9</div>
              <div className="profile-stat-label">Rating</div>
            </div>
            <div className="profile-stat-card">
              <div className="profile-stat-value">3yr</div>
              <div className="profile-stat-label">Tenure</div>
            </div>
          </div>

          <hr className="section-divider" />

          <div className="fields-grid">
            <label className="field-label">
              Full Name
              <input
                className="field-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <label className="field-label">
              Email
              <input
                className="field-input field-input-readonly"
                value={driverUser.email}
                readOnly
              />
            </label>
            <label className="field-label">
              Phone Number
              <input
                className="field-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="field-label">
              Driver Unit ID
              <input
                className="field-input field-input-readonly"
                value={driverUser.callSign ?? 'Alpha-21'}
                readOnly
              />
            </label>
            <label className="field-label">
              Linked Hospital
              <input
                className="field-input field-input-readonly"
                value={linkedHospitalName}
                readOnly
              />
            </label>
          </div>

          <button
            type="button"
            className={`btn-primary ${savingSection === 'Profile' ? 'btn-saving' : ''}`}
            onClick={() => saveSection('Profile')}
          >
            {savingSection === 'Profile' ? (
              <Loader size={15} className="spin-icon" />
            ) : (
              <Save size={15} />
            )}
            {savingSection === 'Profile' ? 'Saving…' : 'Save Profile'}
          </button>
        </section>

        {/* ══════════════════════════════════════
            AVAILABILITY SECTION
            ══════════════════════════════════════ */}
        <section className="settings-section">
          <div className="section-header-row">
            <div className="section-icon-wrap availability-icon">
              {availabilityOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
            </div>
            <div>
              <h2 className="section-title">Availability</h2>
              <p className="section-subtitle">Control your dispatch readiness</p>
            </div>
          </div>

          <div
            className={`availability-status-bar ${availabilityOnline ? 'status-online' : 'status-offline'}`}
          >
            <span
              className={`status-pulse ${availabilityOnline ? 'pulse-online' : 'pulse-offline'}`}
            />
            {availabilityOnline
              ? 'You are currently online and accepting dispatches.'
              : 'You are offline. You will not receive new missions.'}
          </div>

          <div className="toggle-grid">
            <ToggleSwitch
              label="Available / Online"
              description="Toggle to go online or offline"
              checked={availabilityOnline}
              onChange={setAvailabilityOnline}
              icon={availabilityOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              iconBg={
                availabilityOnline
                  ? 'rgba(22,163,74,0.1)'
                  : 'rgba(148,163,184,0.1)'
              }
            />
            <ToggleSwitch
              label="Accept Critical Cases Only"
              description="Only receive high-priority emergency dispatches"
              checked={criticalOnly}
              onChange={setCriticalOnly}
              icon={<AlertTriangle size={14} />}
              iconBg="rgba(234,179,8,0.1)"
            />
          </div>

          <button
            type="button"
            className={`btn-primary ${savingSection === 'Availability' ? 'btn-saving' : ''}`}
            onClick={() => saveSection('Availability')}
          >
            {savingSection === 'Availability' ? (
              <Loader size={15} className="spin-icon" />
            ) : (
              <Save size={15} />
            )}
            {savingSection === 'Availability' ? 'Saving…' : 'Save Availability'}
          </button>
        </section>

        {/* ══════════════════════════════════════
            NOTIFICATIONS SECTION
            ══════════════════════════════════════ */}
        <section className="settings-section">
          <div className="section-header-row">
            <div className="section-icon-wrap notification-icon">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="section-title">Notifications</h2>
              <p className="section-subtitle">Choose which alerts you want to receive</p>
            </div>
          </div>

          <div className="toggle-grid">
            <ToggleSwitch
              label="Mission Alerts"
              description="Get notified for new mission assignments"
              checked={missionAlerts}
              onChange={setMissionAlerts}
              icon={<Navigation size={14} />}
              iconBg="rgba(215,43,43,0.08)"
            />
            <ToggleSwitch
              label="Hospital Dispatch Notifications"
              description="Alerts when hospitals send dispatch requests"
              checked={dispatchAlerts}
              onChange={setDispatchAlerts}
              icon={<Radio size={14} />}
              iconBg="rgba(99,102,241,0.08)"
            />
            <ToggleSwitch
              label="Backup Request Alerts"
              description="Notifications for backup or coverage requests"
              checked={backupAlerts}
              onChange={setBackupAlerts}
              icon={<Activity size={14} />}
              iconBg="rgba(14,165,233,0.08)"
            />
            <ToggleSwitch
              label="Earnings Updates"
              description="Periodic updates on your earnings and payouts"
              checked={earningsAlerts}
              onChange={setEarningsAlerts}
              icon={<TrendingUp size={14} />}
              iconBg="rgba(22,163,74,0.08)"
            />
          </div>

          <button
            type="button"
            className={`btn-primary ${savingSection === 'Notifications' ? 'btn-saving' : ''}`}
            onClick={() => saveSection('Notifications')}
          >
            {savingSection === 'Notifications' ? (
              <Loader size={15} className="spin-icon" />
            ) : (
              <Save size={15} />
            )}
            {savingSection === 'Notifications' ? 'Saving…' : 'Save Notifications'}
          </button>
        </section>

        {/* ══════════════════════════════════════
            APP PREFERENCES SECTION
            ══════════════════════════════════════ */}
        <section className="settings-section">
          <div className="section-header-row">
            <div className="section-icon-wrap preferences-icon">
              <Palette size={18} />
            </div>
            <div>
              <h2 className="section-title">App Preferences</h2>
              <p className="section-subtitle">Customize appearance, map, and language</p>
            </div>
          </div>

          <ToggleSwitch
            label="Dark Mode"
            description="Switch to a dark color scheme"
            checked={darkMode}
            onChange={setDarkMode}
            icon={<Palette size={14} />}
            iconBg="rgba(99,102,241,0.08)"
          />

          <hr className="section-divider" />

          {/* Map Style Visual Picker */}
          <label className="field-label" style={{ marginBottom: '-4px' }}>
            Map Style
          </label>
          <div className="map-style-grid">
            {mapOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`map-style-card ${mapStyle === opt.value ? 'map-active' : ''}`}
                onClick={() => setMapStyle(opt.value)}
              >
                <div className="map-icon" style={{ background: opt.bg }}>
                  {opt.emoji}
                </div>
                <span className="map-label">{opt.label}</span>
              </button>
            ))}
          </div>

          <hr className="section-divider" />

          {/* Language Visual Picker */}
          <label className="field-label" style={{ marginBottom: '-4px' }}>
            Language
          </label>
          <div className="language-grid">
            {langOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`language-card ${language === opt.value ? 'lang-active' : ''}`}
                onClick={() => setLanguage(opt.value)}
              >
                <div className="lang-emoji">{opt.emoji}</div>
                <div className="lang-name">{opt.label}</div>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`btn-primary ${savingSection === 'Preferences' ? 'btn-saving' : ''}`}
            onClick={() => saveSection('Preferences')}
          >
            {savingSection === 'Preferences' ? (
              <Loader size={15} className="spin-icon" />
            ) : (
              <Save size={15} />
            )}
            {savingSection === 'Preferences' ? 'Saving…' : 'Save Preferences'}
          </button>
        </section>

        {/* ══════════════════════════════════════
            ACCOUNT & SECURITY SECTION
            ══════════════════════════════════════ */}
        <section className="settings-section">
          <div className="section-header-row">
            <div className="section-icon-wrap security-icon">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="section-title">Account & Security</h2>
              <p className="section-subtitle">Password and session controls</p>
            </div>
          </div>

          {/* Recent Activity */}
          <label className="field-label" style={{ marginBottom: '-4px' }}>
            Recent Activity
          </label>
          <div className="recent-activity">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="activity-item">
                <span className={`activity-dot ${item.dotClass}`} />
                <span className="activity-text">{item.text}</span>
                <span className="activity-time">
                  <Clock size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                  {item.time}
                </span>
              </div>
            ))}
          </div>

          <hr className="section-divider" />

          <div className="btn-group">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowPasswordModal(true)}
            >
              <KeyRound size={15} /> Change Password
            </button>
          </div>
        </section>

        {/* ══════════════════════════════════════
            PASSWORD MODAL
            ══════════════════════════════════════ */}
        {showPasswordModal && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPasswordModal(false);
            }}
          >
            <div className="modal-card">
              <div className="modal-header">
                <div className="modal-header-icon">
                  <KeyRound size={18} />
                </div>
                <h3 className="modal-title">Change Password</h3>
              </div>

              <label className="field-label">
                Current Password
                <input
                  type="password"
                  className="field-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </label>

              <label className="field-label">
                New Password
                <input
                  type="password"
                  className="field-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </label>

              {/* Password Strength Meter */}
              {newPassword && (
                <>
                  <div className="password-strength">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`strength-bar ${
                          i <= pwStrength.level ? `strength-${pwStrength.key}` : ''
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`strength-text text-${pwStrength.key}`}>
                    {pwStrength.label}
                  </span>
                </>
              )}

              <label className="field-label">
                Confirm Password
                <input
                  type="password"
                  className="field-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </label>

              {confirmPassword && newPassword && confirmPassword !== newPassword && (
                <span style={{ fontSize: '0.76rem', color: '#ef4444', fontWeight: 600 }}>
                  Passwords do not match
                </span>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handlePasswordSave}
                >
                  <KeyRound size={14} /> Update Password
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DriverLayout>
  );
}