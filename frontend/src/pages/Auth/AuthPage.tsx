import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { useHospitalAuth } from '@shared/providers/AuthContext';
import { loginAdmin, signupAdmin } from '@shared/utils/adminAuthApi';
import {
  type AppRole,
  clearStoredAdminSession,
  dashboardPathByRole,
  persistAdminSession,
  readStoredAdminSession,
  redirectToPath,
  resolveAuthenticatedRole,
} from '@/utils/redirectByRole';
import './AuthPage.css';

type AuthMode = 'login' | 'signup';

interface RoleConfig {
  label: string;
  subtitle: string;
  signupNameLabel: string;
  signupNamePlaceholder: string;
  emailPlaceholder: string;
}

const ROLE_CONFIG: Record<AppRole, RoleConfig> = {
  hospital: {
    label: 'Hospital',
    subtitle: 'Manage emergency intake and dispatch from your hospital command dashboard.',
    signupNameLabel: 'Hospital Name',
    signupNamePlaceholder: 'Enter hospital name',
    emailPlaceholder: 'hospital1@gmail.com',
  },
  driver: {
    label: 'Driver',
    subtitle: 'Access live missions, route guidance, and earnings insights in one place.',
    signupNameLabel: 'Driver Name',
    signupNamePlaceholder: 'Enter driver name',
    emailPlaceholder: 'driver1@gmail.com',
  },
  admin: {
    label: 'Admin',
    subtitle: 'Secure operations oversight with verification, quality, and compliance controls.',
    signupNameLabel: 'Admin Name',
    signupNamePlaceholder: 'Enter admin name',
    emailPlaceholder: 'admin.ops@codered.ai',
  },
};

