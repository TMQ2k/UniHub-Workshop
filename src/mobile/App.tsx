import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { CheckInQueueProvider, useCheckInQueue } from './src/contexts/CheckInQueueContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { useAutoSync } from './src/hooks/useAutoSync';
import ScannerScreen from './src/screens/ScannerScreen';
import LoginScreen from './src/screens/LoginScreen';

/**
 * Inner component that consumes all contexts.
 * Shows LoginScreen if not authenticated, ScannerScreen if authenticated.
 */
function AppContent() {
  const { refreshQueue } = useCheckInQueue();
  const { isLoggedIn } = useAuth();

  // Activate background auto-sync — returns manual sync trigger
  const { syncNow } = useAutoSync();

  // Hydrate queue from AsyncStorage on cold start
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  return (
    <>
      <StatusBar style="light" />
      {isLoggedIn ? <ScannerScreen syncNow={syncNow} /> : <LoginScreen />}
    </>
  );
}

/**
 * Root component — wraps the app with Context providers.
 * Uses React Context API only (no Redux).
 */
export default function App() {
  return (
    <AuthProvider>
      <NetworkProvider>
        <CheckInQueueProvider>
          <AppContent />
        </CheckInQueueProvider>
      </NetworkProvider>
    </AuthProvider>
  );
}
