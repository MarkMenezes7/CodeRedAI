// MyMissions.tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  Filter,
  IndianRupee,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';

import { StatusBadge } from '@shared/components/StatusBadge';
import { DriverAuthPage } from '@modules/driver/pages/DriverAuthPage';
import { DriverLayout } from '@modules/driver/pages/DriverLayout';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import { DRIVER_MISSIONS, type DriverMissionRecord } from '../mockDriverData';

import './MyMissions.css';

/* ─── Constants ─────────────────────────────────────────────── */
const STATUS_OPTIONS = ['All', 'Completed', 'Ongoing', 'Cancelled'] as const;
const PRIORITY_OPTIONS = ['All', 'Critical', 'High', 'Medium', 'Low'] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const SORT_FIELDS = [
  'createdAt',
  'missionId',
  'earningsInr',
  'distanceKm',
  'durationMin',
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number];
type PriorityFilter = (typeof PRIORITY_OPTIONS)[number];
type SortField = (typeof SORT_FIELDS)[number];
type SortDir = 'asc' | 'desc';

/* ─── Helpers ───────────────────────────────────────────────── */
function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isAfterStart(iso: string, start: string) {
  return !start || iso.slice(0, 10) >= start;
}

function isBeforeEnd(iso: string, end: string) {
  return !end || iso.slice(0, 10) <= end;
}

