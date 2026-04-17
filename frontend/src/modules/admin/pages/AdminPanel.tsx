import { useMemo, useState } from 'react';

import { StatusBadge } from '@shared/components/StatusBadge';
import { formatDate } from '@shared/utils/formatters';
import { AdminAuthPage, AdminAuthState, AdminSession } from '@modules/admin/pages/AdminAuthPage';
import './AdminPanel.css';

type VerificationStatus = 'pending' | 'verified' | 'needs_review' | 'delisted';
type ReviewStatus = 'open' | 'in_progress' | 'resolved';
type ReviewSeverity = 'low' | 'medium' | 'high';
type AdminSectionKey = 'overview' | 'verification' | 'reviews' | 'compliance' | 'ops';
type OverviewRange = 'today' | '7d' | '30d';

interface AdminHospitalRecord {
  id: string;
  name: string;
  cityZone: string;
  onboardedAt: string;
  verificationStatus: VerificationStatus;
  docsCompletionPct: number;
  averageRating: number;
  complaintsLast30Days: number;
  emergencySlaMinutes: number;
}

interface UserReviewTicket {
  id: string;
  hospitalId: string;
  author: string;
  summary: string;
  postedAt: string;
  severity: ReviewSeverity;
  rating: number;
  source: 'whatsapp' | 'in-app' | 'call-center';
  status: ReviewStatus;
}

interface AdminActivity {
  id: string;
  at: string;
  message: string;
  type: 'verification' | 'review' | 'compliance' | 'system';
}

const STORAGE_KEY = 'codered-admin-auth-v1';

const initialHospitals: AdminHospitalRecord[] = [
  {
    id: 'HSP-MUM-001',
    name: 'Lilavati Hospital',
    cityZone: 'Bandra West',
    onboardedAt: '2026-03-10T09:05:00.000Z',
    verificationStatus: 'verified',
    docsCompletionPct: 100,
    averageRating: 4.7,
    complaintsLast30Days: 2,
    emergencySlaMinutes: 2.8,
  },
  {
    id: 'HSP-MUM-004',
    name: 'Fortis Hospital Mulund',
    cityZone: 'Mulund West',
    onboardedAt: '2026-03-26T12:24:00.000Z',
    verificationStatus: 'pending',
    docsCompletionPct: 88,
    averageRating: 4.3,
    complaintsLast30Days: 5,
    emergencySlaMinutes: 3.4,
  },
  {
    id: 'HSP-MUM-006',
    name: 'Nanavati Max Super Speciality',
    cityZone: 'Vile Parle West',
    onboardedAt: '2026-04-01T07:42:00.000Z',
    verificationStatus: 'needs_review',
    docsCompletionPct: 74,
    averageRating: 3.9,
    complaintsLast30Days: 12,
    emergencySlaMinutes: 4.2,
  },
  {
    id: 'HSP-MUM-008',
    name: 'Seven Hills Hospital',
    cityZone: 'Andheri East',
    onboardedAt: '2026-03-18T15:19:00.000Z',
    verificationStatus: 'verified',
    docsCompletionPct: 100,
    averageRating: 4.5,
    complaintsLast30Days: 3,
    emergencySlaMinutes: 3.0,
  },
  {
    id: 'HSP-MUM-010',
    name: 'Sion Hospital',
    cityZone: 'Sion',
    onboardedAt: '2026-03-30T10:13:00.000Z',
    verificationStatus: 'delisted',
    docsCompletionPct: 66,
    averageRating: 3.1,
    complaintsLast30Days: 21,
    emergencySlaMinutes: 5.6,
  },
];

