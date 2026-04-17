import { useCallback, useState } from 'react';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((_message: string) => {
    return undefined;
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    sendMessage,
  };
}
