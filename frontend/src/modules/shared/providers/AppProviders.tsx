import { ReactNode } from 'react';

import { EmergencyProvider } from '@modules/emergency/context/EmergencyContext';
import { AuthProvider } from './AuthContext';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <EmergencyProvider>{children}</EmergencyProvider>
    </AuthProvider>
  );
}
