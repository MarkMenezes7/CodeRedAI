import { useEffect, useState } from 'react';

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
}

export function useLocation() {
  const [location, setLocation] = useState<LocationState>({
    latitude: null,
    longitude: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocation({
        latitude: null,
        longitude: null,
        loading: false,
        error: 'Geolocation is not supported in this browser.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          loading: false,
          error: null,
        });
      },
      (error) => {
        setLocation({
          latitude: null,
          longitude: null,
          loading: false,
          error: error.message,
        });
      },
    );
  }, []);

  return location;
}
