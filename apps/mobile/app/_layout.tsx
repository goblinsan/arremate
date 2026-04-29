import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/contexts/AuthContext';
import { queryClient } from '../src/lib/queryClient';
import { useDeepLinks } from '../src/hooks/useDeepLinks';

// Required so that expo-auth-session can close the in-app browser after
// the Cognito hosted UI redirects back to the app.
WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

function NavigationReadyHandler() {
  useDeepLinks();
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationReadyHandler />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="show/[id]" />
            <Stack.Screen
              name="live/[id]"
              options={{ animation: 'slide_from_bottom', gestureEnabled: true }}
            />
            <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="auth/callback" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
