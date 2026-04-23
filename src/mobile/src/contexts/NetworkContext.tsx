import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// ─── Context shape ───────────────────────────────────────
type NetworkContextValue = {
  /** Whether the device currently has internet connectivity. */
  isConnected: boolean;
};

const NetworkContext = createContext<NetworkContextValue>({
  isConnected: true,
});

// ─── Provider ────────────────────────────────────────────
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);

  const handleNetworkChange = useCallback((state: NetInfoState) => {
    // state.isConnected can be null on first fetch; default to true
    setIsConnected(state.isConnected ?? true);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);
    return () => unsubscribe();
  }, [handleNetworkChange]);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
    </NetworkContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────
export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}
