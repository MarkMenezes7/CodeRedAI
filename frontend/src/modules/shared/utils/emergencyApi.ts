import { apiRequest } from './api';

export interface PendingEmergencyItem {
  emergencyId: string;
  phoneNumber: string;
  address: string;
  emergencyType: string;
  severity: string;
  createdAt?: string;
  notifiedHospitals: string[];
}

interface BackendPendingEmergencyItem {
  emergency_id: string;
  phone_number: string;
  address: string;
  emergency_type: string;
  severity: string;
  created_at?: string;
  notified_hospitals?: string[];
}

interface BackendPendingEmergenciesResponse {
  success: boolean;
  count: number;
  emergencies: BackendPendingEmergencyItem[];
}

interface BackendHospitalActionResponse {
  success: boolean;
  message: string;
}

function mapPendingEmergency(item: BackendPendingEmergencyItem): PendingEmergencyItem {
  return {
    emergencyId: item.emergency_id,
    phoneNumber: item.phone_number,
    address: item.address,
    emergencyType: item.emergency_type,
    severity: item.severity,
    createdAt: item.created_at,
    notifiedHospitals: Array.isArray(item.notified_hospitals) ? item.notified_hospitals : [],
  };
}

export async function listHospitalPendingEmergencies(hospitalId?: string): Promise<PendingEmergencyItem[]> {
  const query = hospitalId ? `?hospital_id=${encodeURIComponent(hospitalId)}` : '';
  const response = await apiRequest<BackendPendingEmergenciesResponse>(`/api/hospital/pending${query}`);
  return Array.isArray(response.emergencies) ? response.emergencies.map(mapPendingEmergency) : [];
}

export async function acceptHospitalEmergency(params: {
  hospitalId: string;
  emergencyId: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await apiRequest<BackendHospitalActionResponse>('/api/hospital/accept', {
    method: 'POST',
    body: JSON.stringify({
      hospital_id: params.hospitalId,
      emergency_id: params.emergencyId,
    }),
  });

  return {
    success: response.success,
    message: response.message,
  };
}

export async function rejectHospitalEmergency(params: {
  hospitalId: string;
  emergencyId: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await apiRequest<BackendHospitalActionResponse>('/api/hospital/reject', {
    method: 'POST',
    body: JSON.stringify({
      hospital_id: params.hospitalId,
      emergency_id: params.emergencyId,
    }),
  });

  return {
    success: response.success,
    message: response.message,
  };
}
