import { useEffect, useMemo, useState } from 'react';

import {
  createCarAccidentAlert,
  listCarAccidentAlerts,
  type CarAccidentAlert,
} from '@shared/utils/carAccidentApi';
import './CarSitePage.css';

type LocationStatus = 'idle' | 'loading' | 'ready' | 'error';

type Severity = 'critical' | 'high' | 'moderate' | 'low';

type CapturedLocation = {
  lat: number;
  lng: number;
  accuracyMeters: number;
};

const severityPool: Severity[] = ['high', 'critical', 'moderate'];

const CAR_PRESET_DATA: Record<
  string,
  {
    carName: string;
    carModel: string;
    personName: string;
    personPhone: string;
  }
> = {
  'Honda City': { carName: 'Honda', carModel: 'City', personName: 'Rohan Mehta', personPhone: '+91 98765 11001' },
  'Maruti Suzuki Swift': {
    carName: 'Maruti Suzuki',
    carModel: 'Swift',
    personName: 'Neha Sharma',
    personPhone: '+91 98765 11002',
  },
  'Hyundai i20': { carName: 'Hyundai', carModel: 'i20', personName: 'Aman Patel', personPhone: '+91 98765 11003' },
  'Tata Nexon': { carName: 'Tata', carModel: 'Nexon', personName: 'Priya Nair', personPhone: '+91 98765 11004' },
  'Mahindra XUV700': {
    carName: 'Mahindra',
    carModel: 'XUV700',
    personName: 'Vikram Singh',
    personPhone: '+91 98765 11005',
  },
  'Kia Seltos': { carName: 'Kia', carModel: 'Seltos', personName: 'Isha Kapoor', personPhone: '+91 98765 11006' },
  'Toyota Innova Hycross': {
    carName: 'Toyota',
    carModel: 'Innova Hycross',
    personName: 'Sandeep Rao',
    personPhone: '+91 98765 11007',
  },
  'Skoda Slavia': { carName: 'Skoda', carModel: 'Slavia', personName: 'Meera Joshi', personPhone: '+91 98765 11008' },
  'Volkswagen Virtus': {
    carName: 'Volkswagen',
    carModel: 'Virtus',
    personName: 'Arjun Das',
    personPhone: '+91 98765 11009',
  },
  'Renault Kiger': { carName: 'Renault', carModel: 'Kiger', personName: 'Karan Bedi', personPhone: '+91 98765 11010' },
};

const carModelOptions = Object.keys(CAR_PRESET_DATA);

function formatStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

function randomSeverity(): Severity {
  return severityPool[Math.floor(Math.random() * severityPool.length)] ?? 'high';
}

function describeGeoError(error: unknown) {
  const geoError = error as GeolocationPositionError | null;
  if (!geoError || typeof geoError.code !== 'number') {
    return 'Could not capture current location. Please retry.';
  }

  if (geoError.code === geoError.PERMISSION_DENIED) {
    return 'Location access denied. Allow permission and activate airbags again.';
  }

  if (geoError.code === geoError.TIMEOUT) {
    return 'Location request timed out. Activate airbags again.';
  }

  return 'Could not capture current location. Please retry.';
}

