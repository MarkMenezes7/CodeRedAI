import { useMemo, useState } from 'react';

import { StatusBadge } from '@shared/components/StatusBadge';
import { formatDate } from '@shared/utils/formatters';
import { AdminAuthPage, type AdminAuthState, type AdminSession } from '@modules/admin/pages/AdminAuthPage';
import { AdminSidebar } from '@modules/admin/components/AdminSidebar';
import './AdminPanel.css';

type VerificationStatus = 'pending' | 'verified' | 'needs_review' | 'rejected';
type ReviewStatus = 'open' | 'in_progress' | 'resolved';
type ReviewSeverity = 'low' | 'medium' | 'high';
type AdminSectionKey = 'overview' | 'verification' | 'reviews' | 'compliance' | 'ops';
type OverviewRange = 'today' | '7d' | '30d';

type HospitalDocumentKey =
  | 'registrationCertificate'
  | 'clinicalLicense'
  | 'nabhAccreditation'
  | 'doctorCredentials'
  | 'infrastructureProof'
  | 'fireSafetyCertificate'
  | 'biomedicalWasteLicense'
  | 'pharmacyLicense'
  | 'addressAndGpsProof';

interface HospitalDocument {
  uploaded: boolean;
  expiresOn: string | null;
  updatedAt: string;
}

