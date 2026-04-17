import { FormEvent, useMemo, useState } from 'react';

import { useHospitalAuth } from '@shared/providers/AuthContext';
import './HospitalAuthPage.css';

type AuthMode = 'login' | 'signup';

export function HospitalAuthPage() {
  const {
    defaultHospitalPassword,
    loginHospitalUser,
    presetHospitalEmails,
    signupHospitalUser,
  } = useHospitalAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [hospitalName, setHospitalName] = useState('');
  const [email, setEmail] = useState(presetHospitalEmails[0] ?? 'hospital1@gmail.com');
  const [password, setPassword] = useState(defaultHospitalPassword || 'Password@123');
  const [confirmPassword, setConfirmPassword] = useState(defaultHospitalPassword || 'Password@123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const credentialHint = useMemo(
    () => `Use hospital1@gmail.com ... hospital10@gmail.com with password ${defaultHospitalPassword}.`,
    [defaultHospitalPassword],
  );

  const redirectToDashboard = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '/hospital-dashboard';
    }
  };

  const handleQuickFill = (candidateEmail: string) => {
    setEmail(candidateEmail);
    setPassword(defaultHospitalPassword || 'Password@123');
    setConfirmPassword(defaultHospitalPassword || 'Password@123');
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Email and password are required.');
      return;
    }

    if (mode === 'signup' && !hospitalName.trim()) {
      setErrorMessage('Hospital name is required for signup.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('Password and confirm password do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await loginHospitalUser(email, password);
      } else {
        await signupHospitalUser(hospitalName, email, password);
      }
      redirectToDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="hospital-auth-page">
      <section className="hospital-auth-card" aria-label="Hospital authentication">
        <p className="hospital-auth-eyebrow">Hospital Access</p>
        <h1>{mode === 'login' ? 'Login To Hospital Console' : 'Create Hospital Account'}</h1>
        <p className="hospital-auth-subtitle">{credentialHint}</p>

        <div className="hospital-auth-mode-switch" role="tablist" aria-label="Auth mode">
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

        <form className="hospital-auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' ? (
            <label>
              Hospital Name
              <input
                type="text"
                value={hospitalName}
                onChange={(event) => setHospitalName(event.target.value)}
                placeholder="Enter hospital name"
                autoComplete="organization"
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
              placeholder="hospital1@gmail.com"
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
            <p className="hospital-auth-toast" role="status">
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" className="hospital-auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create And Continue'}
          </button>
        </form>

        <div className="hospital-auth-presets">
          <p>Quick Fill Accounts</p>
          <div className="hospital-auth-chip-grid">
            {presetHospitalEmails.slice(0, 10).map((presetEmail) => (
              <button
                key={presetEmail}
                type="button"
                className="hospital-auth-chip"
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