export default function CarSitePage() {
  const [selectedModel, setSelectedModel] = useState('');
  const [personName, setPersonName] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationMessage, setLocationMessage] = useState(
    'Location feed idle. GPS coordinates will appear after airbag activation.',
  );
  const [dispatchMessage, setDispatchMessage] = useState(
    'Waiting for action. Select a car model, activate airbags, then send emergency alert.',
  );
  const [alerts, setAlerts] = useState<CarAccidentAlert[]>([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPreset = useMemo(() => CAR_PRESET_DATA[selectedModel], [selectedModel]);

  const canSend = Boolean(selectedPreset && location && locationStatus === 'ready' && !isSubmitting);

  const captureCurrentLocation = () =>
    new Promise<CapturedLocation>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported in this browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
            accuracyMeters: Math.max(0, Math.round(position.coords.accuracy || 0)),
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        },
      );
    });

  const refreshAlerts = async () => {
    setIsLoadingAlerts(true);
    try {
      const latest = await listCarAccidentAlerts(40);
      setAlerts(latest);
    } catch (error) {
      setDispatchMessage(error instanceof Error ? error.message : 'Unable to load alert feed.');
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  useEffect(() => {
    void refreshAlerts();

    const intervalId = window.setInterval(() => {
      void refreshAlerts();
    }, 12_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setLocation(null);

    if (!model) {
      setPersonName('');
      setPersonPhone('');
      setLocationStatus('idle');
      setLocationMessage('Location feed idle. GPS coordinates will appear after airbag activation.');
      setDispatchMessage(
        'Waiting for action. Select a car model, activate airbags, then send emergency alert.',
      );
      return;
    }

    const preset = CAR_PRESET_DATA[model];
    setPersonName(preset.personName);
    setPersonPhone(preset.personPhone);
    setLocationStatus('idle');
    setLocationMessage('Location pending. Click Activate Airbags to capture current GPS.');
    setDispatchMessage('Vehicle selected. Activate airbags to capture location.');
  };

  const handleActivateAirbags = async () => {
    if (!selectedPreset) {
      setDispatchMessage('Select a car model first.');
      return;
    }

    setLocation(null);
    setLocationStatus('loading');
    setLocationMessage('Capturing current location. Please allow location access.');

    try {
      const nextLocation = await captureCurrentLocation();
      setLocation({ lat: nextLocation.lat, lng: nextLocation.lng });
      setLocationStatus('ready');
      setLocationMessage(
        `Location captured: Lat ${nextLocation.lat.toFixed(6)}, Lng ${nextLocation.lng.toFixed(6)} (Accuracy ±${nextLocation.accuracyMeters}m)`,
      );
      setDispatchMessage('Airbags activated. Live GPS locked and ready for dispatch.');
    } catch (error) {
      setLocation(null);
      setLocationStatus('error');
      setLocationMessage(describeGeoError(error));
      setDispatchMessage('GPS capture failed. Please try again.');
    }
  };

  const handleSendAlert = async () => {
    if (!selectedPreset) {
      setDispatchMessage('Select a car model first.');
      return;
    }

    setIsSubmitting(true);
    let dispatchLocation = location;

    setDispatchMessage('Refreshing live GPS before sending alert...');

    try {
      const liveLocation = await captureCurrentLocation();
      dispatchLocation = { lat: liveLocation.lat, lng: liveLocation.lng };
      setLocation(dispatchLocation);
      setLocationStatus('ready');
      setLocationMessage(
        `Location captured: Lat ${liveLocation.lat.toFixed(6)}, Lng ${liveLocation.lng.toFixed(6)} (Accuracy ±${liveLocation.accuracyMeters}m)`,
      );
    } catch (error) {
      if (!dispatchLocation) {
        setLocationStatus('error');
        setLocationMessage(describeGeoError(error));
        setDispatchMessage('Unable to capture current GPS. Activate airbags and try again.');
        setIsSubmitting(false);
        return;
      }

      setDispatchMessage('Live GPS refresh failed. Using last captured location for this alert.');
    }

    try {
      const created = await createCarAccidentAlert({
        carName: selectedPreset.carName,
        carModel: selectedPreset.carModel,
        personName: personName.trim() || selectedPreset.personName,
        personPhone: personPhone.trim() || selectedPreset.personPhone,
        lat: dispatchLocation.lat,
        lng: dispatchLocation.lng,
        severity: randomSeverity(),
        airbagsActivated: true,
        notes: 'Created from integrated car site in frontend module.',
      });

      setAlerts((previous) => [created.alert, ...previous.filter((item) => item.id !== created.alert.id)].slice(0, 50));
      setDispatchMessage(
        `${created.message} Location used: ${dispatchLocation.lat.toFixed(6)}, ${dispatchLocation.lng.toFixed(6)}.`,
      );
      setLocation(null);
      setLocationStatus('idle');
      setLocationMessage('Location pending. Click Activate Airbags to capture current GPS.');
    } catch (error) {
      setDispatchMessage(error instanceof Error ? error.message : 'Unable to create emergency alert.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="car-site-page">
      <section className="car-site-hero">
        <p className="car-site-eyebrow">Integrated Car Emergency Site</p>
        <h1>Car Accident Auto-Alert Workflow</h1>
        <p>
          This module now runs inside your main frontend and saves every crash alert in MongoDB.
        </p>
        <div className="car-site-hero-actions">
          <a className="car-site-link" href="#/original">Open Original Site</a>
          <a className="car-site-link ghost" href="#/hospital-dashboard">Open Hospital Dashboard</a>
        </div>
      </section>

      <section className="car-site-grid">
        <article className="car-card">
          <div className="car-card-head">
            <h2>Accident Trigger Console</h2>
            <span>MongoDB Connected</span>
          </div>

          <label>
            Car Model
            <select value={selectedModel} onChange={(event) => handleModelChange(event.target.value)}>
              <option value="">Choose a vehicle...</option>
              {carModelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Person Name
            <input
              type="text"
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Enter person name"
            />
          </label>

          <label>
            Person Phone
            <input
              type="text"
              value={personPhone}
              onChange={(event) => setPersonPhone(event.target.value)}
              placeholder="Enter person phone"
            />
          </label>

          <p className={`status-line status-${locationStatus}`}>{locationMessage}</p>
          <p className="status-line status-dispatch">{dispatchMessage}</p>

          <div className="car-card-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleActivateAirbags}
              disabled={!selectedPreset || locationStatus === 'loading'}
            >
              {locationStatus === 'loading' ? 'Capturing GPS...' : 'Activate Airbags'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSendAlert}
              disabled={!canSend}
            >
              {isSubmitting ? 'Sending Alert...' : 'Send Emergency Alert'}
            </button>
          </div>
        </article>

        <article className="car-card">
          <div className="car-card-head">
            <h2>Live Database Feed</h2>
            <span>{isLoadingAlerts ? 'Refreshing...' : `${alerts.length} record(s)`}</span>
          </div>

          {alerts.length === 0 ? (
            <p className="empty-message">No car accident alerts in database yet.</p>
          ) : (
            <div className="alert-feed-grid">
              <section className="alert-feed-column">
                <h3>Hospital Alert Feed</h3>
                <div className="alert-list">
                  {alerts.slice(0, 20).map((alert) => (
                    <article className="alert-item" key={`hospital-${alert.id}`}>
                      <strong>{alert.carName} {alert.carModel}</strong>
                      <p>{alert.personName} · {alert.personPhone}</p>
                      <p>Location: {alert.lat.toFixed(5)}, {alert.lng.toFixed(5)}</p>
                      <p>Hospitals Notified: {alert.notifiedHospitalIds.length}</p>
                      <p className="stamp">{formatStamp(alert.createdAt)}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="alert-feed-column">
                <h3>Driver Dispatch Feed</h3>
                <div className="alert-list">
                  {alerts.slice(0, 20).map((alert) => (
                    <article className="alert-item" key={`driver-${alert.id}`}>
                      <strong>{alert.carName} {alert.carModel}</strong>
                      <p>Person: {alert.personName}</p>
                      <p>Severity: {alert.severity.toUpperCase()}</p>
                      <p>Drivers Notified: {alert.notifiedDriverIds.length}</p>
                      <p className="stamp">{formatStamp(alert.createdAt)}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
