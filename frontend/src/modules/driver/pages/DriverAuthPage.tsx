import { FormEvent, useMemo, useState } from 'react';

import { useHospitalAuth } from '@shared/providers/AuthContext';
import './DriverAuthPage.css';

type AuthMode = 'login' | 'signup';

export function DriverAuthPage() {
  const {
    defaultDriverPassword,
    loginDriverUser,
    presetDriverEmails,
    signupDriverUser,
  } = useHospitalAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [driverName, setDriverName] = useState('');
  const [email, setEmail] = useState(presetDriverEmails[0] ?? 'driver1@gmail.com');
  const [password, setPassword] = useState(defaultDriverPassword || 'Password@123');
  const [confirmPassword, setConfirmPassword] = useState(defaultDriverPassword || 'Password@123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const credentialHint = useMemo(
    () => `Use driver1@gmail.com ... driver8@gmail.com with password ${defaultDriverPassword}.`,
    [defaultDriverPassword],
  );

  const redirectToDashboard = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '/driver-dashboard';
    }
  };

  const handleQuickFill = (candidateEmail: string) => {
    setEmail(candidateEmail);
    setPassword(defaultDriverPassword || 'Password@123');
    setConfirmPassword(defaultDriverPassword || 'Password@123');
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Email and password are required.');
      return;
    }

    if (mode === 'signup' && !driverName.trim()) {
      setErrorMessage('Driver name is required for signup.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('Password and confirm password do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await loginDriverUser(email, password);
      } else {
        await signupDriverUser(driverName, email, password);
      }
      redirectToDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="driver-auth-page">
      <section className="driver-auth-card" aria-label="Driver authentication">
        <p className="driver-auth-eyebrow">Driver Access</p>
        <h1>{mode === 'login' ? 'Login To Driver Console' : 'Create Driver Account'}</h1>
        <p className="driver-auth-subtitle">{credentialHint}</p>

        <div className="driver-auth-mode-switch" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => setMode('signup')}
          >
            Signup
          </button>
        </div>

        <form className="driver-auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' ? (
            <label>
              Driver Name
              <input
                type="text"
                value={driverName}
                onChange={(event) => setDriverName(event.target.value)}
                placeholder="Enter driver name"
                autoComplete="name"
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="driver1@gmail.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password@123"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {mode === 'signup' ? (
            <label>
              Confirm Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Password@123"
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}

          {errorMessage ? (
            <p className="driver-auth-toast" role="status">
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" className="driver-auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create And Continue'}
          </button>
        </form>

        <div className="driver-auth-presets">
          <p>Quick Fill Accounts</p>
          <div className="driver-auth-chip-grid">
            {presetDriverEmails.slice(0, 8).map((presetEmail) => (
              <button
                key={presetEmail}
                type="button"
                className="driver-auth-chip"
                onClick={() => handleQuickFill(presetEmail)}
              >
                {presetEmail}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
