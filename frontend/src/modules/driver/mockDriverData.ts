export type MissionStatus = 'Completed' | 'Ongoing' | 'Cancelled';
export type MissionPriority = 'Critical' | 'Urgent' | 'Normal';
export type PayoutStatus = 'Paid' | 'Pending';

export interface MissionTimelineEntry {
  label: string;
  at: string;
}

export interface DriverMissionRecord {
  missionId: string;
  createdAt: string;
  patientId: string;
  patientAge: number;
  patientGender: 'Male' | 'Female';
  chiefComplaint: string;
  pickupLocation: string;
  dropHospitalName: string;
  dropHospitalAddress: string;
  distanceKm: number;
  durationMin: number;
  status: MissionStatus;
  priority: MissionPriority;
  earningsInr: number;
  dispatcherNotes: string;
  goldenHourMet: boolean;
  responseTimeMin: number;
  payoutStatus: PayoutStatus;
  timeline: MissionTimelineEntry[];
}

export interface PayoutHistoryItem {
  id: string;
  date: string;
  amountInr: number;
  mode: 'Bank Transfer';
  status: PayoutStatus;
}

export const DRIVER_MISSIONS: DriverMissionRecord[] = [
  {
    missionId: 'MIS-2408',
    createdAt: '2026-04-15T10:12:00.000Z',
    patientId: 'PT-9012',
    patientAge: 61,
    patientGender: 'Female',
    chiefComplaint: 'Acute chest pain with heavy sweating',
    pickupLocation: 'Saki Naka junction, Andheri East',
    dropHospitalName: 'Seven Hills Hospital',
    dropHospitalAddress: 'Marol Maroshi Road, Andheri East, Mumbai 400059',
    distanceKm: 8.6,
    durationMin: 29,
    status: 'Completed',
    priority: 'Critical',
    earningsInr: 980,
    dispatcherNotes: 'Family shared ECG over WhatsApp. Keep cardiology alert active.',
    goldenHourMet: true,
    responseTimeMin: 11,
    payoutStatus: 'Paid',
    timeline: [
      { label: 'Dispatched', at: '10:12' },
      { label: 'Picked Up', at: '10:24' },
      { label: 'En Route', at: '10:27' },
      { label: 'Arrived', at: '10:41' },
    ],
  },
  {
    missionId: 'MIS-2407',
    createdAt: '2026-04-14T16:48:00.000Z',
    patientId: 'PT-9004',
    patientAge: 47,
    patientGender: 'Male',
    chiefComplaint: 'Road trauma with shoulder bleeding',
    pickupLocation: 'MIDC central road, Andheri East',
    dropHospitalName: 'Kokilaben Dhirubhai Ambani Hospital',
    dropHospitalAddress: 'Jai Prakash Road, Four Bungalows, Andheri West, Mumbai 400053',
    distanceKm: 11.2,
    durationMin: 37,
    status: 'Completed',
    priority: 'Urgent',
    earningsInr: 860,
    dispatcherNotes: 'Traffic diversion near JVLR. Use alternative route.',
    goldenHourMet: true,
    responseTimeMin: 13,
    payoutStatus: 'Paid',
    timeline: [
      { label: 'Dispatched', at: '16:48' },
      { label: 'Picked Up', at: '17:02' },
      { label: 'En Route', at: '17:06' },
      { label: 'Arrived', at: '17:25' },
    ],
  },
  {
    missionId: 'MIS-2406',
    createdAt: '2026-04-13T21:05:00.000Z',
    patientId: 'PT-8992',
    patientAge: 73,
    patientGender: 'Male',
    chiefComplaint: 'Breathing distress with wheezing',
    pickupLocation: 'Kurla West depot lane',
    dropHospitalName: 'P. D. Hinduja Hospital',
    dropHospitalAddress: 'SVS Road, Mahim West, Mumbai 400016',
    distanceKm: 14.1,
    durationMin: 45,
    status: 'Completed',
    priority: 'Critical',
    earningsInr: 1120,
    dispatcherNotes: 'Oxygen support prepared before pickup.',
    goldenHourMet: false,
    responseTimeMin: 19,
    payoutStatus: 'Pending',
    timeline: [
      { label: 'Dispatched', at: '21:05' },
      { label: 'Picked Up', at: '21:24' },
      { label: 'En Route', at: '21:30' },
      { label: 'Arrived', at: '21:50' },
    ],
  },
  {
    missionId: 'MIS-2405',
    createdAt: '2026-04-12T08:22:00.000Z',
    patientId: 'PT-8970',
    patientAge: 35,
    patientGender: 'Female',
    chiefComplaint: 'Seizure event reported at home',
    pickupLocation: 'Powai lake service road',
    dropHospitalName: 'Nanavati Hospital',
    dropHospitalAddress: 'SV Road, Vile Parle West, Mumbai 400057',
    distanceKm: 10.4,
    durationMin: 34,
    status: 'Completed',
    priority: 'Urgent',
    earningsInr: 790,
    dispatcherNotes: 'Patient conscious but disoriented. Keep neuro team informed.',
    goldenHourMet: true,
    responseTimeMin: 12,
    payoutStatus: 'Paid',
    timeline: [
      { label: 'Dispatched', at: '08:22' },
      { label: 'Picked Up', at: '08:35' },
      { label: 'En Route', at: '08:38' },
      { label: 'Arrived', at: '08:56' },
    ],
  },
  {
    missionId: 'MIS-2404',
    createdAt: '2026-04-10T13:40:00.000Z',
    patientId: 'PT-8941',
    patientAge: 52,
    patientGender: 'Male',
    chiefComplaint: 'High fever with confusion',
    pickupLocation: 'Chakala metro exit gate',
    dropHospitalName: 'Karuna Hospital',
    dropHospitalAddress: 'SVP Road, Dahisar West, Mumbai 400103',
    distanceKm: 24.8,
    durationMin: 62,
    status: 'Cancelled',
    priority: 'Normal',
    earningsInr: 0,
    dispatcherNotes: 'Mission cancelled by hospital due nearby unit takeover.',
    goldenHourMet: false,
    responseTimeMin: 9,
    payoutStatus: 'Pending',
    timeline: [
      { label: 'Dispatched', at: '13:40' },
      { label: 'Picked Up', at: '13:52' },
      { label: 'En Route', at: '13:54' },
      { label: 'Arrived', at: 'Cancelled' },
    ],
  },
  {
    missionId: 'MIS-2403',
    createdAt: '2026-04-09T19:18:00.000Z',
    patientId: 'PT-8910',
    patientAge: 66,
    patientGender: 'Female',
    chiefComplaint: 'Stroke warning signs and slurred speech',
    pickupLocation: 'Marol naka east lane',
    dropHospitalName: 'Breach Candy Hospital',
    dropHospitalAddress: 'Bhulabhai Desai Road, Cumballa Hill, Mumbai 400026',
    distanceKm: 20.6,
    durationMin: 54,
    status: 'Completed',
    priority: 'Critical',
    earningsInr: 1240,
    dispatcherNotes: 'High-priority neuro triage requested before arrival.',
    goldenHourMet: true,
    responseTimeMin: 10,
    payoutStatus: 'Pending',
    timeline: [
      { label: 'Dispatched', at: '19:18' },
      { label: 'Picked Up', at: '19:31' },
      { label: 'En Route', at: '19:33' },
      { label: 'Arrived', at: '20:12' },
    ],
  },
  {
    missionId: 'MIS-2402',
    createdAt: '2026-04-16T09:05:00.000Z',
    patientId: 'PT-9044',
    patientAge: 42,
    patientGender: 'Male',
    chiefComplaint: 'Severe abdominal pain and vomiting',
    pickupLocation: 'Andheri station east, platform road',
    dropHospitalName: 'Seven Hills Hospital',
    dropHospitalAddress: 'Marol Maroshi Road, Andheri East, Mumbai 400059',
    distanceKm: 6.9,
    durationMin: 0,
    status: 'Ongoing',
    priority: 'Urgent',
    earningsInr: 0,
    dispatcherNotes: 'Patient vitals unstable. Keep transport priority high.',
    goldenHourMet: false,
    responseTimeMin: 8,
    payoutStatus: 'Pending',
    timeline: [
      { label: 'Dispatched', at: '09:05' },
      { label: 'Picked Up', at: 'Pending' },
      { label: 'En Route', at: 'Pending' },
      { label: 'Arrived', at: 'Pending' },
    ],
  },
  {
    missionId: 'MIS-2401',
    createdAt: '2026-04-08T11:52:00.000Z',
    patientId: 'PT-8887',
    patientAge: 29,
    patientGender: 'Female',
    chiefComplaint: 'Diabetic collapse in office lobby',
    pickupLocation: 'Airport cargo signal, Sahar road',
    dropHospitalName: 'Lilavati Hospital and Research Centre',
    dropHospitalAddress: 'KC Marg, Bandra Reclamation, Bandra West, Mumbai 400050',
    distanceKm: 15.3,
    durationMin: 49,
    status: 'Completed',
    priority: 'Normal',
    earningsInr: 730,
    dispatcherNotes: 'Patient regained partial consciousness before handover.',
    goldenHourMet: true,
    responseTimeMin: 14,
    payoutStatus: 'Paid',
    timeline: [
      { label: 'Dispatched', at: '11:52' },
      { label: 'Picked Up', at: '12:08' },
      { label: 'En Route', at: '12:12' },
      { label: 'Arrived', at: '12:41' },
    ],
  },
];