const initialReviewTickets: UserReviewTicket[] = [
  {
    id: 'RVT-9012',
    hospitalId: 'HSP-MUM-004',
    author: 'A. Kulkarni',
    summary: 'Ambulance was delayed by 17 minutes and status updates stopped.',
    postedAt: '2026-04-14T11:00:00.000Z',
    severity: 'high',
    rating: 2,
    source: 'whatsapp',
    status: 'open',
  },
  {
    id: 'RVT-9031',
    hospitalId: 'HSP-MUM-008',
    author: 'M. Shaikh',
    summary: 'Coordination was smooth and triage support was quick.',
    postedAt: '2026-04-14T08:35:00.000Z',
    severity: 'low',
    rating: 5,
    source: 'in-app',
    status: 'resolved',
  },
  {
    id: 'RVT-9064',
    hospitalId: 'HSP-MUM-006',
    author: 'R. Fernandes',
    summary: 'Driver details mismatched and family had to re-confirm pickup.',
    postedAt: '2026-04-13T20:08:00.000Z',
    severity: 'medium',
    rating: 3,
    source: 'call-center',
    status: 'in_progress',
  },
  {
    id: 'RVT-9075',
    hospitalId: 'HSP-MUM-010',
    author: 'P. Nair',
    summary: 'Repeated cancellations in emergency handoff requests.',
    postedAt: '2026-04-13T13:41:00.000Z',
    severity: 'high',
    rating: 1,
    source: 'whatsapp',
    status: 'open',
  },
];

const initialActivity: AdminActivity[] = [
  {
    id: 'ACT-1',
    at: '2026-04-15T07:45:00.000Z',
    type: 'verification',
    message: 'Fortis Hospital Mulund marked for document verification follow-up.',
  },
  {
    id: 'ACT-2',
    at: '2026-04-15T07:29:00.000Z',
    type: 'review',
    message: 'High-severity review RVT-9012 escalated to quality operations queue.',
  },
  {
    id: 'ACT-3',
    at: '2026-04-15T06:58:00.000Z',
    type: 'compliance',
    message: 'Sion Hospital remained delisted pending external audit closure.',
  },
  {
    id: 'ACT-4',
    at: '2026-04-15T06:40:00.000Z',
    type: 'system',
    message: 'Daily platform SLA report generated and pushed to admin mailbox.',
  },
];

const verificationTone: Record<VerificationStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  verified: 'success',
  needs_review: 'info',
  delisted: 'danger',
};

const reviewTone: Record<ReviewStatus, 'neutral' | 'info' | 'success'> = {
  open: 'neutral',
  in_progress: 'info',
  resolved: 'success',
};

const severityTone: Record<ReviewSeverity, 'info' | 'warning' | 'danger'> = {
  low: 'info',
  medium: 'warning',
  high: 'danger',
};

const sectionLabel: Record<AdminSectionKey, string> = {
  overview: 'Overview',
  verification: 'Verification',
  reviews: 'Reviews',
  compliance: 'Compliance',
  ops: 'Ops Feed',
};

const overviewRangeLabel: Record<OverviewRange, string> = {
  today: 'Today',
  '7d': '7 Days',
  '30d': '30 Days',
};

const incidentVolumeByRange: Record<OverviewRange, { labels: string[]; values: number[] }> = {
  today: {
    labels: ['06', '08', '10', '12', '14', '16', '18', '20'],
    values: [4, 7, 6, 9, 8, 10, 7, 5],
  },
  '7d': {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    values: [42, 38, 45, 49, 44, 52, 47],
  },
  '30d': {
    labels: ['W1', 'W2', 'W3', 'W4'],
    values: [278, 301, 326, 298],
  },
};

const reviewVolumeMultiplier: Record<OverviewRange, number> = {
  today: 0.35,
  '7d': 1,
  '30d': 3.8,
};