interface AdminHospitalRecord {
  id: string;
  name: string;
  cityZone: string;
  onboardedAt: string;
  verificationStatus: VerificationStatus;
  licenseNumber: string;
  bedCount: number;
  icuCount: number;
  patientsLast30Days: number;
  complaintsLast30Days: number;
  emergencySlaMinutes: number;
  averageRating: number;
  hasInHousePharmacy: boolean;
  hasEmergencyDepartment: boolean;
  addressVerified: boolean;
  gpsMatched: boolean;
  documents: Record<HospitalDocumentKey, HospitalDocument>;
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

interface DocumentDefinition {
  key: HospitalDocumentKey;
  title: string;
  required: boolean;
  expiryTracked: boolean;
  optionalLabel?: string;
}

const STORAGE_KEY = 'codered-admin-auth-v1';
const LICENSE_PATTERN = /^CEA-[A-Z]{2,5}-\d{4}-\d{3,6}$/;

const documentDefinitions: DocumentDefinition[] = [
  {
    key: 'registrationCertificate',
    title: 'Hospital Registration Certificate',
    required: true,
    expiryTracked: false,
  },
  {
    key: 'clinicalLicense',
    title: 'Clinical Establishment License',
    required: true,
    expiryTracked: true,
  },
  {
    key: 'nabhAccreditation',
    title: 'NABH Accreditation',
    required: false,
    expiryTracked: true,
    optionalLabel: 'Optional but premium',
  },
  {
    key: 'doctorCredentials',
    title: 'Doctor & Staff Credentials',
    required: true,
    expiryTracked: false,
  },
  {
    key: 'infrastructureProof',
    title: 'Infrastructure Proof (Beds / ICU / Emergency)',
    required: true,
    expiryTracked: false,
  },
  {
    key: 'fireSafetyCertificate',
    title: 'Fire Safety Certificate',
    required: true,
    expiryTracked: true,
  },
  {
    key: 'biomedicalWasteLicense',
    title: 'Biomedical Waste Management License',
    required: true,
    expiryTracked: true,
  },
  {
    key: 'pharmacyLicense',
    title: 'Pharmacy License',
    required: false,
    expiryTracked: true,
    optionalLabel: 'Required if in-house pharmacy exists',
  },
  {
    key: 'addressAndGpsProof',
    title: 'Address & GPS Location Proof',
    required: true,
    expiryTracked: false,
  },
];

const initialHospitals: AdminHospitalRecord[] = [
  {
    id: 'HSP-MUM-001',
    name: 'Lilavati Hospital',
    cityZone: 'Bandra West',
    onboardedAt: '2026-03-10T09:05:00.000Z',
    verificationStatus: 'verified',
    licenseNumber: 'CEA-MH-2026-1102',
    bedCount: 323,
    icuCount: 56,
    patientsLast30Days: 870,
    complaintsLast30Days: 2,
    emergencySlaMinutes: 2.8,
    averageRating: 4.7,
    hasInHousePharmacy: true,
    hasEmergencyDepartment: true,
    addressVerified: true,
    gpsMatched: true,
    documents: {
      registrationCertificate: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-02-02T08:10:00.000Z',
      },
      clinicalLicense: {
        uploaded: true,
        expiresOn: '2027-02-18',
        updatedAt: '2026-02-02T08:10:00.000Z',
      },
      nabhAccreditation: {
        uploaded: true,
        expiresOn: '2027-07-30',
        updatedAt: '2026-02-04T10:00:00.000Z',
      },
      doctorCredentials: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-02-05T09:22:00.000Z',
      },
      infrastructureProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-02-05T09:22:00.000Z',
      },
      fireSafetyCertificate: {
        uploaded: true,
        expiresOn: '2026-12-14',
        updatedAt: '2026-02-07T10:21:00.000Z',
      },
      biomedicalWasteLicense: {
        uploaded: true,
        expiresOn: '2027-01-03',
        updatedAt: '2026-02-07T10:21:00.000Z',
      },
      pharmacyLicense: {
        uploaded: true,
        expiresOn: '2026-10-18',
        updatedAt: '2026-02-07T10:21:00.000Z',
      },
      addressAndGpsProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-02-08T12:30:00.000Z',
      },
    },
  },
  {
    id: 'HSP-MUM-004',
    name: 'Fortis Hospital Mulund',
    cityZone: 'Mulund West',
    onboardedAt: '2026-03-26T12:24:00.000Z',
    verificationStatus: 'pending',
    licenseNumber: 'CEA-MH-2026-2201',
    bedCount: 278,
    icuCount: 38,
    patientsLast30Days: 920,
    complaintsLast30Days: 5,
    emergencySlaMinutes: 3.4,
    averageRating: 4.3,
    hasInHousePharmacy: true,
    hasEmergencyDepartment: true,
    addressVerified: true,
    gpsMatched: true,
    documents: {
      registrationCertificate: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      clinicalLicense: {
        uploaded: true,
        expiresOn: '2026-05-07',
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      nabhAccreditation: {
        uploaded: false,
        expiresOn: null,
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      doctorCredentials: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      infrastructureProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      fireSafetyCertificate: {
        uploaded: true,
        expiresOn: '2026-05-22',
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      biomedicalWasteLicense: {
        uploaded: true,
        expiresOn: '2026-05-18',
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      pharmacyLicense: {
        uploaded: true,
        expiresOn: '2026-04-29',
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
      addressAndGpsProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-29T11:22:00.000Z',
      },
    },
  },
  {
    id: 'HSP-MUM-006',
    name: 'Nanavati Max Super Speciality',
    cityZone: 'Vile Parle West',
    onboardedAt: '2026-04-01T07:42:00.000Z',
    verificationStatus: 'needs_review',
    licenseNumber: 'INVALID-624',
    bedCount: 0,
    icuCount: 16,
    patientsLast30Days: 520,
    complaintsLast30Days: 12,
    emergencySlaMinutes: 4.2,
    averageRating: 3.9,
    hasInHousePharmacy: true,
    hasEmergencyDepartment: true,
    addressVerified: false,
    gpsMatched: false,
    documents: {
      registrationCertificate: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      clinicalLicense: {
        uploaded: true,
        expiresOn: '2025-12-30',
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      nabhAccreditation: {
        uploaded: false,
        expiresOn: null,
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      doctorCredentials: {
        uploaded: false,
        expiresOn: null,
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      infrastructureProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      fireSafetyCertificate: {
        uploaded: false,
        expiresOn: null,
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      biomedicalWasteLicense: {
        uploaded: true,
        expiresOn: '2026-06-11',
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      pharmacyLicense: {
        uploaded: false,
        expiresOn: null,
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
      addressAndGpsProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-04-01T08:12:00.000Z',
      },
    },
  },
  {
    id: 'HSP-MUM-010',
    name: 'Sion Hospital',
    cityZone: 'Sion',
    onboardedAt: '2026-03-30T10:13:00.000Z',
    verificationStatus: 'rejected',
    licenseNumber: 'CEA-MH-2026-2330',
    bedCount: 240,
    icuCount: 22,
    patientsLast30Days: 1210,
    complaintsLast30Days: 21,
    emergencySlaMinutes: 5.6,
    averageRating: 3.1,
    hasInHousePharmacy: false,
    hasEmergencyDepartment: true,
    addressVerified: true,
    gpsMatched: false,
    documents: {
      registrationCertificate: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      clinicalLicense: {
        uploaded: true,
        expiresOn: '2026-11-15',
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      nabhAccreditation: {
        uploaded: false,
        expiresOn: null,
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      doctorCredentials: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      infrastructureProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      fireSafetyCertificate: {
        uploaded: true,
        expiresOn: '2026-08-18',
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      biomedicalWasteLicense: {
        uploaded: true,
        expiresOn: '2026-08-26',
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      pharmacyLicense: {
        uploaded: false,
        expiresOn: null,
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
      addressAndGpsProof: {
        uploaded: true,
        expiresOn: null,
        updatedAt: '2026-03-31T09:18:00.000Z',
      },
    },
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
    message: 'Fortis Hospital Mulund is pending expiry checks for compliance certificates.',
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
    message: 'Sion Hospital remains rejected pending corrective infrastructure audit.',
  },
  {
    id: 'ACT-4',
    at: '2026-04-15T06:40:00.000Z',
    type: 'system',
    message: 'Daily verification risk model recalculated and synced.',
  },
];

const verificationTone: Record<VerificationStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  verified: 'success',
  needs_review: 'info',
  rejected: 'danger',
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

function isExpired(expiresOn: string | null) {
  if (!expiresOn) return false;
  return Date.parse(expiresOn) < Date.now();
}

function isExpiringSoon(expiresOn: string | null, days = 30) {
  if (!expiresOn) return false;
  const expiresAt = Date.parse(expiresOn);
  if (!Number.isFinite(expiresAt)) return false;
  const daysMs = days * 24 * 60 * 60 * 1000;
  return expiresAt >= Date.now() && expiresAt <= Date.now() + daysMs;
}

function hospitalRequiredDocuments(record: AdminHospitalRecord) {
  return documentDefinitions.filter((definition) => {
    if (definition.key === 'pharmacyLicense') {
      return record.hasInHousePharmacy;
    }
    return definition.required;
  });
}

function missingRequiredDocuments(record: AdminHospitalRecord) {
  return hospitalRequiredDocuments(record).filter((definition) => !record.documents[definition.key].uploaded);
}

function expiredRequiredDocuments(record: AdminHospitalRecord) {
  return hospitalRequiredDocuments(record).filter((definition) => isExpired(record.documents[definition.key].expiresOn));
}

function expiringSoonDocuments(record: AdminHospitalRecord) {
  return documentDefinitions.filter(
    (definition) => definition.expiryTracked && isExpiringSoon(record.documents[definition.key].expiresOn),
  );
}

function hospitalRiskFlags(record: AdminHospitalRecord) {
  const flags: string[] = [];

  if (missingRequiredDocuments(record).length > 0) {
    flags.push('Missing required verification documents');
  }

  if (expiredRequiredDocuments(record).length > 0) {
    flags.push('One or more mandatory certificates are expired');
  }

  if (!record.addressVerified || !record.gpsMatched) {
    flags.push('Address and GPS mismatch detected');
  }

  if (record.bedCount <= 0) {
    flags.push('Bed count not valid');
  }

  if (record.patientsLast30Days > Math.max(1, record.bedCount) * 30) {
    flags.push('Patient load significantly higher than bed capacity');
  }

  if (record.complaintsLast30Days >= 10) {
    flags.push('High complaint volume in last 30 days');
  }

  if (record.emergencySlaMinutes >= 4.5) {
    flags.push('Emergency SLA breach trend');
  }

  if (expiringSoonDocuments(record).length > 0) {
    flags.push('Certificates approaching expiry (<= 30 days)');
  }

  return flags;
}

function hospitalRiskScore(record: AdminHospitalRecord) {
  let score = 100;
  score -= missingRequiredDocuments(record).length * 12;
  score -= expiredRequiredDocuments(record).length * 14;
  score -= expiringSoonDocuments(record).length * 6;

  if (record.complaintsLast30Days >= 15) score -= 18;
  else if (record.complaintsLast30Days >= 8) score -= 10;

  if (record.patientsLast30Days > Math.max(1, record.bedCount) * 30) score -= 14;
  if (!record.addressVerified || !record.gpsMatched) score -= 16;
  if (record.emergencySlaMinutes > 4.5) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function documentCompletionPct(record: AdminHospitalRecord) {
  const required = hospitalRequiredDocuments(record);
  if (required.length === 0) return 100;
  const uploadedCount = required.filter((definition) => record.documents[definition.key].uploaded).length;
  return Math.round((uploadedCount / required.length) * 100);
}

function validateForVerification(record: AdminHospitalRecord) {
  const errors: string[] = [];

  const missing = missingRequiredDocuments(record);
  if (missing.length > 0) {
    errors.push(`Missing required documents: ${missing.map((item) => item.title).join(', ')}`);
  }

  const expired = expiredRequiredDocuments(record);
  if (expired.length > 0) {
    errors.push(`Expired mandatory certificates: ${expired.map((item) => item.title).join(', ')}`);
  }

  if (!LICENSE_PATTERN.test(record.licenseNumber.trim())) {
    errors.push('Clinical Establishment license number format is invalid (use CEA-STATE-YYYY-XXXX).');
  }

  if (record.bedCount <= 0) {
    errors.push('Bed count must be greater than 0.');
  }

  if (record.icuCount < 0 || record.icuCount > record.bedCount) {
    errors.push('ICU count must be between 0 and total bed count.');
  }

  if (!record.addressVerified || !record.gpsMatched) {
    errors.push('Address proof and GPS location must be verified and matched.');
  }

  if (!record.hasEmergencyDepartment) {
    errors.push('Emergency department availability must be confirmed.');
  }

  if (record.hasInHousePharmacy && !record.documents.pharmacyLicense.uploaded) {
    errors.push('Pharmacy license is required for hospitals with in-house pharmacy.');
  }

  return errors;
}

function severityTargetSlaHours(severity: ReviewSeverity) {
  if (severity === 'high') return 4;
  if (severity === 'medium') return 12;
  return 24;
}

export function AdminPanel() {
  const [adminAuth, setAdminAuth] = useState<AdminAuthState | null>(() => loadAdminSession());
  const [activeSection, setActiveSection] = useState<AdminSectionKey>('overview');
  const [overviewRange, setOverviewRange] = useState<OverviewRange>('7d');
  const [hospitals, setHospitals] = useState<AdminHospitalRecord[]>(initialHospitals);
  const [reviews, setReviews] = useState<UserReviewTicket[]>(initialReviewTickets);
  const [activity, setActivity] = useState<AdminActivity[]>(initialActivity);
  const [adminNotice, setAdminNotice] = useState<string>('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  const selectedIncidentSeries = incidentVolumeByRange[overviewRange];

  const hospitalById = useMemo(() => new Map(hospitals.map((hospital) => [hospital.id, hospital])), [hospitals]);

  const selectedHospital = useMemo(
    () => (selectedHospitalId ? hospitals.find((hospital) => hospital.id === selectedHospitalId) ?? null : null),
    [hospitals, selectedHospitalId],
  );

  const metrics = useMemo(() => {
    const verifiedHospitals = hospitals.filter((hospital) => hospital.verificationStatus === 'verified').length;
    const pendingHospitals = hospitals.filter((hospital) => hospital.verificationStatus === 'pending').length;
    const reviewHospitals = hospitals.filter((hospital) => hospital.verificationStatus === 'needs_review').length;
    const rejectedHospitals = hospitals.filter((hospital) => hospital.verificationStatus === 'rejected').length;
    const expiringCertificates = hospitals.reduce(
      (sum, hospital) => sum + expiringSoonDocuments(hospital).length,
      0,
    );
    const openReviews = reviews.filter((review) => review.status !== 'resolved').length;
    const highSeverityOpenReviews = reviews.filter(
      (review) => review.severity === 'high' && review.status !== 'resolved',
    ).length;
    const avgRiskScore =
      hospitals.reduce((sum, hospital) => sum + hospitalRiskScore(hospital), 0) / Math.max(1, hospitals.length);
    const avgSlaMinutes =
      hospitals.reduce((sum, hospital) => sum + hospital.emergencySlaMinutes, 0) / Math.max(hospitals.length, 1);
    return {
      verifiedHospitals,
      pendingHospitals,
      reviewHospitals,
      rejectedHospitals,
      expiringCertificates,
      openReviews,
      highSeverityOpenReviews,
      avgRiskScore,
      avgSlaMinutes,
    };
  }, [hospitals, reviews]);

  const flaggedHospitals = useMemo(
    () => hospitals.filter((hospital) => hospitalRiskFlags(hospital).length > 0 || hospital.verificationStatus !== 'verified'),
    [hospitals],
  );

  const topRiskHospitals = useMemo(
    () => [...hospitals].sort((a, b) => hospitalRiskScore(a) - hospitalRiskScore(b)).slice(0, 3),
    [hospitals],
  );

  const selectedValidationErrors = useMemo(
    () => (selectedHospital ? validateForVerification(selectedHospital) : []),
    [selectedHospital],
  );

  const selectedRiskFlags = useMemo(
    () => (selectedHospital ? hospitalRiskFlags(selectedHospital) : []),
    [selectedHospital],
  );

  const verificationSummary = useMemo(() => {
    const totalHospitals = hospitals.length;
    const docsMissingHospitals = hospitals.filter((hospital) => missingRequiredDocuments(hospital).length > 0).length;
    const expiryAlertHospitals = hospitals.filter((hospital) => expiringSoonDocuments(hospital).length > 0).length;
    const verificationPassRate = Math.round((metrics.verifiedHospitals / Math.max(1, totalHospitals)) * 100);
    return {
      totalHospitals,
      docsMissingHospitals,
      expiryAlertHospitals,
      verificationPassRate,
    };
  }, [hospitals, metrics.verifiedHospitals]);

  const reviewSummary = useMemo(() => {
    const total = Math.max(1, reviews.length);
    const escalated = reviews.filter((review) => review.severity === 'high' && review.status !== 'resolved').length;
    const resolved = reviews.filter((review) => review.status === 'resolved').length;
    const resolvedPct = Math.round((resolved / total) * 100);
    return {
      escalated,
      resolved,
      resolvedPct,
    };
  }, [reviews]);

  const complianceChecklist = useMemo(
    () => [
      {
        id: 'policy-1',
        title: 'License validity checks',
        detail: `${verificationSummary.expiryAlertHospitals} hospitals need certificate renewal follow-up.`,
        ok: verificationSummary.expiryAlertHospitals === 0,
      },
      {
        id: 'policy-2',
        title: 'Address and GPS consistency',
        detail: `${hospitals.filter((hospital) => !hospital.addressVerified || !hospital.gpsMatched).length} hospitals flagged.`,
        ok: hospitals.every((hospital) => hospital.addressVerified && hospital.gpsMatched),
      },
      {
        id: 'policy-3',
        title: 'Complaint escalation workflow',
        detail: `${reviewSummary.escalated} high-severity complaints still open.`,
        ok: reviewSummary.escalated === 0,
      },
      {
        id: 'policy-4',
        title: 'Document completeness',
        detail: `${verificationSummary.docsMissingHospitals} hospitals missing mandatory documents.`,
        ok: verificationSummary.docsMissingHospitals === 0,
      },
    ],
    [hospitals, reviewSummary.escalated, verificationSummary.docsMissingHospitals, verificationSummary.expiryAlertHospitals],
  );

  const addActivity = (message: string, type: AdminActivity['type']) => {
    setActivity((current) =>
      [
        {
          id: `ACT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          at: new Date().toISOString(),
          message,
          type,
        },
        ...current,
      ].slice(0, 24),
    );
  };

  const updateHospital = (hospitalId: string, updater: (record: AdminHospitalRecord) => AdminHospitalRecord) => {
    setHospitals((current) => current.map((hospital) => (hospital.id === hospitalId ? updater(hospital) : hospital)));
  };

  const handleVerifyHospital = (hospitalId: string) => {
    const candidate = hospitals.find((hospital) => hospital.id === hospitalId);
    if (!candidate) {
      return;
    }

    const errors = validateForVerification(candidate);
    if (errors.length > 0) {
      updateHospital(hospitalId, (hospital) => ({ ...hospital, verificationStatus: 'needs_review' }));
      const message = `Verification blocked for ${candidate.name}: ${errors[0]}`;
      setAdminNotice(message);
      addActivity(message, 'verification');
      return;
    }

    updateHospital(hospitalId, (hospital) => ({ ...hospital, verificationStatus: 'verified' }));
    const message = `Hospital ${candidate.name} has been verified and moved to live emergency routing.`;
    setAdminNotice(message);
    addActivity(message, 'verification');
  };

  const handleMarkNeedsReview = (hospitalId: string) => {
    updateHospital(hospitalId, (hospital) => ({ ...hospital, verificationStatus: 'needs_review' }));
    const hospital = hospitals.find((item) => item.id === hospitalId);
    const message = `${hospital?.name ?? hospitalId} moved to manual review queue.`;
    setAdminNotice(message);
    addActivity(message, 'verification');
  };

  const handleRejectHospital = (hospitalId: string) => {
    updateHospital(hospitalId, (hospital) => ({ ...hospital, verificationStatus: 'rejected' }));
    const hospital = hospitals.find((item) => item.id === hospitalId);
    const message = `${hospital?.name ?? hospitalId} has been rejected from active network routing.`;
    setAdminNotice(message);
    addActivity(message, 'compliance');
  };

  const handleReviewStatus = (reviewId: string, status: ReviewStatus) => {
    setReviews((current) => current.map((review) => (review.id === reviewId ? { ...review, status } : review)));
    const message = `Review ${reviewId} updated to ${statusLabelFromKey(status)}.`;
    setAdminNotice(message);
    addActivity(message, 'review');
  };

  const handleDocumentToggle = (hospitalId: string, key: HospitalDocumentKey) => {
    updateHospital(hospitalId, (hospital) => {
      const currentDoc = hospital.documents[key];
      return {
        ...hospital,
        documents: {
          ...hospital.documents,
          [key]: {
            ...currentDoc,
            uploaded: !currentDoc.uploaded,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const handleDocumentExpiryChange = (hospitalId: string, key: HospitalDocumentKey, expiresOn: string) => {
    updateHospital(hospitalId, (hospital) => ({
      ...hospital,
      documents: {
        ...hospital.documents,
        [key]: {
          ...hospital.documents[key],
          expiresOn: expiresOn || null,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const handleHospitalFieldChange = (
    hospitalId: string,
    field:
      | 'licenseNumber'
      | 'bedCount'
      | 'icuCount'
      | 'patientsLast30Days'
      | 'hasInHousePharmacy'
      | 'hasEmergencyDepartment'
      | 'addressVerified'
      | 'gpsMatched',
    value: string | boolean,
  ) => {
    updateHospital(hospitalId, (hospital) => {
      if (field === 'licenseNumber') {
        return { ...hospital, licenseNumber: String(value) };
      }

      if (field === 'hasInHousePharmacy' || field === 'hasEmergencyDepartment' || field === 'addressVerified' || field === 'gpsMatched') {
        return { ...hospital, [field]: Boolean(value) };
      }

      const numericValue = Number(value);
      return {
        ...hospital,
        [field]: Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0,
      };
    });
  };

  const handleAutofillSelectedHospital = () => {
    if (!selectedHospital) {
      return;
    }

    const nowIso = new Date().toISOString();

    updateHospital(selectedHospital.id, (hospital) => {
      const nextDocuments = { ...hospital.documents };
      for (const definition of hospitalRequiredDocuments(hospital)) {
        nextDocuments[definition.key] = {
          ...nextDocuments[definition.key],
          uploaded: true,
          updatedAt: nowIso,
          expiresOn:
            definition.expiryTracked && !nextDocuments[definition.key].expiresOn
              ? new Date(Date.now() + 220 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
              : nextDocuments[definition.key].expiresOn,
        };
      }

      return {
        ...hospital,
        documents: nextDocuments,
        licenseNumber: LICENSE_PATTERN.test(hospital.licenseNumber) ? hospital.licenseNumber : 'CEA-MH-2026-7788',
        bedCount: hospital.bedCount > 0 ? hospital.bedCount : 120,
        icuCount: hospital.icuCount > 0 ? hospital.icuCount : 18,
        addressVerified: true,
        gpsMatched: true,
      };
    });

    const message = `Pre-verification checklist auto-filled for ${selectedHospital.name}.`;
    setAdminNotice(message);
    addActivity(message, 'system');
  };

  const handleSelectHospital = (hospitalId: string) => {
    setSelectedHospitalId((current) => (current === hospitalId ? null : hospitalId));
  };

  const handleCloseVerificationPanel = () => {
    setSelectedHospitalId(null);
  };

  const handleAuthenticated = (session: AdminAuthState) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
    setAdminAuth(session);
    setAdminNotice(`Welcome back ${session.user.name}. Verification systems are now live.`);
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
          <h2>Healthcare Verification Operations</h2>
          <p>Real-world style governance for hospital onboarding and emergency readiness.</p>
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
          <span>{metrics.pendingHospitals + metrics.reviewHospitals} in queue</span>
        </article>
        <article className="admin-kpi-card">
          <p>Open Review Tickets</p>
          <strong>{metrics.openReviews}</strong>
          <span>{metrics.highSeverityOpenReviews} high severity</span>
        </article>
        <article className="admin-kpi-card">
          <p>Avg Emergency SLA</p>
          <strong>{metrics.avgSlaMinutes.toFixed(1)} min</strong>
          <span>Network-level emergency handoff latency</span>
        </article>
        <article className="admin-kpi-card">
          <p>Avg Risk Score</p>
          <strong>{metrics.avgRiskScore.toFixed(0)} / 100</strong>
          <span>{metrics.expiringCertificates} certificates expiring soon</span>
        </article>
      </div>

      <div className="admin-overview-strip">
        <article>
          <p>Needs Review</p>
          <strong>{metrics.reviewHospitals}</strong>
        </article>
        <article>
          <p>Rejected / Delisted</p>
          <strong>{metrics.rejectedHospitals}</strong>
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
            <span>Incoming emergency demand</span>
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
            <h3>Top Risk Hospitals</h3>
            <span>Complaint and compliance weighted</span>
          </header>
          <div className="admin-watchlist">
            {topRiskHospitals.map((hospital) => (
              <section key={hospital.id}>
                <div>
                  <strong>{hospital.name}</strong>
                  <p>
                    {hospital.id} • {hospital.cityZone}
                  </p>
                </div>
                <div className="admin-watchlist-meta">
                  <StatusBadge
                    label={statusLabelFromKey(hospital.verificationStatus)}
                    tone={verificationTone[hospital.verificationStatus]}
                  />
                  <span>Risk {hospitalRiskScore(hospital)}/100</span>
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
        <h2>Hospital Verification Desk</h2>
        <p>
          Admin validates registration, licenses, infrastructure, and address proof before enabling emergency routing.
        </p>
      </header>

      <div className="admin-verification-summary">
        <article>
          <p>Total onboarded</p>
          <strong>{verificationSummary.totalHospitals}</strong>
        </article>
        <article>
          <p>Verification pass rate</p>
          <strong>{verificationSummary.verificationPassRate}%</strong>
        </article>
        <article>
          <p>Missing required docs</p>
          <strong>{verificationSummary.docsMissingHospitals}</strong>
        </article>
        <article>
          <p>Expiry alerts</p>
          <strong>{verificationSummary.expiryAlertHospitals}</strong>
        </article>
      </div>

      <div className={selectedHospital ? 'admin-verification-layout with-panel' : 'admin-verification-layout'}>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-verification" aria-label="Hospital verification table">
            <thead>
              <tr>
                <th>Hospital</th>
                <th>License No.</th>
                <th>Beds / ICU</th>
                <th>Docs</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((hospital) => {
                const completion = documentCompletionPct(hospital);
                const riskScore = hospitalRiskScore(hospital);
                const rowSelected = selectedHospitalId === hospital.id;
                return (
                  <tr
                    key={hospital.id}
                    className={rowSelected ? 'is-selected admin-row-clickable' : 'admin-row-clickable'}
                    onClick={() => handleSelectHospital(hospital.id)}
                  >
                    <td>
                      <div className="admin-entity admin-select-row">
                        <strong>{hospital.name}</strong>
                        <span>
                          {hospital.id} • {hospital.cityZone}
                        </span>
                      </div>
                    </td>
                    <td>{hospital.licenseNumber || 'Not provided'}</td>
                    <td>
                      {hospital.bedCount} / {hospital.icuCount}
                    </td>
                    <td>
                      <span className="admin-doc-chip">{completion}% complete</span>
                    </td>
                    <td>
                      <span className={`admin-risk-chip tone-${riskScore < 60 ? 'danger' : riskScore < 80 ? 'warning' : 'success'}`}>
                        {riskScore}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        label={statusLabelFromKey(hospital.verificationStatus)}
                        tone={verificationTone[hospital.verificationStatus]}
                      />
                    </td>
                    <td>
                      <div className="admin-actions admin-actions-stack">
                        <button
                          type="button"
                          className="admin-btn admin-btn-primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleVerifyHospital(hospital.id);
                          }}
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          className="admin-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleMarkNeedsReview(hospital.id);
                          }}
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRejectHospital(hospital.id);
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside
          className={selectedHospital ? 'admin-verify-side is-open' : 'admin-verify-side'}
          aria-label="Selected hospital verification details"
          aria-hidden={!selectedHospital}
        >
          {selectedHospital ? (
            <>
              <header>
                <div>
                  <h3>{selectedHospital.name}</h3>
                  <p>
                    {selectedHospital.id} • Onboarded {formatDate(selectedHospital.onboardedAt)}
                  </p>
                </div>
                <button type="button" className="admin-verify-close" onClick={handleCloseVerificationPanel} aria-label="Close details panel">
                  x
                </button>
              </header>

              <section className="admin-field-grid">
                <label>
                  Clinical License Number
                  <input
                    type="text"
                    value={selectedHospital.licenseNumber}
                    onChange={(event) =>
                      handleHospitalFieldChange(selectedHospital.id, 'licenseNumber', event.target.value.toUpperCase())
                    }
                    placeholder="CEA-MH-2026-7788"
                  />
                </label>
                <label>
                  Beds
                  <input
                    type="number"
                    min={0}
                    value={selectedHospital.bedCount}
                    onChange={(event) => handleHospitalFieldChange(selectedHospital.id, 'bedCount', event.target.value)}
                  />
                </label>
                <label>
                  ICU Count
                  <input
                    type="number"
                    min={0}
                    value={selectedHospital.icuCount}
                    onChange={(event) => handleHospitalFieldChange(selectedHospital.id, 'icuCount', event.target.value)}
                  />
                </label>
                <label>
                  Patients (30d)
                  <input
                    type="number"
                    min={0}
                    value={selectedHospital.patientsLast30Days}
                    onChange={(event) =>
                      handleHospitalFieldChange(selectedHospital.id, 'patientsLast30Days', event.target.value)
                    }
                  />
                </label>
              </section>

              <section className="admin-toggle-row" aria-label="Hospital capability and location controls">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedHospital.hasEmergencyDepartment}
                    onChange={(event) =>
                      handleHospitalFieldChange(selectedHospital.id, 'hasEmergencyDepartment', event.target.checked)
                    }
                  />
                  Emergency department present
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedHospital.hasInHousePharmacy}
                    onChange={(event) =>
                      handleHospitalFieldChange(selectedHospital.id, 'hasInHousePharmacy', event.target.checked)
                    }
                  />
                  In-house pharmacy present
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedHospital.addressVerified}
                    onChange={(event) =>
                      handleHospitalFieldChange(selectedHospital.id, 'addressVerified', event.target.checked)
                    }
                  />
                  Address proof verified
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedHospital.gpsMatched}
                    onChange={(event) => handleHospitalFieldChange(selectedHospital.id, 'gpsMatched', event.target.checked)}
                  />
                  GPS location matched
                </label>
              </section>

              <section className="admin-doc-list" aria-label="Document uploads">
                <div className="admin-section-title-row">
                  <h4>Required Documents</h4>
                  <button type="button" className="admin-btn" onClick={handleAutofillSelectedHospital}>
                    Auto Fill
                  </button>
                </div>

                {documentDefinitions.map((definition) => {
                  const doc = selectedHospital.documents[definition.key];
                  const isRequired =
                    definition.required || (definition.key === 'pharmacyLicense' && selectedHospital.hasInHousePharmacy);

                  return (
                    <article key={definition.key} className="admin-doc-item">
                      <div>
                        <strong>{definition.title}</strong>
                        <p>
                          {isRequired ? 'Required' : definition.optionalLabel ?? 'Optional'} • Updated {formatDate(doc.updatedAt)}
                        </p>
                      </div>
                      <div className="admin-doc-actions">
                        <StatusBadge label={doc.uploaded ? 'Uploaded' : 'Missing'} tone={doc.uploaded ? 'success' : 'warning'} />
                        <button type="button" className="admin-btn" onClick={() => handleDocumentToggle(selectedHospital.id, definition.key)}>
                          {doc.uploaded ? 'Remove' : 'Upload'}
                        </button>
                      </div>
                      {definition.expiryTracked ? (
                        <label className="admin-expiry-input">
                          Expiry Date
                          <input
                            type="date"
                            value={doc.expiresOn ?? ''}
                            onChange={(event) =>
                              handleDocumentExpiryChange(selectedHospital.id, definition.key, event.target.value)
                            }
                          />
                        </label>
                      ) : null}
                    </article>
                  );
                })}
              </section>

              <section className="admin-validation-panel" aria-label="Verification checks">
                <h4>Verification Logic Checks</h4>
                {selectedValidationErrors.length === 0 ? (
                  <p className="admin-validation-ok">All mandatory checks passed. Hospital can be verified.</p>
                ) : (
                  <ul className="admin-bullet-list">
                    {selectedValidationErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}

                <h4>Risk Flags</h4>
                {selectedRiskFlags.length === 0 ? (
                  <p className="admin-validation-ok">No active risk flags.</p>
                ) : (
                  <ul className="admin-bullet-list">
                    {selectedRiskFlags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="admin-actions admin-actions-wide">
                <button className="admin-btn admin-btn-primary" onClick={() => handleVerifyHospital(selectedHospital.id)}>
                  Verify Selected
                </button>
                <button className="admin-btn" onClick={() => handleMarkNeedsReview(selectedHospital.id)}>
                  Mark Review
                </button>
                <button className="admin-btn admin-btn-danger" onClick={() => handleRejectHospital(selectedHospital.id)}>
                  Reject
                </button>
              </div>
            </>
          ) : (
            <div className="admin-verify-placeholder">
              <p>Select a hospital row to open verification details.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );

  const renderReviewsSection = () => (
    <section className="admin-content-surface" aria-label="Reviews">
      <header className="admin-content-head">
        <h2>User Review Watchlist</h2>
        <p>Prioritize complaints from WhatsApp, in-app, and call-center channels.</p>
      </header>

      <div className="admin-review-summary">
        <article>
          <p>Open escalations</p>
          <strong>{reviewSummary.escalated}</strong>
        </article>
        <article>
          <p>Resolution rate</p>
          <strong>{reviewSummary.resolvedPct}%</strong>
        </article>
      </div>

      <div className="admin-review-list">
        {reviews.map((review) => {
          const relatedHospital = hospitalById.get(review.hospitalId);
          return (
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

            <div className="admin-review-context">
              <span>
                Hospital: {relatedHospital?.name ?? review.hospitalId}
              </span>
              <span>
                Risk Score: {relatedHospital ? `${hospitalRiskScore(relatedHospital)}/100` : 'N/A'}
              </span>
              <span>
                Target closure: {severityTargetSlaHours(review.severity)} hours
              </span>
            </div>

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
          );
        })}
      </div>
    </section>
  );

  const renderComplianceSection = () => (
    <section className="admin-content-surface" aria-label="Compliance">
      <header className="admin-content-head">
        <h2>Compliance Monitoring & Risk Scoring</h2>
        <p>Continuous monitoring for complaints, over-capacity usage, and expiring licenses.</p>
      </header>

      <div className="admin-compliance-grid">
        {complianceChecklist.map((checkpoint) => (
          <article key={checkpoint.id} className="admin-compliance-card">
            <div>
              <strong>{checkpoint.title}</strong>
              <p>{checkpoint.detail}</p>
            </div>
            <StatusBadge label={checkpoint.ok ? 'In Control' : 'Needs Action'} tone={checkpoint.ok ? 'success' : 'warning'} />
          </article>
        ))}
      </div>

      <div className="admin-flag-list">
        {flaggedHospitals.length === 0 ? (
          <p className="admin-empty">No flagged hospitals right now.</p>
        ) : (
          flaggedHospitals.map((hospital) => {
            const riskFlags = hospitalRiskFlags(hospital);
            const expiringDocs = expiringSoonDocuments(hospital);
            return (
              <section key={hospital.id} className="admin-flag-item">
                <div>
                  <strong>{hospital.name}</strong>
                  <p>
                    {hospital.id} • Risk score {hospitalRiskScore(hospital)} / 100
                  </p>
                </div>

                <div className="admin-flag-meta">
                  <StatusBadge
                    label={statusLabelFromKey(hospital.verificationStatus)}
                    tone={verificationTone[hospital.verificationStatus]}
                  />
                  <button className="admin-btn admin-btn-danger" onClick={() => handleRejectHospital(hospital.id)}>
                    Reject / Delist
                  </button>
                </div>

                {riskFlags.length > 0 ? (
                  <ul className="admin-bullet-list admin-bullet-inline">
                    {riskFlags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                  </ul>
                ) : null}

                {expiringDocs.length > 0 ? (
                  <div className="admin-expiry-warning" role="status">
                    <strong>Expiry warning:</strong>{' '}
                    {expiringDocs.map((doc) => doc.title).join(', ')} will expire within 30 days.
                  </div>
                ) : null}
              </section>
            );
          })
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

      <div className="admin-ops-list admin-ops-timeline">
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
      <div className="admin-shell">
        <AdminSidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          counts={{
            verification: metrics.pendingHospitals + metrics.reviewHospitals,
            reviews: metrics.openReviews,
            compliance: flaggedHospitals.length,
          }}
          adminEmail={adminSession.email}
          lastLoginLabel={formatDate(adminSession.lastLoginAt)}
          onLogout={handleLogout}
        />

        <div className="admin-main-column">
          <section className="admin-header">
            <div className="admin-header-copy">
              <p className="admin-eyebrow">CodeRed Control Tower</p>
              <h1>Admin Verification Dashboard</h1>
              <p>
                Hospital verification in CodeRed AI is aligned to real-world healthcare compliance standards. The admin
                validates registration certificates, clinical licenses, infrastructure details, and optional NABH
                accreditation before hospitals receive emergency cases.
              </p>
            </div>

            <div className="admin-header-side">
              <StatusBadge label="Live Oversight" tone="success" />
              <p>
                {adminSession.name} • {adminSession.role}
              </p>
            </div>
          </section>

          {adminNotice ? (
            <section className="admin-notice" role="status" aria-live="polite">
              <strong>Update:</strong> {adminNotice}
            </section>
          ) : null}

          <section className="admin-content">{sectionRenderer[activeSection]()}</section>
        </div>
      </div>
    </main>
  );
}