function exportCsv(missions: DriverMissionRecord[]) {
  const headers = [
    'Mission ID',
    'Date',
    'Patient ID',
    'Age',
    'Gender',
    'Chief Complaint',
    'Pickup',
    'Drop Hospital',
    'Distance (km)',
    'Duration (min)',
    'Status',
    'Priority',
    'Earnings (₹)',
  ];
  const rows = missions.map((m) => [
    m.missionId,
    formatDateTime(m.createdAt),
    m.patientId,
    m.patientAge,
    m.patientGender,
    m.chiefComplaint,
    m.pickupLocation,
    `${m.dropHospitalName}, ${m.dropHospitalAddress}`,
    m.distanceKm.toFixed(1),
    m.durationMin,
    m.status,
    m.priority,
    m.earningsInr,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my-missions-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '10px',
        justifyItems: 'center',
        textAlign: 'center',
        maxWidth: '560px',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          background: '#fee2e2',
          color: '#d72b2b',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={24} />
      </div>
      <h3 style={{ margin: 0, color: '#111827', fontSize: '18px' }}>{title}</h3>
      <p style={{ margin: 0, color: '#6b7280', fontSize: '14px', lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}

function MissionDetailModal({
  mission,
  onClose,
}: {
  mission: DriverMissionRecord | null;
  onClose: () => void;
}) {
  if (!mission) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: '16px',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: '14px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 18px 46px rgba(2, 6, 23, 0.24)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#111827', fontSize: '20px' }}>{mission.missionId}</h3>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '13px' }}>{formatDateTime(mission.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mission details"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: '#6b7280',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <StatusBadge label={mission.status} />
          <StatusBadge label={mission.priority} />
          <StatusBadge label={mission.payoutStatus} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '10px',
          }}
        >
          <div>
            <strong>Patient</strong>
            <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
              {mission.patientId} - {mission.patientAge}Y {mission.patientGender}
            </p>
          </div>
          <div>
            <strong>Complaint</strong>
            <p style={{ margin: '4px 0 0', color: '#4b5563' }}>{mission.chiefComplaint}</p>
          </div>
          <div>
            <strong>Pickup</strong>
            <p style={{ margin: '4px 0 0', color: '#4b5563' }}>{mission.pickupLocation}</p>
          </div>
          <div>
            <strong>Hospital</strong>
            <p style={{ margin: '4px 0 0', color: '#4b5563' }}>{mission.dropHospitalName}</p>
          </div>
          <div>
            <strong>Distance / Duration</strong>
            <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
              {mission.distanceKm.toFixed(1)} km / {mission.durationMin} min
            </p>
          </div>
          <div>
            <strong>Earnings</strong>
            <p style={{ margin: '4px 0 0', color: '#059669', fontWeight: 700 }}>
              ₹{mission.earningsInr.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div>
          <strong>Dispatcher Notes</strong>
          <p style={{ margin: '6px 0 0', color: '#4b5563', lineHeight: 1.5 }}>{mission.dispatcherNotes}</p>
        </div>

        <div>
          <strong>Timeline</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#374151', display: 'grid', gap: '4px' }}>
            {mission.timeline.map((entry) => (
              <li key={`${mission.missionId}-${entry.label}-${entry.at}`}>
                {entry.label}: {entry.at}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */
function StatPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="mm-stat-pill" style={{ '--pill-color': color } as React.CSSProperties}>
      <div className="mm-stat-pill-icon">
        <Icon size={16} />
      </div>
      <div className="mm-stat-pill-body">
        <span className="mm-stat-pill-value">{value}</span>
        <span className="mm-stat-pill-label">{label}</span>
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  field: SortField;
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      className={`mm-sort-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      title={`Sort by ${label}`}
    >
      <ArrowUpDown size={13} />
      {label}
      {active && (
        <span className="mm-sort-indicator">{dir === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    Critical: '#dc2626',
    High: '#ea580c',
    Medium: '#d97706',
    Low: '#16a34a',
  };
  return (
    <span
      className="mm-priority-dot"
      style={{ background: colorMap[priority] ?? '#9ca3af' }}
      title={priority}
    />
  );
}

function MissionRow({
  mission,
  index,
  isSelected,
  onClick,
}: {
  mission: DriverMissionRecord;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      className={`mm-table-row ${isSelected ? 'selected' : ''}`}
      style={{ '--row-delay': `${index * 30}ms` } as React.CSSProperties}
      onClick={onClick}
    >
      <td className="mm-td mm-td-mission-id">
        <span className="mm-mission-badge">{mission.missionId}</span>
      </td>
      <td className="mm-td">
        <div className="mm-date-cell">
          <span className="mm-date-primary">
            {new Date(mission.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
          <span className="mm-date-secondary">
            {new Date(mission.createdAt).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </td>
      <td className="mm-td">
        <div className="mm-patient-cell">
          <div className="mm-patient-avatar">
            {mission.patientGender === 'Male' ? '♂' : '♀'}
          </div>
          <div className="mm-patient-info">
            <span className="mm-patient-id">{mission.patientId}</span>
            <span className="mm-patient-meta">
              {mission.patientAge}Y · {mission.patientGender}
            </span>
          </div>
        </div>
      </td>
      <td className="mm-td">
        <span className="mm-complaint-chip">{mission.chiefComplaint}</span>
      </td>
      <td className="mm-td">
        <div className="mm-location-cell">
          <MapPin size={13} className="mm-location-icon pickup" />
          <span className="mm-location-text">{mission.pickupLocation}</span>
        </div>
      </td>
      <td className="mm-td">
        <div className="mm-location-cell">
          <MapPin size={13} className="mm-location-icon drop" />
          <span className="mm-location-text">
            {mission.dropHospitalName}
            <span className="mm-location-sub">
              {mission.dropHospitalAddress}
            </span>
          </span>
        </div>
      </td>
      <td className="mm-td mm-td-center">
        <span className="mm-distance-chip">{mission.distanceKm.toFixed(1)} km</span>
      </td>
      <td className="mm-td mm-td-center">
        <span className="mm-duration-chip">
          <Clock size={11} /> {mission.durationMin} min
        </span>
      </td>
      <td className="mm-td">
        <StatusBadge label={mission.status} />
      </td>
      <td className="mm-td">
        <div className="mm-priority-cell">
          <PriorityDot priority={mission.priority} />
          <StatusBadge label={mission.priority} />
        </div>
      </td>
      <td className="mm-td mm-td-earnings">
        ₹{mission.earningsInr.toLocaleString('en-IN')}
      </td>
    </tr>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export function MyMissions() {
  const { isDriverAuthenticated, driverUser, logoutDriverUser } = useHospitalAuth();

  /* filter state */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('All');
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  /* sort state */
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* pagination */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);

  /* selection & modal */
  const [selectedMission, setSelectedMission] = useState<DriverMissionRecord | null>(null);

  /* misc */
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  if (!isDriverAuthenticated || !driverUser) return <DriverAuthPage />;

  /* ── Derived data ── */
  const allMissions = DRIVER_MISSIONS;
  const completedCount = allMissions.filter((m) => m.status === 'Completed').length;
  const ongoingCount = allMissions.filter((m) => m.status === 'Ongoing').length;
  const cancelledCount = allMissions.filter((m) => m.status === 'Cancelled').length;
  const totalEarnings = allMissions
    .filter((m) => m.status === 'Completed')
    .reduce((s, m) => s + m.earningsInr, 0);

  const filteredMissions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const sorted = [...allMissions]
      .filter((m) => {
        if (statusFilter !== 'All' && m.status !== statusFilter) return false;
        if (priorityFilter !== 'All' && m.priority !== priorityFilter) return false;
        if (!isAfterStart(m.createdAt, startDate)) return false;
        if (!isBeforeEnd(m.createdAt, endDate)) return false;
        if (!q) return true;
        return (
          m.missionId.toLowerCase().includes(q) ||
          m.patientId.toLowerCase().includes(q) ||
          m.chiefComplaint.toLowerCase().includes(q) ||
          m.pickupLocation.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let av: number | string = a[sortField] as number | string;
        let bv: number | string = b[sortField] as number | string;
        if (sortField === 'createdAt') {
          av = Date.parse(a.createdAt);
          bv = Date.parse(b.createdAt);
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    return sorted;
  }, [allMissions, endDate, priorityFilter, searchText, sortDir, sortField, startDate, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMissions.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filteredMissions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const hasActiveFilters =
    statusFilter !== 'All' ||
    priorityFilter !== 'All' ||
    searchText.trim() !== '' ||
    startDate !== '' ||
    endDate !== '';

  /* ── Handlers ── */
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
      setPage(1);
    },
    [sortField]
  );

  const resetFilters = useCallback(() => {
    setStatusFilter('All');
    setPriorityFilter('All');
    setSearchText('');
    setStartDate('');
    setEndDate('');
    setPage(1);
    searchRef.current?.focus();
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  }, []);

  const handleStatusQuickFilter = (status: StatusFilter) => {
    setStatusFilter(status);
    setPage(1);
  };

  return (
    <DriverLayout
      missionActive={allMissions.some((m) => m.status === 'Ongoing')}
      pickupCount={0}
      onLogout={logoutDriverUser}
    >
      <div className="mm-page">

        {/* ── Page Header ── */}
        <div className="mm-page-header">
          <div className="mm-header-left">
            <div className="mm-header-icon">
              <ClipboardList size={26} />
            </div>
            <div>
              <h1 className="mm-page-title">My Missions</h1>
              <p className="mm-page-subtitle">
                Track all current and past missions with full dispatch and handover details.
              </p>
            </div>
          </div>
          <div className="mm-header-actions">
            <button
              className={`mm-icon-btn ${isRefreshing ? 'spinning' : ''}`}
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="mm-action-btn"
              onClick={() => exportCsv(filteredMissions)}
              title="Export CSV"
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* ── Summary Stats ── */}
        <div className="mm-stats-row">
          <StatPill
            icon={ClipboardList}
            label="Total"
            value={allMissions.length}
            color="#6366f1"
          />
          <StatPill
            icon={CheckCircle2}
            label="Completed"
            value={completedCount}
            color="#10b981"
          />
          <StatPill
            icon={Loader2}
            label="Ongoing"
            value={ongoingCount}
            color="#f59e0b"
          />
          <StatPill
            icon={XCircle}
            label="Cancelled"
            value={cancelledCount}
            color="#ef4444"
          />
          <StatPill
            icon={IndianRupee}
            label="Earned"
            value={`₹${totalEarnings.toLocaleString('en-IN')}`}
            color="#059669"
          />
        </div>

        {/* ── Quick Status Tabs ── */}
        <div className="mm-quick-tabs">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              className={`mm-quick-tab ${statusFilter === s ? 'active' : ''}`}
              onClick={() => handleStatusQuickFilter(s)}
            >
              {s}
              <span className="mm-tab-count">
                {s === 'All'
                  ? allMissions.length
                  : allMissions.filter((m) => m.status === s).length}
              </span>
            </button>
          ))}
        </div>

        {/* ── Filter Panel ── */}
        <div className="mm-filter-card">
          {/* Primary row */}
          <div className="mm-filter-primary">
            <div className="mm-search-wrap">
              <Search size={16} className="mm-search-icon" />
              <input
                ref={searchRef}
                className="mm-search-input"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                placeholder="Search mission ID, patient, complaint, location…"
              />
              {searchText && (
                <button
                  className="mm-search-clear"
                  onClick={() => {
                    setSearchText('');
                    searchRef.current?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <button
              className={`mm-advanced-toggle ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <SlidersHorizontal size={16} />
              Filters
              {hasActiveFilters && <span className="mm-filter-dot" />}
            </button>

            {hasActiveFilters && (
              <button className="mm-reset-btn" onClick={resetFilters}>
                <X size={14} />
                Clear all
              </button>
            )}
          </div>

          {/* Advanced row */}
          <div className={`mm-filter-advanced ${showAdvanced ? 'open' : ''}`}>
            <div className="mm-filter-advanced-inner">
              <label className="mm-filter-label">
                <Filter size={13} />
                Priority
                <select
                  className="mm-select"
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value as PriorityFilter);
                    setPage(1);
                  }}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mm-filter-label">
                <Calendar size={13} />
                Start Date
                <input
                  type="date"
                  className="mm-date-input"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                />
              </label>

              <label className="mm-filter-label">
                <Calendar size={13} />
                End Date
                <input
                  type="date"
                  className="mm-date-input"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                />
              </label>

              <label className="mm-filter-label">
                <ArrowUpDown size={13} />
                Sort by
                <select
                  className="mm-select"
                  value={`${sortField}:${sortDir}`}
                  onChange={(e) => {
                    const [f, d] = e.target.value.split(':');
                    setSortField(f as SortField);
                    setSortDir(d as SortDir);
                    setPage(1);
                  }}
                >
                  <option value="createdAt:desc">Date (Newest)</option>
                  <option value="createdAt:asc">Date (Oldest)</option>
                  <option value="earningsInr:desc">Earnings (High)</option>
                  <option value="earningsInr:asc">Earnings (Low)</option>
                  <option value="distanceKm:desc">Distance (Long)</option>
                  <option value="distanceKm:asc">Distance (Short)</option>
                  <option value="durationMin:desc">Duration (Long)</option>
                </select>
              </label>

              <label className="mm-filter-label">
                Rows per page
                <select
                  className="mm-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) as typeof pageSize);
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* ── Sort Quick-Access Chips ── */}
        <div className="mm-sort-chips">
          <span className="mm-sort-label">Sort:</span>
          {(
            [
              ['createdAt', 'Date'],
              ['earningsInr', 'Earnings'],
              ['distanceKm', 'Distance'],
              ['durationMin', 'Duration'],
            ] as [SortField, string][]
          ).map(([f, label]) => (
            <SortButton
              key={f}
              field={f}
              label={label}
              active={sortField === f}
              dir={sortDir}
              onClick={() => handleSort(f)}
            />
          ))}
        </div>

        {/* ── Results count ── */}
        <div className="mm-results-bar">
          <span className="mm-results-count">
            {filteredMissions.length === 0
              ? 'No results'
              : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filteredMissions.length)} of ${filteredMissions.length} missions`}
          </span>
          {hasActiveFilters && (
            <span className="mm-results-filtered">
              <AlertCircle size={13} /> Filtered view
            </span>
          )}
        </div>

        {/* ── Table / Empty ── */}
        <section className="mm-table-section">
          {filteredMissions.length === 0 ? (
            <div className="mm-empty-wrap">
              <EmptyState
                icon={ClipboardList}
                title="No missions match these filters"
                description="Try adjusting status, priority, or date range to view mission records."
              />
              {hasActiveFilters && (
                <button className="mm-reset-btn-large" onClick={resetFilters}>
                  <RefreshCw size={15} />
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div className="mm-table-container">
              <table className="mm-table">
                <thead>
                  <tr className="mm-thead-row">
                    {[
                      'Mission ID',
                      'Date & Time',
                      'Patient',
                      'Chief Complaint',
                      'Pickup',
                      'Drop Location',
                      'Distance',
                      'Duration',
                      'Status',
                      'Priority',
                      'Earnings',
                    ].map((h) => (
                      <th key={h} className="mm-th">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((mission, idx) => (
                    <MissionRow
                      key={mission.missionId}
                      mission={mission}
                      index={idx}
                      isSelected={selectedMission?.missionId === mission.missionId}
                      onClick={() => setSelectedMission(mission)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Pagination ── */}
        {filteredMissions.length > 0 && (
          <div className="mm-pagination">
            <button
              className="mm-page-btn"
              disabled={safePage === 1}
              onClick={() => setPage(1)}
              title="First page"
            >
              «
            </button>
            <button
              className="mm-page-btn"
              disabled={safePage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (n) =>
                  n === 1 ||
                  n === totalPages ||
                  Math.abs(n - safePage) <= 1
              )
              .reduce<(number | '...')[]>((acc, n, i, arr) => {
                if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) =>
                n === '...' ? (
                  <span key={`ellipsis-${i}`} className="mm-page-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    className={`mm-page-btn mm-page-num ${safePage === n ? 'active' : ''}`}
                    onClick={() => setPage(n as number)}
                  >
                    {n}
                  </button>
                )
              )}

            <button
              className="mm-page-btn"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="mm-page-btn"
              disabled={safePage === totalPages}
              onClick={() => setPage(totalPages)}
              title="Last page"
            >
              »
            </button>
          </div>
        )}
      </div>

      <MissionDetailModal
        mission={selectedMission}
        onClose={() => setSelectedMission(null)}
      />
    </DriverLayout>
  );
}