function statusLabelFromKey(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isAdminSession(candidate: unknown): candidate is AdminSession {
  if (!candidate || typeof candidate !== 'object') return false;
  const value = candidate as Partial<AdminSession>;
  return Boolean(
    typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.email === 'string' &&
      typeof value.role === 'string' &&
      typeof value.lastLoginAt === 'string',
  );
}

function isAdminAuthState(candidate: unknown): candidate is AdminAuthState {
  if (!candidate || typeof candidate !== 'object') return false;
  const value = candidate as Partial<AdminAuthState>;
  return Boolean(typeof value.token === 'string' && value.user && isAdminSession(value.user));
}

function loadAdminSession() {
  if (typeof window === 'undefined') return null;
  const persisted = window.localStorage.getItem(STORAGE_KEY);
  if (!persisted) return null;
  try {
    const parsed = JSON.parse(persisted) as unknown;
    if (isAdminAuthState(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function AdminPanel() {
  const [adminAuth, setAdminAuth] = useState<AdminAuthState | null>(() => loadAdminSession());
  const [activeSection, setActiveSection] = useState<AdminSectionKey>('overview');
  const [overviewRange, setOverviewRange] = useState<OverviewRange>('7d');
  const [hospitals, setHospitals] = useState<AdminHospitalRecord[]>(initialHospitals);
  const [reviews, setReviews] = useState<UserReviewTicket[]>(initialReviewTickets);
  const [activity, setActivity] = useState<AdminActivity[]>(initialActivity);
  const [adminNotice, setAdminNotice] = useState<string>('');

  const metrics = useMemo(() => {
    const verifiedHospitals = hospitals.filter((hospital) => hospital.verificationStatus === 'verified').length;
    const pendingHospitals = hospitals.filter((hospital) => hospital.verificationStatus === 'pending').length;
    const highRiskHospitals = hospitals.filter(
      (hospital) => hospital.complaintsLast30Days >= 10 || hospital.verificationStatus === 'needs_review',
    ).length;
    const delistedHospitals = hospitals.filter((hospital) => hospital.verificationStatus === 'delisted').length;
    const avgSlaMinutes =
      hospitals.reduce((sum, hospital) => sum + hospital.emergencySlaMinutes, 0) / Math.max(hospitals.length, 1);
    const averageRating =
      hospitals.reduce((sum, hospital) => sum + hospital.averageRating, 0) / Math.max(hospitals.length, 1);
    const openReviews = reviews.filter((review) => review.status !== 'resolved').length;
    const highSeverityOpenReviews = reviews.filter(
      (review) => review.severity === 'high' && review.status !== 'resolved',
    ).length;
    return {
      verifiedHospitals,
      pendingHospitals,
      highRiskHospitals,
      delistedHospitals,
      avgSlaMinutes,
      averageRating,
      openReviews,
      highSeverityOpenReviews,
    };
  }, [hospitals, reviews]);

  const flaggedHospitals = useMemo(
    () =>
      hospitals.filter(
        (hospital) => hospital.verificationStatus === 'needs_review' || hospital.verificationStatus === 'delisted',
      ),
    [hospitals],
  );

  const reviewChannelMix = useMemo(() => {
    const scale = reviewVolumeMultiplier[overviewRange];
    const whatsapp = Math.max(1, Math.round(reviews.filter((review) => review.source === 'whatsapp').length * scale));
    const inApp = Math.max(1, Math.round(reviews.filter((review) => review.source === 'in-app').length * scale));
    const callCenter = Math.max(
      1,
      Math.round(reviews.filter((review) => review.source === 'call-center').length * scale),
    );
    const total = Math.max(whatsapp + inApp + callCenter, 1);
    return {
      whatsapp,
      inApp,
      callCenter,
      whatsappPct: Math.round((whatsapp / total) * 100),
      inAppPct: Math.round((inApp / total) * 100),
      callCenterPct: Math.round((callCenter / total) * 100),
    };
  }, [overviewRange, reviews]);

  const verificationMix = useMemo(() => {
    const total = Math.max(hospitals.length, 1);
    const verified = hospitals.filter((hospital) => hospital.verificationStatus === 'verified').length;
    const pending = hospitals.filter((hospital) => hospital.verificationStatus === 'pending').length;
    const needsReview = hospitals.filter((hospital) => hospital.verificationStatus === 'needs_review').length;
    const delisted = hospitals.filter((hospital) => hospital.verificationStatus === 'delisted').length;
    return {
      verified,
      pending,
      needsReview,
      delisted,
      verifiedPct: Math.round((verified / total) * 100),
      pendingPct: Math.round((pending / total) * 100),
      needsReviewPct: Math.round((needsReview / total) * 100),
      delistedPct: Math.round((delisted / total) * 100),
    };
  }, [hospitals]);

  const topComplaintHospitals = useMemo(
    () => [...hospitals].sort((a, b) => b.complaintsLast30Days - a.complaintsLast30Days).slice(0, 3),
    [hospitals],
  );

  const selectedIncidentSeries = incidentVolumeByRange[overviewRange];

  const rangeAdjustedComplaints = (complaintsLast30Days: number) => {
    if (overviewRange === 'today') return Math.max(0, Math.round(complaintsLast30Days / 30));
    if (overviewRange === '7d') return Math.max(0, Math.round((complaintsLast30Days * 7) / 30));
    return complaintsLast30Days;
  };

  const addActivity = (message: string, type: AdminActivity['type']) => {
    setActivity((current) => [
      {
        id: `ACT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        at: new Date().toISOString(),
        message,
        type,
      },
      ...current,
    ].slice(0, 24));
  };

  const handleVerifyHospital = (hospitalId: string) => {
    setHospitals((current) =>
      current.map((hospital) =>
        hospital.id === hospitalId
          ? {
              ...hospital,
              verificationStatus: 'verified',
              docsCompletionPct: 100,
              complaintsLast30Days: Math.max(0, hospital.complaintsLast30Days - 2),
              emergencySlaMinutes: Math.max(2, hospital.emergencySlaMinutes - 0.3),
            }
          : hospital,
      ),
    );
    const message = `Hospital ${hospitalId} has been verified and moved to active emergency routing.`;
    setAdminNotice(message);
    addActivity(message, 'verification');
  };

  const handleMarkNeedsReview = (hospitalId: string) => {
    setHospitals((current) =>
      current.map((hospital) =>
        hospital.id === hospitalId
          ? {
              ...hospital,
              verificationStatus: 'needs_review',
            }
          : hospital,
      ),
    );
    const message = `Hospital ${hospitalId} moved to manual review queue.`;
    setAdminNotice(message);
    addActivity(message, 'verification');
  };

  const handleToggleDelist = (hospitalId: string) => {
    setHospitals((current) =>
      current.map((hospital) => {
        if (hospital.id !== hospitalId) return hospital;
        const nextStatus = hospital.verificationStatus === 'delisted' ? 'needs_review' : 'delisted';
        return { ...hospital, verificationStatus: nextStatus };
      }),
    );
    const message = `Delisting state updated for ${hospitalId}.`;
    setAdminNotice(message);
    addActivity(message, 'compliance');
  };

  const handleReviewStatus = (reviewId: string, status: ReviewStatus) => {
    setReviews((current) => current.map((review) => (review.id === reviewId ? { ...review, status } : review)));
    const message = `Review ${reviewId} updated to ${statusLabelFromKey(status)}.`;
    setAdminNotice(message);
    addActivity(message, 'review');
  };

  const handleAuthenticated = (session: AdminAuthState) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
    setAdminAuth(session);
    setAdminNotice(`Welcome back ${session.user.name}. Admin systems are now live.`);
    addActivity(`${session.user.name} signed into admin control tower.`, 'system');
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setAdminAuth(null);
  };

  if (!adminAuth) {
    return <AdminAuthPage onAuthenticated={handleAuthenticated} />;
  }

  const adminSession = adminAuth.user;

  const renderOverviewSection = () => (
    <section className="admin-content-surface" aria-label="Overview">
      <div className="admin-overview-toolbar">
        <header className="admin-content-head">
          <h2>Network Health Overview</h2>
          <p>Live metrics for emergency operations across the platform.</p>
        </header>
        <div className="admin-range-switch" role="tablist" aria-label="Overview range">
          {(['today', '7d', '30d'] as OverviewRange[]).map((range) => (
            <button
              key={range}
              type="button"
              className={overviewRange === range ? 'active' : ''}
              onClick={() => setOverviewRange(range)}
            >
              {overviewRangeLabel[range]}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card">
          <p>Verified Hospitals</p>
          <strong>{metrics.verifiedHospitals}</strong>
          <span>{metrics.pendingHospitals} pending approvals</span>
        </article>
        <article className="admin-kpi-card">
          <p>Open Review Tickets</p>
          <strong>{Math.max(1, Math.round(metrics.openReviews * reviewVolumeMultiplier[overviewRange]))}</strong>
          <span>{Math.max(1, Math.round(metrics.highSeverityOpenReviews * reviewVolumeMultiplier[overviewRange]))} high severity</span>
        </article>
        <article className="admin-kpi-card">
          <p>Average Response SLA</p>
          <strong>{metrics.avgSlaMinutes.toFixed(1)} min</strong>
          <span>Across active partner hospitals ({overviewRangeLabel[overviewRange]})</span>
        </article>
        <article className="admin-kpi-card">
          <p>Network Quality Score</p>
          <strong>{metrics.averageRating.toFixed(1)} / 5</strong>
          <span>{metrics.highRiskHospitals} hospitals need intervention</span>
        </article>
      </div>

      <div className="admin-overview-strip">
        <article>
          <p>Delisted Hospitals</p>
          <strong>{metrics.delistedHospitals}</strong>
        </article>
        <article>
          <p>Needs Review ({overviewRangeLabel[overviewRange]})</p>
          <strong>{Math.max(1, Math.round(flaggedHospitals.length * (overviewRange === '30d' ? 1 : 0.8)))}</strong>
        </article>
        <article>
          <p>Last Admin Login</p>
          <strong>{formatDate(adminSession.lastLoginAt)}</strong>
        </article>
      </div>

      <div className="admin-analytics-grid">
        <article className="admin-chart-card">
          <header>
            <h3>{overviewRangeLabel[overviewRange]} Incident Volume</h3>
            <span>Incoming emergency requests</span>
          </header>
          <div className="admin-mini-bars" aria-hidden="true">
            {selectedIncidentSeries.values.map((value, index) => {
              const max = Math.max(...selectedIncidentSeries.values);
              return (
                <div key={`${selectedIncidentSeries.labels[index]}-${value}`} className="admin-mini-bar-col">
                  <span className="admin-mini-bar-value">{value}</span>
                  <div className="admin-mini-bar-track">
                    <i style={{ height: `${Math.max(14, Math.round((value / max) * 100))}%` }} />
                  </div>
                  <label>{selectedIncidentSeries.labels[index]}</label>
                </div>
              );
            })}
          </div>
        </article>

        <article className="admin-chart-card">
          <header>
            <h3>Review Source Split</h3>
            <span>Where users are reporting from</span>
          </header>
          <div className="admin-progress-list">
            <div>
              <p>WhatsApp ({reviewChannelMix.whatsapp})</p>
              <div className="admin-progress-track">
                <i style={{ width: `${reviewChannelMix.whatsappPct}%` }} />
              </div>
            </div>
            <div>
              <p>In-App ({reviewChannelMix.inApp})</p>
              <div className="admin-progress-track tone-blue">
                <i style={{ width: `${reviewChannelMix.inAppPct}%` }} />
              </div>
            </div>
            <div>
              <p>Call-Center ({reviewChannelMix.callCenter})</p>
              <div className="admin-progress-track tone-amber">
                <i style={{ width: `${reviewChannelMix.callCenterPct}%` }} />
              </div>
            </div>
          </div>
        </article>

        <article className="admin-chart-card">
          <header>
            <h3>Verification Distribution</h3>
            <span>Current network governance state</span>
          </header>
          <div className="admin-progress-list compact">
            <div>
              <p>Verified ({verificationMix.verified})</p>
              <div className="admin-progress-track tone-green">
                <i style={{ width: `${verificationMix.verifiedPct}%` }} />
              </div>
            </div>
            <div>
              <p>Pending ({verificationMix.pending})</p>
              <div className="admin-progress-track tone-amber">
                <i style={{ width: `${verificationMix.pendingPct}%` }} />
              </div>
            </div>
            <div>
              <p>Needs Review ({verificationMix.needsReview})</p>
              <div className="admin-progress-track tone-blue">
                <i style={{ width: `${verificationMix.needsReviewPct}%` }} />
              </div>
            </div>
            <div>
              <p>Delisted ({verificationMix.delisted})</p>
              <div className="admin-progress-track">
                <i style={{ width: `${verificationMix.delistedPct}%` }} />
              </div>
            </div>
          </div>
        </article>

        <article className="admin-chart-card">
          <header>
            <h3>Risk Watchlist</h3>
            <span>Top complaint hotspots (last 30 days)</span>
          </header>
          <div className="admin-watchlist">
            {topComplaintHospitals.map((hospital) => (
              <section key={hospital.id}>
                <div>
                  <strong>{hospital.name}</strong>
                  <p>{hospital.cityZone}</p>
                </div>
                <div className="admin-watchlist-meta">
                  <StatusBadge
                    label={statusLabelFromKey(hospital.verificationStatus)}
                    tone={verificationTone[hospital.verificationStatus]}
                  />
                  <span>{rangeAdjustedComplaints(hospital.complaintsLast30Days)} complaints</span>
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </section>
  );

  const renderVerificationSection = () => (
    <section className="admin-content-surface" aria-label="Verification">
      <header className="admin-content-head">
        <h2>Hospital Verification Queue</h2>
        <p>Approve onboarding docs and control emergency routing eligibility.</p>
      </header>

      <div className="admin-table-wrap">
        <table className="admin-table" aria-label="Hospital verification table">
          <thead>
            <tr>
              <th>Hospital</th>
              <th>Zone</th>
              <th>Docs</th>
              <th>SLA</th>
              <th>Complaints</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hospitals.map((hospital) => (
              <tr key={hospital.id}>
                <td>
                  <div className="admin-entity">
                    <strong>{hospital.name}</strong>
                    <span>
                      {hospital.id} • Onboarded {formatDate(hospital.onboardedAt)}
                    </span>
                  </div>
                </td>
                <td>{hospital.cityZone}</td>
                <td>{hospital.docsCompletionPct}%</td>
                <td>{hospital.emergencySlaMinutes.toFixed(1)} min</td>
                <td>{hospital.complaintsLast30Days}</td>
                <td>
                  <StatusBadge
                    label={statusLabelFromKey(hospital.verificationStatus)}
                    tone={verificationTone[hospital.verificationStatus]}
                  />
                </td>
                <td>
                  <div className="admin-actions">
                    <button className="admin-btn admin-btn-primary" onClick={() => handleVerifyHospital(hospital.id)}>
                      Verify
                    </button>
                    <button className="admin-btn" onClick={() => handleMarkNeedsReview(hospital.id)}>
                      Review
                    </button>
                    <button className="admin-btn admin-btn-danger" onClick={() => handleToggleDelist(hospital.id)}>
                      {hospital.verificationStatus === 'delisted' ? 'Reinstate' : 'Delist'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderReviewsSection = () => (
    <section className="admin-content-surface" aria-label="Reviews">
      <header className="admin-content-head">
        <h2>User Review Watchlist</h2>
        <p>Prioritize complaints from WhatsApp, in-app, and call-center channels.</p>
      </header>

      <div className="admin-review-list">
        {reviews.map((review) => (
          <section key={review.id} className="admin-review-card">
            <header>
              <div>
                <strong>{review.id}</strong>
                <p>
                  {review.author} • {review.hospitalId} • {formatDate(review.postedAt)}
                </p>
              </div>
              <div className="admin-review-badges">
                <StatusBadge label={`${review.rating}/5`} tone={review.rating >= 4 ? 'success' : 'warning'} />
                <StatusBadge label={statusLabelFromKey(review.severity)} tone={severityTone[review.severity]} />
                <StatusBadge label={statusLabelFromKey(review.status)} tone={reviewTone[review.status]} />
              </div>
            </header>

            <p>{review.summary}</p>

            <footer>
              <span>Source: {statusLabelFromKey(review.source)}</span>
              <div className="admin-actions">
                <button
                  className="admin-btn"
                  onClick={() => handleReviewStatus(review.id, 'in_progress')}
                  disabled={review.status === 'in_progress' || review.status === 'resolved'}
                >
                  Take Case
                </button>
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => handleReviewStatus(review.id, 'resolved')}
                  disabled={review.status === 'resolved'}
                >
                  Mark Closed
                </button>
              </div>
            </footer>
          </section>
        ))}
      </div>
    </section>
  );

  const renderComplianceSection = () => (
    <section className="admin-content-surface" aria-label="Compliance">
      <header className="admin-content-head">
        <h2>Compliance & Delisting Controls</h2>
        <p>Apply restrictions for repeated safety or service quality failures.</p>
      </header>

      <div className="admin-flag-list">
        {flaggedHospitals.length === 0 ? (
          <p className="admin-empty">No flagged hospitals right now.</p>
        ) : (
          flaggedHospitals.map((hospital) => (
            <section key={hospital.id} className="admin-flag-item">
              <div>
                <strong>{hospital.name}</strong>
                <p>
                  {hospital.id} • {hospital.complaintsLast30Days} complaints in the last 30 days
                </p>
              </div>
              <div className="admin-flag-meta">
                <StatusBadge
                  label={statusLabelFromKey(hospital.verificationStatus)}
                  tone={verificationTone[hospital.verificationStatus]}
                />
                <button className="admin-btn admin-btn-danger" onClick={() => handleToggleDelist(hospital.id)}>
                  {hospital.verificationStatus === 'delisted' ? 'Undo Delist' : 'Delist Now'}
                </button>
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );

  const renderOpsSection = () => (
    <section className="admin-content-surface" aria-label="Operations feed">
      <header className="admin-content-head">
        <h2>Live Admin Activity Feed</h2>
        <p>Real-time trace of verification, moderation, and compliance actions.</p>
      </header>

      <div className="admin-ops-list">
        {activity.map((item) => (
          <article key={item.id} className="admin-ops-item">
            <div className="admin-ops-head">
              <StatusBadge label={statusLabelFromKey(item.type)} tone={item.type === 'system' ? 'neutral' : 'info'} />
              <time>{formatDate(item.at)}</time>
            </div>
            <p>{item.message}</p>
          </article>
        ))}
      </div>
    </section>
  );

  const sectionRenderer: Record<AdminSectionKey, () => ReturnType<typeof renderOverviewSection>> = {
    overview: renderOverviewSection,
    verification: renderVerificationSection,
    reviews: renderReviewsSection,
    compliance: renderComplianceSection,
    ops: renderOpsSection,
  };

  return (
    <main className="admin-panel">
      <section className="admin-header">
        <div className="admin-header-copy">
          <p className="admin-eyebrow">CodeRed Control Tower</p>
          <h1>Admin Operations Dashboard</h1>
          <p>
            Monitor platform reliability, verify hospitals, moderate user feedback, and enforce compliance decisions.
          </p>
        </div>

        <div className="admin-header-side">
          <StatusBadge label="Live Oversight" tone="success" />
          <p>
            {adminSession.name} • {adminSession.role}
          </p>
          <button type="button" className="admin-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </section>

      {adminNotice ? (
        <section className="admin-notice" role="status" aria-live="polite">
          <strong>Update:</strong> {adminNotice}
        </section>
      ) : null}

      <section className="admin-workspace-layout">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <p className="admin-sidebar-title">Sections</p>
          {(['overview', 'verification', 'reviews', 'compliance', 'ops'] as AdminSectionKey[]).map((sectionKey) => (
            <button
              key={sectionKey}
              type="button"
              className={activeSection === sectionKey ? 'admin-nav-btn active' : 'admin-nav-btn'}
              onClick={() => setActiveSection(sectionKey)}
            >
              <span>{sectionLabel[sectionKey]}</span>
              {sectionKey === 'verification' ? <strong>{metrics.pendingHospitals}</strong> : null}
              {sectionKey === 'reviews' ? <strong>{metrics.openReviews}</strong> : null}
              {sectionKey === 'compliance' ? <strong>{flaggedHospitals.length}</strong> : null}
            </button>
          ))}

          <div className="admin-sidebar-foot">
            <p>Signed in as</p>
            <strong>{adminSession.email}</strong>
            <span>Last login: {formatDate(adminSession.lastLoginAt)}</span>
          </div>
        </aside>

        <div className="admin-content">{sectionRenderer[activeSection]()}</div>
      </section>
    </main>
  );
}