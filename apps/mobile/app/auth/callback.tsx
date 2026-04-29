import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../src/contexts/AuthContext';
import { useHostedAuth } from '../../src/hooks/useHostedAuth';

/**
 * Deep-link landing screen for the Cognito hosted UI callback.
 *
 * This route is reached when the OS opens the app via the
 * `arremate://auth/callback?code=...&state=...` URI after the user
 * completes authentication in the system browser.
 *
 * expo-auth-session intercepts the URL when promptAsync() is still active
 * (the normal case). This screen acts as a fallback for cold-start launches
 * triggered by the deep link, ensuring the auth code is never silently lost.
 */
export default function AuthCallbackScreen() {
  const { code, state, error, error_description } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }>();
  const { signInWithTokens } = useAuth();
  const { exchangeCode } = useHostedAuth();
  const router = useRouter();

  // Let expo-auth-session close the in-app browser if it opened one.
  WebBrowser.maybeCompleteAuthSession();

  useEffect(() => {
    async function handleCallback() {
      if (error) {
        router.replace('/login');
        return;
      }

      if (!code) {
        // No code present; nothing to do, go home.
        router.replace('/(tabs)');
        return;
      }

      try {
        const tokens = await exchangeCode(code, state);
        await signInWithTokens(tokens);
        router.replace('/(tabs)');
      } catch {
        router.replace('/login');
      }
    }

    void handleCallback();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#f97316" />
      <Text style={styles.text}>
        {error_description ?? 'Autenticando...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', gap: 16 },
  text: { fontSize: 15, color: '#555' },
});
