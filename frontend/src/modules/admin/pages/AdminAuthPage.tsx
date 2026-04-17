import { FormEvent, useMemo, useState } from 'react';

import { loginAdmin } from '@shared/utils/adminAuthApi';
import './AdminAuthPage.css';

export interface AdminSession {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLoginAt: string;
}

export interface AdminAuthState {
  token: string;
  user: AdminSession;
}

interface AdminAuthPageProps {
  onAuthenticated: (session: AdminAuthState) => void;
}

interface AdminAccount {
  id: string;
  name: string;
  role: string;
  email: string;
  password: string;
}

const adminAccounts: AdminAccount[] = [
  {
    id: 'ADM-001',
    name: 'Aarav Mehta',
    role: 'Chief Operations Admin',
    email: 'admin.ops@codered.ai',
    password: 'Admin@123',
  },
  {
    id: 'ADM-002',
    name: 'Siya Iyer',
    role: 'Verification Lead',
    email: 'admin.verify@codered.ai',
    password: 'Admin@123',
  },
  {
    id: 'ADM-003',
    name: 'Kabir Khan',
    role: 'Quality & Reviews Admin',
    email: 'admin.reviews@codered.ai',
    password: 'Admin@123',
  },
  {
    id: 'ADM-004',
    name: 'Neha Desai',
    role: 'Compliance Admin',
    email: 'admin.compliance@codered.ai',
    password: 'Admin@123',
  },
];

export function AdminAuthPage({ onAuthenticated }: AdminAuthPageProps) {
  const [email, setEmail] = useState(adminAccounts[0]?.email ?? 'admin.ops@codered.ai');
  const [password, setPassword] = useState(adminAccounts[0]?.password ?? 'Admin@123');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hint = useMemo(
    () => `Use any quick-fill account below. Password for all demo admins: ${adminAccounts[0].password}.`,
    [],
  );

  const handleQuickFill = (account: AdminAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Email and password are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { user, token } = await loginAdmin({ email, password });
      onAuthenticated({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLoginAt: new Date().toISOString(),
        },
      });

      if (typeof window !== 'undefined') {
        window.location.hash = '/admin-dashboard';
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card" aria-label="Admin authentication">
        <p className="admin-auth-eyebrow">Admin Access</p>
        <h1>Login To Admin Control Tower</h1>
        <p className="admin-auth-subtitle">{hint}</p>

        <form className="admin-auth-form" onSubmit={handleSubmit}>
          <label>
            Admin Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin.ops@codered.ai"
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
              placeholder="Admin@123"
              autoComplete="current-password"
              required
            />
          </label>

          {errorMessage ? (
            <p className="admin-auth-toast" role="status">
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" className="admin-auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : 'Login As Admin'}
          </button>
        </form>

        <div className="admin-auth-presets">
          <p>Quick Fill Admin Accounts</p>
          <div className="admin-auth-chip-grid">
            {adminAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className="admin-auth-chip"
                onClick={() => handleQuickFill(account)}
              >
                <strong>{account.role}</strong>
                <span>{account.email}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}