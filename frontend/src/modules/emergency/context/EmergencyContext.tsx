import { createContext, ReactNode, useContext } from 'react';

export interface EmergencyContextValue {
  activeEmergencyId: string | null;
  setActiveEmergencyId: (id: string | null) => void;
}

const EmergencyContext = createContext<EmergencyContextValue>({
  activeEmergencyId: null,
  setActiveEmergencyId: () => undefined,
});

export function EmergencyProvider({ children }: { children: ReactNode }) {
  return <EmergencyContext.Provider value={{ activeEmergencyId: null, setActiveEmergencyId: () => undefined }}>{children}</EmergencyContext.Provider>;
}

export function useEmergencyContext() {
  return useContext(EmergencyContext);
}
