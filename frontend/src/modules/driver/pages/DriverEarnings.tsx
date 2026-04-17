import { useMemo, useState, useCallback } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  IndianRupee,
  Wallet,
  TrendingUp,
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Clock,
  Zap,
  Award,
  Banknote,
  CreditCard,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

import { StatusBadge } from '@modules/shared/components/StatusBadge';
import { DriverLayout } from '@modules/driver/pages/DriverLayout';
import { useHospitalAuth } from '@shared/providers/AuthContext';
import {
  DRIVER_MISSIONS,
  EARNINGS_PER_MONTH,
  EARNINGS_PER_WEEK,
  PAYOUT_HISTORY,
} from '../mockDriverData';
import './DriverEarnings.css';

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function getMissionPayParts(
  distanceKm: number,
  durationMin: number,
  goldenHourMet: boolean,
  isCritical: boolean
) {
  const basePay = Math.max(280, Math.round(distanceKm * 34 + durationMin * 3.5));
  const bonus = (goldenHourMet ? 100 : 0) + (isCritical ? 50 : 0);
  return {
    basePay,
    bonus,
    total: basePay + bonus,
  };
}

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  duration?: number;
}

function AnimatedCounter({ value, prefix = '₹', duration = 1200 }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useMemo(() => {
    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(eased * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {displayValue.toLocaleString('en-IN')}
    </span>
  );
}

type TimeFilter = 'week' | 'month' | 'quarter' | 'year' | 'all';
type PayoutFilter = 'all' | 'Paid' | 'Pending' | 'Processing';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="de-chart-tooltip">
        <p className="de-chart-tooltip-label">{label}</p>
        <p className="de-chart-tooltip-value">
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export function DriverEarnings() {
  const { isDriverAuthenticated, driverUser, logoutDriverUser } = useHospitalAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [payoutFilter, setPayoutFilter] = useState<PayoutFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<'bar' | 'area'>('bar');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const rowsPerPage = 5;

  if (!isDriverAuthenticated || !driverUser) {
    if (typeof window !== 'undefined') {
      window.location.hash = '/auth';
    }
    return null;
  }

  const completedMissions = useMemo(
    () => DRIVER_MISSIONS.filter((mission) => mission.status === 'Completed'),
    []
  );

  const earningRows = useMemo(
    () =>
      completedMissions
        .map((mission) => {
          const pay = getMissionPayParts(
            mission.distanceKm,
            mission.durationMin,
            mission.goldenHourMet,
            mission.priority === 'Critical'
          );
          return { mission, ...pay };
        })
        .sort(
          (left, right) =>
            Date.parse(right.mission.createdAt) - Date.parse(left.mission.createdAt)
        ),
    [completedMissions]
  );

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const totalEarnings = earningRows.reduce((sum, row) => sum + row.total, 0);
  const thisMonthEarnings = earningRows
    .filter((row) => {
      const d = new Date(row.mission.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, row) => sum + row.total, 0);
  const thisWeekEarnings = earningRows
    .filter((row) => new Date(row.mission.createdAt) >= startOfWeek)
    .reduce((sum, row) => sum + row.total, 0);
  const pendingPayout = earningRows
    .filter((row) => row.mission.payoutStatus === 'Pending')
    .reduce((sum, row) => sum + row.total, 0);
  const totalBonuses = earningRows.reduce((sum, row) => sum + row.bonus, 0);
  const avgPerMission =
    earningRows.length > 0 ? Math.round(totalEarnings / earningRows.length) : 0;

  const bonusDistribution = useMemo(() => {
    const goldenHour = earningRows.filter((r) => r.mission.goldenHourMet).length;
    const critical = earningRows.filter((r) => r.mission.priority === 'Critical').length;
    const noBonus = earningRows.length - goldenHour - critical;
    return [
      { name: 'Golden Hour', value: goldenHour, color: '#f59e0b' },
      { name: 'Critical', value: critical, color: '#ef4444' },
      { name: 'No Bonus', value: Math.max(0, noBonus), color: '#94a3b8' },
    ];
  }, [earningRows]);

  const filteredRows = useMemo(() => {
    let rows = [...earningRows];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.mission.missionId.toLowerCase().includes(q) ||
          r.mission.patientId.toLowerCase().includes(q)
      );
    }

    if (payoutFilter !== 'all') {
      rows = rows.filter((r) => r.mission.payoutStatus === payoutFilter);
    }

    if (timeFilter !== 'all') {
      const cutoff = new Date();
      switch (timeFilter) {
        case 'week':
          cutoff.setDate(cutoff.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(cutoff.getMonth() - 1);
          break;
        case 'quarter':
          cutoff.setMonth(cutoff.getMonth() - 3);
          break;
        case 'year':
          cutoff.setFullYear(cutoff.getFullYear() - 1);
          break;
      }
      rows = rows.filter((r) => new Date(r.mission.createdAt) >= cutoff);
    }

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = Date.parse(a.mission.createdAt) - Date.parse(b.mission.createdAt);
          break;
        case 'total':
          cmp = a.total - b.total;
          break;
        case 'distance':
          cmp = a.mission.distanceKm - b.mission.distanceKm;
          break;
        case 'duration':
          cmp = a.mission.durationMin - b.mission.durationMin;
          break;
        default:
          cmp = 0;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [earningRows, searchQuery, payoutFilter, timeFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
      setCurrentPage(1);
    },
    [sortField]
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronDown size={12} className="de-sort-icon-inactive" />;
    return sortDirection === 'asc' ? (
      <ChevronUp size={12} className="de-sort-icon-active" />
    ) : (
      <ChevronDown size={12} className="de-sort-icon-active" />
    );
  };

  const statCards = [
    {
      icon: Wallet,
      label: 'Total Earnings',
      value: totalEarnings,
      trend: 6.4,
      color: '#10b981',
      bgGradient: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
    },
    {
      icon: CalendarClock,
      label: 'This Month',
      value: thisMonthEarnings,
      trend: 4.1,
      color: '#3b82f6',
      bgGradient: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    },
    {
      icon: IndianRupee,
      label: 'This Week',
      value: thisWeekEarnings,
      trend: 2.8,
      color: '#8b5cf6',
      bgGradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
    },
    {
      icon: Banknote,
      label: 'Pending Payout',
      value: pendingPayout,
      trend: -1.9,
      color: '#f59e0b',
      bgGradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    },
    {
      icon: Award,
      label: 'Total Bonuses',
      value: totalBonuses,
      trend: 5.2,
      color: '#ef4444',
      bgGradient: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
    },
    {
      icon: CheckCircle2,
      label: 'Avg per Mission',
      value: avgPerMission,
      trend: 3.2,
      color: '#06b6d4',
      bgGradient: 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)',
    },
  ];

  return (
    <DriverLayout
      missionActive={DRIVER_MISSIONS.some((m) => m.status === 'Ongoing')}
      pickupCount={0}
      onLogout={logoutDriverUser}
    >
      <div className="de-page">
        {/* Header */}
        <div className="de-header">
          <div className="de-header-left">
            <h1 className="de-chart-title">Earnings Dashboard</h1>
            <p className="de-chart-subtitle">
              Track your income, bonuses, and payout history in real time.
            </p>
          </div>
          <div className="de-header-actions">
            <button
              className={`de-btn de-btn-icon ${isRefreshing ? 'de-spinning' : ''}`}
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button className="de-btn de-btn-secondary">
              <Download size={14} />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Time filter pills */}
        <div className="de-time-filters">
          {(
            [
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
              { key: 'quarter', label: 'Quarter' },
              { key: 'year', label: 'This Year' },
              { key: 'all', label: 'All Time' },
            ] as { key: TimeFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.key}
              className={`de-pill ${timeFilter === f.key ? 'de-pill-active' : ''}`}
              onClick={() => {
                setTimeFilter(f.key);
                setCurrentPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Stat Cards */}
        <section className="de-stats-grid">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            const isPositive = card.trend >= 0;
            return (
              <div
                key={card.label}
                className="de-stat-card"
                style={
                  {
                    '--card-accent': card.color,
                    '--card-bg': card.bgGradient,
                    animationDelay: `${index * 80}ms`,
                  } as React.CSSProperties
                }
              >
                <div className="de-stat-card-header">
                  <div className="de-stat-card-icon" style={{ background: card.bgGradient }}>
                    <Icon size={18} color={card.color} />
                  </div>
                  <div className={`de-stat-trend ${isPositive ? 'de-trend-up' : 'de-trend-down'}`}>
                    {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    <span>{Math.abs(card.trend)}%</span>
                  </div>
                </div>
                <p className="de-stat-card-value">
                  <AnimatedCounter value={card.value} />
                </p>
                <p className="de-stat-card-label">{card.label}</p>
                <div
                  className="de-stat-card-bar"
                  style={{ '--bar-color': card.color } as React.CSSProperties}
                />
              </div>
            );
          })}
        </section>

        {/* Charts Section */}
        <section className="de-charts-grid">
          {/* Weekly Chart */}
          <article className="de-chart-card">
            <div className="de-chart-card-header">
              <div>
                <p className="de-chart-title">Weekly Earnings</p>
                <p className="de-chart-subtitle">Revenue breakdown per week</p>
              </div>
              <div className="de-chart-toggle">
                <button
                  className={`de-chart-toggle-btn ${activeChart === 'bar' ? 'active' : ''}`}
                  onClick={() => setActiveChart('bar')}
                >
                  Bar
                </button>
                <button
                  className={`de-chart-toggle-btn ${activeChart === 'area' ? 'active' : ''}`}
                  onClick={() => setActiveChart('area')}
                >
                  Area
                </button>
              </div>
            </div>
            <div className="de-chart-body">
              <ResponsiveContainer>
                {activeChart === 'bar' ? (
                  <BarChart
                    data={EARNINGS_PER_WEEK}
                    margin={{ top: 8, right: 10, bottom: 0, left: -18 }}
                  >
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#f87171" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="week"
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(239,68,68,0.05)' }} />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]} fill="url(#barGrad)">
                      {EARNINGS_PER_WEEK.map((_, i) => (
                        <Cell key={i} className="de-bar-cell" />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <AreaChart
                    data={EARNINGS_PER_WEEK}
                    margin={{ top: 8, right: 10, bottom: 0, left: -18 }}
                  >
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="week"
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#ef4444"
                      strokeWidth={2.5}
                      fill="url(#areaGrad)"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </article>

          {/* Monthly Chart */}
          <article className="de-chart-card">
            <div className="de-chart-card-header">
              <div>
                <p className="de-chart-title">Monthly Trend</p>
                <p className="de-chart-subtitle">Earnings trajectory over months</p>
              </div>
              <div className="de-chart-badge">
                <TrendingUp size={14} />
                <span>+12.4%</span>
              </div>
            </div>
            <div className="de-chart-body">
              <ResponsiveContainer>
                <AreaChart
                  data={EARNINGS_PER_MONTH}
                  margin={{ top: 8, right: 10, bottom: 0, left: -18 }}
                >
                  <defs>
                    <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#monthGrad)"
                    dot={{ fill: '#3b82f6', r: 4, strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Bonus Distribution Pie */}
          <article className="de-chart-card de-chart-card-small">
            <div className="de-chart-card-header">
              <div>
                <p className="de-chart-title">Bonus Split</p>
                <p className="de-chart-subtitle">By bonus type</p>
              </div>
            </div>
            <div className="de-chart-body de-pie-body">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={bonusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {bonusDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} className="de-pie-cell" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      const numericValue =
                        typeof value === 'number'
                          ? value
                          : Number.isFinite(Number(value))
                            ? Number(value)
                            : 0;
                      return [`${numericValue} missions`, String(name)];
                    }}
                    contentStyle={{
                      background: '#1e293b',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="de-pie-legend">
                {bonusDistribution.map((entry) => (
                  <div key={entry.name} className="de-pie-legend-item">
                    <span className="de-pie-dot" style={{ background: entry.color }} />
                    <span className="de-pie-legend-label">{entry.name}</span>
                    <span className="de-pie-legend-value">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        {/* Earnings Table */}
        <section className="de-table-section">
          <div className="de-table-header">
            <div className="de-table-header-left">
              <p className="de-table-title">Earnings Breakdown</p>
              <span className="de-table-count">{filteredRows.length} missions</span>
            </div>
            <div className="de-table-controls">
              <div className="de-search-box">
                <Search size={14} className="de-search-icon" />
                <input
                  type="text"
                  placeholder="Search mission or patient ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="de-search-input"
                />
              </div>
              <div className="de-filter-dropdown">
                <Filter size={14} />
                <select
                  value={payoutFilter}
                  onChange={(e) => {
                    setPayoutFilter(e.target.value as PayoutFilter);
                    setCurrentPage(1);
                  }}
                  className="de-filter-select"
                >
                  <option value="all">All Status</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Processing">Processing</option>
                </select>
              </div>
            </div>
          </div>

          <div className="de-table-wrapper">
            <table className="de-table">
              <thead>
                <tr>
                  <th>Mission ID</th>
                  <th className="de-sortable" onClick={() => handleSort('date')}>
                    Date <SortIcon field="date" />
                  </th>
                  <th>Patient ID</th>
                  <th className="de-sortable" onClick={() => handleSort('distance')}>
                    Distance <SortIcon field="distance" />
                  </th>
                  <th className="de-sortable" onClick={() => handleSort('duration')}>
                    Duration <SortIcon field="duration" />
                  </th>
                  <th>Base Pay</th>
                  <th>Bonus</th>
                  <th className="de-sortable" onClick={() => handleSort('total')}>
                    Total <SortIcon field="total" />
                  </th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, index) => (
                  <>
                    <tr
                      key={row.mission.missionId}
                      className={`de-table-row ${
                        expandedRow === row.mission.missionId ? 'de-row-expanded' : ''
                      }`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="de-cell-id">{row.mission.missionId}</td>
                      <td>{formatDate(row.mission.createdAt)}</td>
                      <td>{row.mission.patientId}</td>
                      <td>
                        <span className="de-cell-badge de-cell-distance">
                          {row.mission.distanceKm.toFixed(1)} km
                        </span>
                      </td>
                      <td>
                        <span className="de-cell-badge de-cell-duration">
                          <Clock size={11} />
                          {row.mission.durationMin} min
                        </span>
                      </td>
                      <td>{formatCurrency(row.basePay)}</td>
                      <td>
                        {row.bonus > 0 ? (
                          <span className="de-bonus-tag">
                            <Zap size={11} />
                            {formatCurrency(row.bonus)}
                          </span>
                        ) : (
                          <span className="de-no-bonus">—</span>
                        )}
                      </td>
                      <td className="de-cell-total">{formatCurrency(row.total)}</td>
                      <td>
                        <StatusBadge label={row.mission.payoutStatus} />
                      </td>
                      <td>
                        <button
                          className="de-expand-btn"
                          onClick={() =>
                            setExpandedRow(
                              expandedRow === row.mission.missionId
                                ? null
                                : row.mission.missionId
                            )
                          }
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                    {expandedRow === row.mission.missionId && (
                      <tr className="de-expanded-row" key={`${row.mission.missionId}-detail`}>
                        <td colSpan={10}>
                          <div className="de-expanded-content">
                            <div className="de-expanded-grid">
                              <div className="de-expanded-item">
                                <span className="de-expanded-label">Priority</span>
                                <span
                                  className={`de-priority-badge ${
                                    row.mission.priority === 'Critical'
                                      ? 'de-priority-critical'
                                      : 'de-priority-normal'
                                  }`}
                                >
                                  {row.mission.priority}
                                </span>
                              </div>
                              <div className="de-expanded-item">
                                <span className="de-expanded-label">Golden Hour</span>
                                <span
                                  className={`de-golden-badge ${
                                    row.mission.goldenHourMet ? 'de-golden-yes' : 'de-golden-no'
                                  }`}
                                >
                                  {row.mission.goldenHourMet ? '✓ Met' : '✗ Missed'}
                                </span>
                              </div>
                              <div className="de-expanded-item">
                                <span className="de-expanded-label">Pay Formula</span>
                                <span className="de-expanded-value">
                                  max(280, {row.mission.distanceKm}×34 + {row.mission.durationMin}
                                  ×3.5) = ₹{row.basePay}
                                </span>
                              </div>
                              <div className="de-expanded-item">
                                <span className="de-expanded-label">Bonus Breakdown</span>
                                <span className="de-expanded-value">
                                  {row.mission.goldenHourMet ? '₹100 (Golden)' : ''}
                                  {row.mission.goldenHourMet && row.mission.priority === 'Critical'
                                    ? ' + '
                                    : ''}
                                  {row.mission.priority === 'Critical' ? '₹50 (Critical)' : ''}
                                  {!row.mission.goldenHourMet &&
                                  row.mission.priority !== 'Critical'
                                    ? 'None'
                                    : ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {paginatedRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="de-empty-state">
                      <p>No missions found matching your criteria</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="de-pagination">
              <span className="de-pagination-info">
                Showing {(currentPage - 1) * rowsPerPage + 1}–
                {Math.min(currentPage * rowsPerPage, filteredRows.length)} of {filteredRows.length}
              </span>
              <div className="de-pagination-controls">
                <button
                  className="de-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    className={`de-page-btn ${currentPage === page ? 'de-page-active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="de-page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Payout History */}
        <section className="de-payout-section">
          <div className="de-payout-header">
            <div>
              <p className="de-payout-title">
                <CreditCard size={18} />
                Payout History
              </p>
              <p className="de-payout-subtitle">Recent transaction records</p>
            </div>
          </div>
          <div className="de-payout-list">
            {PAYOUT_HISTORY.map((payout, index) => (
              <div
                key={payout.id}
                className="de-payout-card"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="de-payout-card-left">
                  <div className="de-payout-icon">
                    <Banknote size={18} />
                  </div>
                  <div>
                    <p className="de-payout-amount">{formatCurrency(payout.amountInr)}</p>
                    <p className="de-payout-date">{formatDate(payout.date)}</p>
                  </div>
                </div>
                <div className="de-payout-card-right">
                  <span className="de-payout-mode">{payout.mode}</span>
                  <StatusBadge label={payout.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DriverLayout>
  );
}