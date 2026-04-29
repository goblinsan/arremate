import { useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { AuthTokens } from '@arremate/auth';

// Ensure the browser session closes properly after the redirect on Android.
WebBrowser.maybeCompleteAuthSession();

const COGNITO_CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? '';
const COGNITO_HOSTED_UI_DOMAIN = process.env.EXPO_PUBLIC_COGNITO_HOSTED_UI_DOMAIN ?? '';

// Redirect URI: arremate://auth/callback (standalone) or Expo Go proxy.
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'arremate',
  path: 'auth/callback',
});

interface HostedAuthDiscovery {
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

function getDiscovery(): HostedAuthDiscovery | null {
  if (!COGNITO_HOSTED_UI_DOMAIN) return null;
  const base = `https://${COGNITO_HOSTED_UI_DOMAIN}`;
  return {
    authorizationEndpoint: `${base}/oauth2/authorize`,
    tokenEndpoint: `${base}/oauth2/token`,
  };
}

interface CognitoTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

/**
 * Exchanges the PKCE authorization code for Cognito tokens by calling the
 * hosted UI token endpoint directly.
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  tokenEndpoint: string,
): Promise<AuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: COGNITO_CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'token_exchange_failed' })) as {
      error?: string;
      error_description?: string;
    };
    throw new Error(error.error_description ?? error.error ?? 'Troca de código falhou');
  }

  const data = await res.json() as CognitoTokenResponse;
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token ?? '',
  };
}

export interface UseHostedAuthResult {
  /** Whether the hosted UI is configured (i.e. the env var is set). */
  isAvailable: boolean;
  /** Opens the Cognito hosted UI in the system browser and returns tokens on success. */
  signInWithHostedUI(): Promise<AuthTokens>;
  /**
   * Exchanges a raw authorization code for tokens.  Used by the deep-link
   * callback screen when the app is cold-started from the redirect URI.
   *
   * @param code  Authorization code received in the callback URL.
   * @param state State parameter from the callback URL (unused by Cognito but
   *              kept for future CSRF validation).
   */
  exchangeCode(code: string, state?: string): Promise<AuthTokens>;
}

/**
 * Hook that wraps the Cognito hosted UI OAuth 2.0 / PKCE flow via
 * expo-auth-session.  Returns an `isAvailable` flag (false when the hosted
 * UI domain env var is not set) and a `signInWithHostedUI` function.
 *
 * Deep-link callback URI: `arremate://auth/callback`
 */
export function useHostedAuth(): UseHostedAuthResult {
  const discovery = getDiscovery();
  const isAvailable = Boolean(discovery && COGNITO_CLIENT_ID);

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: COGNITO_CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['openid', 'email', 'profile'],
      usePKCE: true,
    },
    discovery ?? { authorizationEndpoint: '', tokenEndpoint: '' },
  );

  const signInWithHostedUI = useCallback(async (): Promise<AuthTokens> => {
    if (!discovery) {
      throw new Error('EXPO_PUBLIC_COGNITO_HOSTED_UI_DOMAIN is not configured');
    }
    if (!COGNITO_CLIENT_ID) {
      throw new Error('EXPO_PUBLIC_COGNITO_CLIENT_ID is not configured');
    }

    const result = await promptAsync();

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Login cancelado');
    }
    if (result.type === 'error') {
      throw new Error(result.error?.message ?? 'Erro no login social');
    }
    if (result.type !== 'success') {
      throw new Error('Resposta inesperada do servidor de autenticação');
    }

    const code = result.params.code;
    const codeVerifier = request?.codeVerifier;
    if (!code || !codeVerifier) {
      throw new Error('Código de autorização ou verificador ausente');
    }

    return exchangeCodeForTokens(code, codeVerifier, discovery.tokenEndpoint);
  }, [discovery, promptAsync, request]);

  /**
   * Exchanges a raw authorization code for tokens.
   * Used by the deep-link callback screen on cold-start launches.
   *
   * NOTE: On cold start there is no in-memory PKCE code_verifier, so the
   * exchange will only succeed if Cognito is configured to allow public
   * clients without PKCE (i.e. the app client has "Don't use PKCE" checked).
   * For maximum security it is preferable to keep the app in the foreground
   * during the hosted UI flow so the code_verifier is available.
   */
  const exchangeCode = useCallback(
    async (code: string, _state?: string): Promise<AuthTokens> => {
      if (!discovery) {
        throw new Error('EXPO_PUBLIC_COGNITO_HOSTED_UI_DOMAIN is not configured');
      }
      const codeVerifier = request?.codeVerifier ?? '';
      return exchangeCodeForTokens(code, codeVerifier, discovery.tokenEndpoint);
    },
    [discovery, request],
  );

  return { isAvailable, signInWithHostedUI, exchangeCode };
}