export const MISSIONS_PER_WEEK = [
  { week: 'W1', missions: 4 },
  { week: 'W2', missions: 5 },
  { week: 'W3', missions: 3 },
  { week: 'W4', missions: 6 },
  { week: 'W5', missions: 5 },
  { week: 'W6', missions: 7 },
];

export const RESPONSE_TIME_TREND = [
  { week: 'W1', minutes: 16 },
  { week: 'W2', minutes: 14 },
  { week: 'W3', minutes: 15 },
  { week: 'W4', minutes: 13 },
  { week: 'W5', minutes: 12 },
  { week: 'W6', minutes: 11 },
];

export const EARNINGS_PER_WEEK = [
  { week: 'Week 1', amount: 4200 },
  { week: 'Week 2', amount: 5180 },
  { week: 'Week 3', amount: 4830 },
  { week: 'Week 4', amount: 5620 },
  { week: 'Week 5', amount: 5070 },
  { week: 'Week 6', amount: 6240 },
  { week: 'Week 7', amount: 5980 },
  { week: 'Week 8', amount: 6410 },
];

export const EARNINGS_PER_MONTH = [
  { month: 'Nov', amount: 18200 },
  { month: 'Dec', amount: 20540 },
  { month: 'Jan', amount: 21460 },
  { month: 'Feb', amount: 19820 },
  { month: 'Mar', amount: 22890 },
  { month: 'Apr', amount: 23940 },
];

export const PAYOUT_HISTORY: PayoutHistoryItem[] = [
  {
    id: 'PAY-118',
    date: '2026-04-10T12:30:00.000Z',
    amountInr: 4850,
    mode: 'Bank Transfer',
    status: 'Paid',
  },
  {
    id: 'PAY-117',
    date: '2026-04-03T12:15:00.000Z',
    amountInr: 5120,
    mode: 'Bank Transfer',
    status: 'Paid',
  },
  {
    id: 'PAY-116',
    date: '2026-03-27T12:20:00.000Z',
    amountInr: 5390,
    mode: 'Bank Transfer',
    status: 'Paid',
  },
  {
    id: 'PAY-119',
    date: '2026-04-17T12:20:00.000Z',
    amountInr: 3620,
    mode: 'Bank Transfer',
    status: 'Pending',
  },
];
