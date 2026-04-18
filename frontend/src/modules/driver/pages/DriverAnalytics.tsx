// DriverAnalytics.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  Filter,
  IndianRupee,
  MapPin,
  Route,
  Search,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  RadialBarChart,
  RadialBar,
} from 'recharts';

import { StatusBadge } from '@shared/components/StatusBadge';
import { DriverLayout } from '@modules/driver/pages/DriverLayout';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import {
  fetchDriverMissions,
  fetchDriverStats,
  type MissionRecord,
  type DriverStats as DriverStatsType,
} from '@shared/utils/driverOpsApi';

import './DriverAnalytics.css';

type TimeFilter = '7d' | '30d' | '90d' | 'all';
type StatusFilter = 'All' | 'Completed' | 'Ongoing' | 'Cancelled';

interface MissionChartProps {
  data: Array<{ week: string; missions: number }>;
  activeBar: number | null;
  onBarHover: (index: number | null) => void;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CustomTooltipBar({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="da-custom-tooltip">
      <p className="da-tooltip-label">{label}</p>
      <p className="da-tooltip-value">
        <span className="da-tooltip-dot" style={{ background: '#d72b2b' }} />
        {payload[0].value} missions
      </p>
    </div>
  );
}

function CustomTooltipLine({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="da-custom-tooltip">
      <p className="da-tooltip-label">{label}</p>
      <p className="da-tooltip-value">
        <Clock3 size={14} />
        {payload[0].value} min avg
      </p>
    </div>
  );
}

function CustomTooltipPie({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="da-custom-tooltip">
      <p className="da-tooltip-value">
        <span className="da-tooltip-dot" style={{ background: payload[0].payload.color }} />
        {payload[0].name}: {payload[0].value}
      </p>
    </div>
  );
}

function MissionChart({ data, activeBar, onBarHover }: MissionChartProps) {
  return (
    <div className="da-chart-container">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 10, bottom: 0, left: -18 }}
          onMouseLeave={() => onBarHover(null)}
        >
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d72b2b" stopOpacity={1} />
              <stop offset="100%" stopColor="#d72b2b" stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="barGradientActive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff4444" stopOpacity={1} />
              <stop offset="100%" stopColor="#d72b2b" stopOpacity={0.8} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf1" vertical={false} />
          <XAxis
            dataKey="week"
            stroke="#8a94a3"
            tick={{ fill: '#8a94a3', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="#8a94a3"
            tick={{ fill: '#8a94a3', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltipBar />} cursor={false} />
          <Bar
            dataKey="missions"
            radius={[8, 8, 0, 0]}
            onMouseEnter={(_: any, index: number) => onBarHover(index)}
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={activeBar === index ? 'url(#barGradientActive)' : 'url(#barGradient)'}
                style={{
                  filter: activeBar === index ? 'drop-shadow(0 4px 12px rgba(215,43,43,0.4))' : 'none',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatCardEnhanced({
  icon: Icon,
  label,
  value,
  trend,
  trendText,
  color = '#d72b2b',
  delay = 0,
}: {
  icon: any;
  label: string;
  value: string;
  trend: number;
  trendText: string;
  color?: string;
  delay?: number;
}) {
  const isPositive = trend >= 0;
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className="da-stat-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="da-stat-card-header">
        <div className="da-stat-icon-wrap" style={{ background: `${color}12`, color }}>
          <Icon size={20} />
        </div>
        <div className={`da-stat-trend ${isPositive ? 'positive' : 'negative'}`}>
          <TrendIcon size={14} />
          <span>{Math.abs(trend)}%</span>
        </div>
      </div>
      <div className="da-stat-value">{value}</div>
      <div className="da-stat-label">{label}</div>
      <div className="da-stat-trend-text">{trendText}</div>
      <div className="da-stat-glow" style={{ background: color }} />
    </div>
  );
}

function PerformanceGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const data = [{ name: label, value, fill: color }];
  return (
    <div className="da-gauge-item">
      <ResponsiveContainer width={100} height={100}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={10}
            background={{ fill: '#f0f2f5' }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="da-gauge-center">
        <span className="da-gauge-value">{value}%</span>
      </div>
      <p className="da-gauge-label">{label}</p>
    </div>
  );
}

export function DriverAnalytics() {
  const { isDriverAuthenticated, driverUser, logoutDriverUser } = useHospitalAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMission, setSelectedMission] = useState<string | null>(null);

  const [allMissions, setAllMissions] = useState<MissionRecord[]>([]);
  const [apiStats, setApiStats] = useState<DriverStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!driverUser?.email) return;
    setIsLoading(true);
    try {
      const [missionsRes, statsRes] = await Promise.all([
        fetchDriverMissions(driverUser.email),
        fetchDriverStats(driverUser.email),
      ]);
      if (missionsRes.success) setAllMissions(missionsRes.missions);
      if (statsRes.success) setApiStats(statsRes);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [driverUser?.email]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Generate weekly chart data from missions
  const MISSIONS_PER_WEEK = useMemo(() => {
    const now = Date.now();
    const weeks: { week: string; missions: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = now - (i + 1) * 7 * 86400000;
      const end = now - i * 7 * 86400000;
      const count = allMissions.filter((m) => {
        const t = Date.parse(m.createdAt);
        return t >= start && t < end;
      }).length;
      weeks.push({ week: `W${8 - i}`, missions: count });
    }
    return weeks;
  }, [allMissions]);

  // Generate response time trend from missions
  const RESPONSE_TIME_TREND = useMemo(() => {
    const now = Date.now();
    const weeks: { week: string; minutes: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = now - (i + 1) * 7 * 86400000;
      const end = now - i * 7 * 86400000;
      const weekMissions = allMissions.filter((m) => {
        const t = Date.parse(m.createdAt);
        return t >= start && t < end;
      });
      const avg = weekMissions.length > 0
        ? weekMissions.reduce((s, m) => s + m.responseTimeMin, 0) / weekMissions.length
        : 0;
      weeks.push({ week: `W${8 - i}`, minutes: Math.round(avg * 10) / 10 });
    }
    return weeks;
  }, [allMissions]);

  const filteredMissions = useMemo(() => {
    let missions = [...allMissions];

    if (statusFilter !== 'All') {
      missions = missions.filter((m) => m.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      missions = missions.filter(
        (m) =>
          m.missionId.toLowerCase().includes(q) ||
          (m.patientPhone || '').toLowerCase().includes(q)
      );
    }

    if (timeFilter !== 'all') {
      const now = Date.now();
      const days = timeFilter === '7d' ? 7 : timeFilter === '30d' ? 30 : 90;
      const cutoff = now - days * 86400000;
      missions = missions.filter((m) => Date.parse(m.createdAt) >= cutoff);
    }

    return missions;
  }, [allMissions, statusFilter, searchQuery, timeFilter]);

  const completedMissions = useMemo(
    () => filteredMissions.filter((m) => m.status === 'Completed'),
    [filteredMissions]
  );

  const ongoingMissions = useMemo(
    () => allMissions.filter((m) => m.status === 'Ongoing'),
    [allMissions]
  );

  const totalMissionCount = filteredMissions.length;
  const successRate = apiStats?.successRate ?? (
    totalMissionCount > 0
      ? (completedMissions.length / totalMissionCount) * 100
      : 0
  );

  const avgResponseTime =
    filteredMissions.length > 0
      ? filteredMissions.reduce((s, m) => s + m.responseTimeMin, 0) /
        filteredMissions.length
      : 0;

  const totalDistance = filteredMissions.reduce((s, m) => s + m.distanceKm, 0);

  const completedGoldenCount = completedMissions.filter(
    (m) => m.goldenHourMet
  ).length;
  const goldenHourCompliance =
    completedMissions.length > 0
      ? (completedGoldenCount / completedMissions.length) * 100
      : 0;

  const totalEarnings = filteredMissions.reduce(
    (s, m) => s + m.earningsInr,
    0
  );

  const statusBreakdown = [
    {
      label: 'Completed',
      value: filteredMissions.filter((m) => m.status === 'Completed').length,
      color: '#10b981',
    },
    {
      label: 'Cancelled',
      value: filteredMissions.filter((m) => m.status === 'Cancelled').length,
      color: '#f59e0b',
    },
    {
      label: 'Ongoing',
      value: filteredMissions.filter((m) => m.status === 'Ongoing').length,
      color: '#d72b2b',
    },
  ];

  const recentMissions = useMemo(
    () =>
      [...filteredMissions]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 8),
    [filteredMissions]
  );

  const performanceScore = Math.round(
    (successRate * 0.4 + goldenHourCompliance * 0.35 + Math.max(0, 100 - avgResponseTime * 5) * 0.25)
  );

  const handleExport = useCallback(() => {
    const headers = ['Mission ID', 'Patient ID', 'Status', 'Date', 'Earnings'];
    const rows = filteredMissions.map((m) => [
      m.missionId,
      m.patientPhone || '',
      m.status,
      formatDate(m.createdAt),
      `₹${m.earningsInr}`,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'driver-analytics.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredMissions]);

  if (!isDriverAuthenticated || !driverUser) {
    if (typeof window !== 'undefined') {
      window.location.hash = '/auth';
    }
    return null;
  }

  if (isLoading && allMissions.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading analytics data...</div>;
  }

  return (
    <DriverLayout
      missionActive={ongoingMissions.length > 0}
      pickupCount={0}
      onLogout={logoutDriverUser}
    >
      <div className="da-page">
        {/* Header Section */}
        <div className="da-header-section">
          <div className="da-header-content">
            <div className="da-header-left">
              <div className="da-header-icon-wrap">
                <TrendingUp size={28} />
              </div>
              <div>
                <h1 className="da-header-title">Driver Analytics</h1>
                <p className="da-header-subtitle">
                  Performance insights, mission quality, and response trends
                </p>
              </div>
            </div>
            <div className="da-header-actions">
              <button
                className="da-btn da-btn-outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter size={16} />
                Filters
                <ChevronDown
                  size={14}
                  className={`da-chevron ${showFilters ? 'rotated' : ''}`}
                />
              </button>
              <button className="da-btn da-btn-primary" onClick={handleExport}>
                <Download size={16} />
                Export
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className={`da-filters-panel ${showFilters ? 'open' : ''}`}>
            <div className="da-filters-row">
              <div className="da-search-wrap">
                <Search size={16} className="da-search-icon" />
                <input
                  type="text"
                  className="da-search-input"
                  placeholder="Search missions or patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="da-filter-group">
                <label className="da-filter-label">
                  <Calendar size={14} />
                  Period
                </label>
                <div className="da-pill-group">
                  {(['7d', '30d', '90d', 'all'] as TimeFilter[]).map((f) => (
                    <button
                      key={f}
                      className={`da-pill ${timeFilter === f ? 'active' : ''}`}
                      onClick={() => setTimeFilter(f)}
                    >
                      {f === 'all' ? 'All Time' : f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="da-filter-group">
                <label className="da-filter-label">
                  <Filter size={14} />
                  Status
                </label>
                <div className="da-pill-group">
                  {(['All', 'Completed', 'Ongoing', 'Cancelled'] as StatusFilter[]).map(
                    (f) => (
                      <button
                        key={f}
                        className={`da-pill ${statusFilter === f ? 'active' : ''}`}
                        onClick={() => setStatusFilter(f)}
                      >
                        {f}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Score Banner */}
        <div className="da-performance-banner">
          <div className="da-performance-left">
            <div className="da-performance-score-ring">
              <svg viewBox="0 0 120 120" className="da-score-svg">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#e8ecf1"
                  strokeWidth="8"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke={performanceScore >= 80 ? '#10b981' : performanceScore >= 60 ? '#f59e0b' : '#d72b2b'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(performanceScore / 100) * 327} 327`}
                  transform="rotate(-90 60 60)"
                  className="da-score-circle"
                />
              </svg>
              <div className="da-score-text">
                <span className="da-score-number">{performanceScore}</span>
                <span className="da-score-label">Score</span>
              </div>
            </div>
            <div className="da-performance-info">
              <h3 className="da-performance-title">Overall Performance</h3>
              <p className="da-performance-desc">
                Based on success rate, golden hour compliance, and response time
              </p>
              <div className="da-performance-badges">
                {performanceScore >= 80 && (
                  <span className="da-perf-badge excellent">
                    <Zap size={12} /> Excellent
                  </span>
                )}
                {goldenHourCompliance >= 90 && (
                  <span className="da-perf-badge golden">
                    <ShieldCheck size={12} /> Golden Hour Pro
                  </span>
                )}
                {avgResponseTime < 8 && (
                  <span className="da-perf-badge fast">
                    <Clock3 size={12} /> Fast Responder
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="da-performance-gauges">
            <PerformanceGauge
              value={Math.round(successRate)}
              label="Success"
              color="#10b981"
            />
            <PerformanceGauge
              value={Math.round(goldenHourCompliance)}
              label="Golden Hr"
              color="#f59e0b"
            />
            <PerformanceGauge
              value={Math.min(100, Math.round(100 - avgResponseTime * 5))}
              label="Speed"
              color="#6366f1"
            />
          </div>
        </div>

        {/* Stat Cards */}
        <section className="da-stats-grid">
          <StatCardEnhanced
            icon={CheckCircle2}
            label="Missions Completed"
            value={String(completedMissions.length)}
            trend={7.4}
            trendText="vs previous cycle"
            color="#10b981"
            delay={0}
          />
          <StatCardEnhanced
            icon={ShieldCheck}
            label="Success Rate"
            value={`${successRate.toFixed(1)}%`}
            trend={2.1}
            trendText="completion consistency"
            color="#6366f1"
            delay={50}
          />
          <StatCardEnhanced
            icon={Clock3}
            label="Avg Response Time"
            value={`${avgResponseTime.toFixed(1)} min`}
            trend={-4.5}
            trendText="lower is better"
            color="#f59e0b"
            delay={100}
          />
          <StatCardEnhanced
            icon={Route}
            label="Distance Covered"
            value={`${totalDistance.toFixed(1)} km`}
            trend={3.7}
            trendText="active mobility"
            color="#3b82f6"
            delay={150}
          />
          <StatCardEnhanced
            icon={Activity}
            label="Golden Hour"
            value={`${goldenHourCompliance.toFixed(1)}%`}
            trend={1.3}
            trendText="critical timing"
            color="#d72b2b"
            delay={200}
          />
          <StatCardEnhanced
            icon={IndianRupee}
            label="Total Earnings"
            value={`₹${totalEarnings.toLocaleString('en-IN')}`}
            trend={6.8}
            trendText="all recorded"
            color="#059669"
            delay={250}
          />
        </section>

        {/* Charts Section */}
        <section className="da-charts-grid">
          <article className="da-chart-card da-chart-card-wide">
            <div className="da-chart-card-header">
              <div>
                <h3 className="da-chart-title">Missions per Week</h3>
                <p className="da-chart-subtitle">Weekly mission completion trend</p>
              </div>
              <div className="da-chart-badge">
                <TrendingUp size={14} />
                Trending
              </div>
            </div>
            <MissionChart
              data={MISSIONS_PER_WEEK}
              activeBar={activeBar}
              onBarHover={setActiveBar}
            />
          </article>

          <article className="da-chart-card">
            <div className="da-chart-card-header">
              <div>
                <h3 className="da-chart-title">Response Time Trend</h3>
                <p className="da-chart-subtitle">Average response in minutes</p>
              </div>
            </div>
            <div className="da-chart-container">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <AreaChart
                  data={RESPONSE_TIME_TREND}
                  margin={{ top: 8, right: 10, bottom: 0, left: -18 }}
                >
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d72b2b" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#d72b2b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf1" vertical={false} />
                  <XAxis
                    dataKey="week"
                    stroke="#8a94a3"
                    tick={{ fill: '#8a94a3', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#8a94a3"
                    tick={{ fill: '#8a94a3', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltipLine />} />
                  <Area
                    type="monotone"
                    dataKey="minutes"
                    stroke="#d72b2b"
                    strokeWidth={3}
                    fill="url(#areaGradient)"
                    dot={{ fill: '#fff', stroke: '#d72b2b', strokeWidth: 2, r: 5 }}
                    activeDot={{ fill: '#d72b2b', stroke: '#fff', strokeWidth: 3, r: 7 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="da-chart-card">
            <div className="da-chart-card-header">
              <div>
                <h3 className="da-chart-title">Status Breakdown</h3>
                <p className="da-chart-subtitle">Mission outcome distribution</p>
              </div>
            </div>
            <div className="da-chart-container da-pie-container">
              <div className="da-pie-chart-wrap">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={4}
                      onMouseEnter={(_: any, index: number) => setActivePieIndex(index)}
                      onMouseLeave={() => setActivePieIndex(null)}
                    >
                      {statusBreakdown.map((entry, index) => (
                        <Cell
                          key={entry.label}
                          fill={entry.color}
                          style={{
                            filter:
                              activePieIndex === index
                                ? `drop-shadow(0 0 8px ${entry.color}80)`
                                : 'none',
                            transform:
                              activePieIndex === index ? 'scale(1.05)' : 'scale(1)',
                            transformOrigin: 'center',
                            transition: 'all 0.3s ease',
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltipPie />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="da-pie-center-label">
                  <span className="da-pie-total">{totalMissionCount}</span>
                  <span className="da-pie-total-label">Total</span>
                </div>
              </div>
              <div className="da-pie-legend">
                {statusBreakdown.map((entry) => (
                  <div key={entry.label} className="da-pie-legend-item">
                    <span
                      className="da-pie-legend-dot"
                      style={{ background: entry.color }}
                    />
                    <span className="da-pie-legend-text">{entry.label}</span>
                    <span className="da-pie-legend-value">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        {/* Recent Activity */}
        <section className="da-activity-section">
          <div className="da-activity-header">
            <div>
              <h3 className="da-chart-title">Recent Activity</h3>
              <p className="da-chart-subtitle">
                Latest {recentMissions.length} missions from your history
              </p>
            </div>
            <span className="da-activity-count">{filteredMissions.length} total</span>
          </div>

          <div className="da-activity-table-wrap">
            <div className="da-activity-table-header">
              <span>Mission ID</span>
              <span>Patient</span>
              <span>Status</span>
              <span>Date & Time</span>
              <span>Distance</span>
              <span>Response</span>
              <span>Earnings</span>
              <span></span>
            </div>

            <ul className="da-activity-list">
              {recentMissions.map((mission, index) => (
                <li
                  key={mission.missionId}
                  className={`da-activity-row ${selectedMission === mission.missionId ? 'expanded' : ''}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                  onClick={() =>
                    setSelectedMission(
                      selectedMission === mission.missionId
                        ? null
                        : mission.missionId
                    )
                  }
                >
                  <div className="da-activity-row-main">
                    <span className="da-mission-id">
                      <span className="da-mission-id-icon">
                        <MapPin size={14} />
                      </span>
                      {mission.missionId}
                    </span>
                    <span className="da-patient-id">{mission.patientPhone || mission.missionId.slice(0, 8)}</span>
                    <span>
                      <StatusBadge label={mission.status} />
                    </span>
                    <span className="da-date-cell">
                      <span>{formatDate(mission.createdAt)}</span>
                      <span className="da-time-sub">
                        {formatTime(mission.createdAt)}
                      </span>
                    </span>
                    <span className="da-distance-cell">
                      {mission.distanceKm.toFixed(1)} km
                    </span>
                    <span className="da-response-cell">
                      <Clock3 size={13} />
                      {mission.responseTimeMin} min
                    </span>
                    <span className="da-earnings-cell">
                      ₹{mission.earningsInr.toLocaleString('en-IN')}
                    </span>
                    <span className="da-row-action">
                      <Eye size={16} />
                    </span>
                  </div>

                  {selectedMission === mission.missionId && (
                    <div className="da-activity-row-detail">
                      <div className="da-detail-grid">
                        <div className="da-detail-item">
                          <span className="da-detail-label">Golden Hour</span>
                          <span
                            className={`da-detail-value ${mission.goldenHourMet ? 'met' : 'missed'}`}
                          >
                            {mission.goldenHourMet ? '✓ Met' : '✗ Missed'}
                          </span>
                        </div>
                        <div className="da-detail-item">
                          <span className="da-detail-label">Response Time</span>
                          <span className="da-detail-value">
                            {mission.responseTimeMin} minutes
                          </span>
                        </div>
                        <div className="da-detail-item">
                          <span className="da-detail-label">Distance</span>
                          <span className="da-detail-value">
                            {mission.distanceKm} km
                          </span>
                        </div>
                        <div className="da-detail-item">
                          <span className="da-detail-label">Earnings</span>
                          <span className="da-detail-value">
                            ₹{mission.earningsInr.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </DriverLayout>
  );
}