const ADMIN_DEFAULT_PASSWORD = 'Admin@123';
const ADMIN_SIGNUP_ACCESS_CODE = (import.meta.env.VITE_ADMIN_ACCESS_CODE as string | undefined)?.trim() || 'CODERED-ADMIN-ACCESS';
const ADMIN_QUICK_FILL_EMAILS = [
  'admin.ops@codered.ai',
  'admin.verify@codered.ai',
  'admin.reviews@codered.ai',
  'admin.compliance@codered.ai',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

function initialEmailByRole(role: AppRole, hospitalEmails: string[], driverEmails: string[]) {
  if (role === 'hospital') {
    return hospitalEmails[0] || 'hospital1@gmail.com';
  }

  if (role === 'driver') {
    return driverEmails[0] || 'driver1@gmail.com';
  }

  return ADMIN_QUICK_FILL_EMAILS[0];
}

function initialPasswordByRole(role: AppRole, hospitalPassword: string, driverPassword: string) {
  if (role === 'hospital') {
    return hospitalPassword || 'Password@123';
  }

  if (role === 'driver') {
    return driverPassword || 'Password@123';
  }

  return ADMIN_DEFAULT_PASSWORD;
}

function formHeading(role: AppRole, mode: AuthMode) {
  if (mode === 'login') {
    if (role === 'hospital') {
      return 'Login To Hospital Dashboard';
    }

    if (role === 'driver') {
      return 'Login To Driver Dashboard';
    }

    return 'Login To Admin Dashboard';
  }

  if (role === 'hospital') {
    return 'Create Hospital Account';
  }

  if (role === 'driver') {
    return 'Create Driver Account';
  }

  return 'Create Admin Account';
}

export function AuthPage() {
  const {
    defaultHospitalPassword,
    defaultDriverPassword,
    driverUser,
    hospitalUser,
    isDriverAuthenticated,
    isHospitalAuthenticated,
    loginDriverUser,
    loginHospitalUser,
    logoutDriverUser,
    logoutHospitalUser,
    presetDriverEmails,
    presetHospitalEmails,
    signupDriverUser,
    signupHospitalUser,
  } = useHospitalAuth();

  const [selectedRole, setSelectedRole] = useState<AppRole>('hospital');
  const [mode, setMode] = useState<AuthMode>('login');
  const [accountName, setAccountName] = useState('');
  const [email, setEmail] = useState(() => initialEmailByRole('hospital', presetHospitalEmails, presetDriverEmails));
  const [password, setPassword] = useState(() =>
    initialPasswordByRole('hospital', defaultHospitalPassword, defaultDriverPassword),
  );
  const [confirmPassword, setConfirmPassword] = useState(() =>
    initialPasswordByRole('hospital', defaultHospitalPassword, defaultDriverPassword),
  );
  const [adminAccessCode, setAdminAccessCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeRoleConfig = ROLE_CONFIG[selectedRole];

  const quickFillEmails = useMemo(() => {
    if (selectedRole === 'hospital') {
      return presetHospitalEmails.slice(0, 10);
    }

    if (selectedRole === 'driver') {
      return presetDriverEmails.slice(0, 8);
    }

    return ADMIN_QUICK_FILL_EMAILS;
  }, [selectedRole, presetHospitalEmails, presetDriverEmails]);

  const credentialHint = useMemo(() => {
    if (selectedRole === 'hospital') {
      return `Use hospital1@gmail.com ... hospital10@gmail.com with password ${defaultHospitalPassword || 'Password@123'}.`;
    }

    if (selectedRole === 'driver') {
      return `Use driver1@gmail.com ... driver8@gmail.com with password ${defaultDriverPassword || 'Password@123'}.`;
    }

    return `Use approved admin credentials. Demo password is ${ADMIN_DEFAULT_PASSWORD}.`;
  }, [selectedRole, defaultHospitalPassword, defaultDriverPassword]);

  const setExclusiveSessionForRole = useCallback(
    (role: AppRole) => {
      if (role !== 'hospital') {
        logoutHospitalUser();
      }

      if (role !== 'driver') {
        logoutDriverUser();
      }

      if (role !== 'admin') {
        clearStoredAdminSession();
      }
    },
    [logoutDriverUser, logoutHospitalUser],
  );

  useEffect(() => {
    const authenticatedRole = resolveAuthenticatedRole({
      isHospitalAuthenticated: Boolean(isHospitalAuthenticated && hospitalUser),
      isDriverAuthenticated: Boolean(isDriverAuthenticated && driverUser),
      hasAdminSession: Boolean(readStoredAdminSession()),
    });

    if (!authenticatedRole) {
      return;
    }

    redirectToPath(dashboardPathByRole(authenticatedRole));
  }, [driverUser, hospitalUser, isDriverAuthenticated, isHospitalAuthenticated]);

  useEffect(() => {
    setErrorMessage(null);
    setAccountName('');
    setAdminAccessCode('');

    const nextEmail = initialEmailByRole(selectedRole, presetHospitalEmails, presetDriverEmails);
    const nextPassword = initialPasswordByRole(selectedRole, defaultHospitalPassword, defaultDriverPassword);

    setEmail(nextEmail);
    setPassword(nextPassword);
    setConfirmPassword(nextPassword);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [selectedRole]);

  const handleQuickFill = (candidateEmail: string) => {
    setEmail(candidateEmail);
    const nextPassword = initialPasswordByRole(selectedRole, defaultHospitalPassword, defaultDriverPassword);
    setPassword(nextPassword);
    setConfirmPassword(nextPassword);
    setErrorMessage(null);
  };

  const validateForm = () => {
    if (!email.trim() || !password.trim()) {
      return 'Email and password are required.';
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      return 'Enter a valid email address.';
    }

    if (mode === 'signup' && !accountName.trim()) {
      return `${activeRoleConfig.signupNameLabel} is required for signup.`;
    }

    if (mode === 'signup' && !STRONG_PASSWORD_PATTERN.test(password)) {
      return 'Password must be at least 8 characters with upper, lower, number, and special character.';
    }

    if (mode === 'signup' && password !== confirmPassword) {
      return 'Password and confirm password do not match.';
    }

    if (selectedRole === 'admin' && mode === 'signup' && adminAccessCode.trim() !== ADMIN_SIGNUP_ACCESS_CODE) {
      return 'Invalid admin access code.';
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const normalizedName = accountName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        if (selectedRole === 'hospital') {
          await loginHospitalUser(normalizedEmail, normalizedPassword);
        } else if (selectedRole === 'driver') {
          await loginDriverUser(normalizedEmail, normalizedPassword);
        } else {
          const session = await loginAdmin({ email: normalizedEmail, password: normalizedPassword });
          persistAdminSession({
            token: session.token,
            user: {
              id: session.user.id,
              name: session.user.name,
              email: session.user.email,
              role: session.user.role,
            },
          });
        }
      } else if (selectedRole === 'hospital') {
        await signupHospitalUser(normalizedName, normalizedEmail, normalizedPassword);
      } else if (selectedRole === 'driver') {
        await signupDriverUser(normalizedName, normalizedEmail, normalizedPassword);
      } else {
        const session = await signupAdmin({
          adminName: normalizedName,
          email: normalizedEmail,
          password: normalizedPassword,
        });
        persistAdminSession({
          token: session.token,
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            role: session.user.role,
          },
        });
      }

      setExclusiveSessionForRole(selectedRole);
      redirectToPath(dashboardPathByRole(selectedRole));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLabel =
    mode === 'login'
      ? `Login As ${activeRoleConfig.label}`
      : `Create ${activeRoleConfig.label} Account`;

  return (
    <main className="auth-page">
      <section className="auth-page-card" aria-label="Unified authentication">
        <p className="auth-page-eyebrow">Unified Access</p>
        <h1>{formHeading(selectedRole, mode)}</h1>
        <p className="auth-page-subtitle">{activeRoleConfig.subtitle}</p>

        <div className="auth-page-role-switch" role="tablist" aria-label="Select account role">
          {(Object.keys(ROLE_CONFIG) as AppRole[]).map((role) => (
            <button
              key={role}
              type="button"
              className={selectedRole === role ? 'active' : ''}
              onClick={() => setSelectedRole(role)}
            >
              {ROLE_CONFIG[role].label}
            </button>
          ))}
        </div>

        <div className="auth-page-mode-switch" role="tablist" aria-label="Select authentication mode">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Signup
          </button>
        </div>

        <p className="auth-page-hint">{credentialHint}</p>

        <form className="auth-page-form" onSubmit={handleSubmit}>
          {mode === 'signup' ? (
            <label>
              {activeRoleConfig.signupNameLabel}
              <input
                type="text"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder={activeRoleConfig.signupNamePlaceholder}
                autoComplete={selectedRole === 'hospital' ? 'organization' : 'name'}
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
              placeholder={activeRoleConfig.emailPlaceholder}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-page-password-wrap">
            Password
            <div className="auth-page-password-control">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password@123"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              <button type="button" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {mode === 'signup' ? (
            <label className="auth-page-password-wrap">
              Confirm Password
              <div className="auth-page-password-control">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Password@123"
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowConfirmPassword((current) => !current)}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
          ) : null}

          {selectedRole === 'admin' && mode === 'signup' ? (
            <label>
              Admin Access Code
              <input
                type="text"
                value={adminAccessCode}
                onChange={(event) => setAdminAccessCode(event.target.value)}
                placeholder="Enter authorized admin code"
                autoComplete="off"
                required
              />
            </label>
          ) : null}

          {errorMessage ? (
            <p className="auth-page-toast" role="status">
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" className="auth-page-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : submitLabel}
          </button>
        </form>

        {quickFillEmails.length > 0 ? (
          <div className="auth-page-presets">
            <p>Quick Fill Accounts</p>
            <div className="auth-page-chip-grid">
              {quickFillEmails.map((presetEmail) => (
                <button
                  key={presetEmail}
                  type="button"
                  className="auth-page-chip"
                  onClick={() => handleQuickFill(presetEmail)}
                >
                  {presetEmail}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {selectedRole === 'admin' && mode === 'signup' ? (
          <p className="auth-page-note">Admin signup requires an approved internal access code.</p>
        ) : null}

        <a href="#/" className="auth-page-back-link">
          Back to Home
        </a>
      </section>
    </main>
  );
}
