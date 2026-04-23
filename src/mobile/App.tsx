import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { CheckInQueueProvider, useCheckInQueue } from './src/contexts/CheckInQueueContext';
import { useAutoSync } from './src/hooks/useAutoSync';
import ScannerScreen from './src/screens/ScannerScreen';

/**
 * Inner component that consumes both contexts and activates auto-sync.
 * Separated from App so that hooks can access the providers above.
 */
function AppContent() {
  const { refreshQueue } = useCheckInQueue();

  // Activate background auto-sync
  useAutoSync();

  // Hydrate queue from AsyncStorage on cold start
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  return (
    <>
      <StatusBar style="light" />
      <ScannerScreen />
    </>
  );
}

/**
 * Root component — wraps the app with Context providers.
 * Uses React Context API only (no Redux).
 */
export default function App() {
  return (
    <NetworkProvider>
      <CheckInQueueProvider>
        <AppContent />
      </CheckInQueueProvider>
    </NetworkProvider>
  );
}
