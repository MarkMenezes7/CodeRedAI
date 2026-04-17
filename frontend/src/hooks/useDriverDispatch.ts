import { useCallback, useEffect, useState } from 'react';
import {
  ActiveMission,
  DriverOfferActionPayload,
  DriverOfferItem,
  MissionStatusUpdate,
  acceptDriverOffer as apiAcceptDriverOffer,
  fetchActiveMission,
  fetchDriverOffers,
  rejectDriverOffer as apiRejectDriverOffer,
  updateMissionStatus as apiUpdateMissionStatus,
} from '../modules/shared/utils/driverOpsApi';

export interface UseDriverDispatchResult {
  pendingOffers: DriverOfferItem[];
  activeMission: ActiveMission | null;
  isLoading: boolean;
  error: string | null;
  refreshOffers: () => Promise<void>;
  refreshMission: () => Promise<void>;
  acceptOffer: (emergencyId: string, offerId: string) => Promise<{ success: boolean; message: string }>;
  rejectOffer: (emergencyId: string, offerId: string) => Promise<{ success: boolean; message: string }>;
  updateStatus: (emergencyId: string, newStatus: string, lat?: number, lng?: number) => Promise<{ success: boolean; message: string }>;
}

export function useDriverDispatch(driverId: string | undefined): UseDriverDispatchResult {
  const [pendingOffers, setPendingOffers] = useState<DriverOfferItem[]>([]);
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    if (!driverId) {
      setPendingOffers([]);
      return;
    }
    try {
      const result = await fetchDriverOffers(driverId);
      if (result.success) {
        setPendingOffers(result.offers);
      }
    } catch (err) {
      // Ignore background polling errors so UI doesn't bounce
    }
  }, [driverId]);

  const fetchMission = useCallback(async () => {
    if (!driverId) {
      setActiveMission(null);
      return;
    }
    try {
      const result = await fetchActiveMission(driverId);
      if (result.success) {
        // Prevent unnecessary state updates if data hasn't structurally changed
        setActiveMission(prev => {
           if (prev && result.mission && prev.status === result.mission.status && prev.emergency_id === result.mission.emergency_id && prev.patient_lat === result.mission.patient_lat && prev.patient_lng === result.mission.patient_lng) {
              return prev; // keep stable reference if identical core data
           }
           return result.mission;
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch mission');
    } finally {
      setIsLoading(false);
    }
  }, [driverId]);

  // Polling logic
  useEffect(() => {
    if (!driverId) return;

    // Initial fetch
    void fetchOffers();
    void fetchMission();

    // Poll every 5s
    const intervalId = setInterval(() => {
      void fetchOffers();
      void fetchMission();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [driverId, fetchOffers, fetchMission]);

  const acceptOffer = async (emergencyId: string, offerId: string) => {
    if (!driverId) return { success: false, message: 'Driver not logged in' };
    
    try {
      const payload: DriverOfferActionPayload = { driver_id: driverId, emergency_id: emergencyId, offer_id: offerId };
      const response = await apiAcceptDriverOffer(payload);
      
      // Update local state immediately
      setPendingOffers(offers => offers.filter(o => o.offer_id !== offerId));
      await fetchMission();
      
      return response;
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to accept offer' };
    }
  };

  const rejectOffer = async (emergencyId: string, offerId: string) => {
    if (!driverId) return { success: false, message: 'Driver not logged in' };
    
    try {
      const payload: DriverOfferActionPayload = { driver_id: driverId, emergency_id: emergencyId, offer_id: offerId };
      const response = await apiRejectDriverOffer(payload);
      
      // Update local state immediately
      setPendingOffers(offers => offers.filter(o => o.offer_id !== offerId));
      
      return response;
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to reject offer' };
    }
  };

  const updateStatus = async (emergencyId: string, newStatus: string, lat?: number, lng?: number) => {
    if (!driverId) return { success: false, message: 'Driver not logged in' };
    
    try {
      const payload: MissionStatusUpdate = {
        driver_id: driverId,
        emergency_id: emergencyId,
        status: newStatus,
        lat,
        lng
      };
      
      const response = await apiUpdateMissionStatus(payload);
      await fetchMission(); // Refresh mission data after status change
      
      return response;
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to update mission status' };
    }
  };

  return {
    pendingOffers,
    activeMission,
    isLoading,
    error,
    refreshOffers: fetchOffers,
    refreshMission: fetchMission,
    acceptOffer,
    rejectOffer,
    updateStatus,
  };
}
