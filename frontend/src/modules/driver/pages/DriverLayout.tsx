import type { ReactNode } from 'react';

import { Sidebar } from '@modules/driver/components/Sidebar';

interface DriverLayoutProps {
  children: ReactNode;
  missionActive: boolean;
  pickupCount: number;
  onLogout: () => void;
}

export function DriverLayout({ children, missionActive, pickupCount, onLogout }: DriverLayoutProps) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 66px)', position: 'relative' }}>
      <Sidebar missionActive={missionActive} pickupCount={pickupCount} onLogout={onLogout} />
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>{children}</div>
    </div>
  );
}
