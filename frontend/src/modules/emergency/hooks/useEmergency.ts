export function useEmergency() {
  return {
    emergencyId: null as string | null,
    status: 'idle' as const,
    triggerEmergency: () => undefined,
    clearEmergency: () => undefined,
  };
}
