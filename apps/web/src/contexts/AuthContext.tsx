import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { decodeJwtPayload, isTokenExpired, type AuthTokens } from '@arremate/auth';

// ─── Cognito token storage keys ───────────────────────────────────────────────
const ACCESS_TOKEN_KEY = 'arremate.accessToken';
const ID_TOKEN_KEY = 'arremate.idToken';
const REFRESH_TOKEN_KEY = 'arremate.refreshToken';
const OAUTH_STATE_KEY = 'arremate.oauth.state';
const OAUTH_PKCE_VERIFIER_KEY = 'arremate.oauth.pkceVerifier';
const OAUTH_MODE_KEY = 'arremate.oauth.mode';
const POST_AUTH_REDIRECT_KEY = 'arremate.auth.postLoginRedirect';
const FIRST_PROFILE_ROUTE_DONE_PREFIX = 'arremate.auth.firstProfileRouteDone:';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

// ─── Auth state ───────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
  username: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  activeRole: 'BUYER' | 'SELLER' | null;
  isSeller: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** The currently active role (respects activeRole override). */
  currentRole: 'BUYER' | 'SELLER' | 'ADMIN' | null;
  /** Whether the user has an approved seller account and can switch to SELLER profile. */
  isSeller: boolean;
  profile: UserProfile | null;
}

export interface AuthContextValue extends AuthState {
  signIn(email: string, password: string): Promise<void>;
  startSignUp(): Promise<void>;
  startSocialSignIn(provider: string): Promise<void>;
  socialProviders: Array<{ id: string; label: string }>;
  signOut(): void;
  /** Returns the current access token, refreshing if necessary. */
  getAccessToken(): string | null;
  /** Switches the active profile between BUYER and SELLER. */
  switchProfile(role: 'BUYER' | 'SELLER'): Promise<void>;
  /** Reloads the user profile from the API. */
  reloadProfile(): Promise<void>;
  /** Returns and clears a one-time post-auth redirect destination. */
  consumePostAuthRedirect(): '/profile' | '/' | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Cognito InitiateAuth helpers ─────────────────────────────────────────────

interface CognitoAuthResult {
  AccessToken: string;
  IdToken: string;
  RefreshToken?: string;
  ExpiresIn: number;
  TokenType: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  Google: 'Google',
  SignInWithApple: 'Apple',
  Facebook: 'Facebook',
  LoginWithAmazon: 'Amazon',
  Instagram: 'Instagram',
};

function getOauthConfig() {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN as string | undefined;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
  const redirectUri = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string | undefined)
    ?? `${window.location.origin}/auth/callback`;
  const scopes = (import.meta.env.VITE_COGNITO_OAUTH_SCOPES as string | undefined)
    ?? 'openid email profile';

  if (!domain || !clientId) {
    throw new Error('Missing VITE_COGNITO_DOMAIN or VITE_COGNITO_CLIENT_ID');
  }

  return { domain, clientId, redirectUri, scopes };
}

function getSocialProviders() {
  const configured = (import.meta.env.VITE_COGNITO_SOCIAL_PROVIDERS as string | undefined)
    ?.split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const providerIds = configured && configured.length > 0
    ? configured
    : ['Google', 'SignInWithApple', 'Facebook', 'Instagram'];

  return providerIds
    .filter((id) => id !== 'GovBr')
    .map((id) => ({ id, label: PROVIDER_LABELS[id] ?? id }));
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createRandomString(byteLength = 32): string {
  const random = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncode(random);
}

async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

async function startHostedAuth(mode: 'login' | 'signup', provider?: string): Promise<void> {
  const { domain, clientId, redirectUri, scopes } = getOauthConfig();
  const state = createRandomString(24);
  const codeVerifier = createRandomString(48);
  const codeChallenge = await pkceChallengeFromVerifier(codeVerifier);

  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_PKCE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(OAUTH_MODE_KEY, mode);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  if (provider) {
    params.set('identity_provider', provider);
  }

  const path = mode === 'signup' ? '/signup' : '/oauth2/authorize';
  window.location.assign(`https://${domain}${path}?${params.toString()}`);
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CognitoAuthResult> {
  const { domain, clientId, redirectUri } = getOauthConfig();
  const tokenEndpoint = `https://${domain}/oauth2/token`;

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`OAuth token exchange failed: ${bodyText || response.status}`);
  }

  const data = await response.json() as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  return {
    AccessToken: data.access_token,
    IdToken: data.id_token,
    RefreshToken: data.refresh_token,
    ExpiresIn: data.expires_in,
    TokenType: data.token_type,
  };
}

async function cognitoInitiateAuth(
  email: string,
  password: string,
): Promise<CognitoAuthResult> {
  const region = import.meta.env.VITE_COGNITO_REGION as string;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string;

  if (!region || !clientId) {
    throw new Error('Missing VITE_COGNITO_REGION or VITE_COGNITO_CLIENT_ID');
  }

  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Authentication failed' }));
    throw new Error(error.__type ?? error.message ?? 'Authentication failed');
  }

  const data = await response.json();
  return data.AuthenticationResult as CognitoAuthResult;
}

// ─── Provider ────────────────────────────────────────────────────────────────

function loadStoredTokens(): AuthTokens | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const idToken = localStorage.getItem(ID_TOKEN_KEY);
  if (!accessToken) return null;
  return { accessToken, refreshToken: refreshToken ?? '', idToken: idToken ?? undefined };
}

function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
  if (tokens.idToken) localStorage.setItem(ID_TOKEN_KEY, tokens.idToken);
}

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ID_TOKEN_KEY);
}

function resolvePostAuthRedirect(profile: UserProfile): '/profile' | '/' {
  const key = `${FIRST_PROFILE_ROUTE_DONE_PREFIX}${profile.id}`;
  const hasCompletedFirstProfileRoute = localStorage.getItem(key) === '1';

  if (!hasCompletedFirstProfileRoute) {
    localStorage.setItem(key, '1');
    return '/profile';
  }

  return '/';
}

function storePostAuthRedirect(route: '/profile' | '/'): void {
  sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, route);
}

function consumeStoredPostAuthRedirect(): '/profile' | '/' | null {
  const route = sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
  sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
  if (route === '/profile' || route === '/') return route;
  return null;
}

function userFromTokens(tokens: AuthTokens): AuthUser | null {
  const payload = decodeJwtPayload(tokens.idToken ?? tokens.accessToken);
  if (!payload) return null;
  const claims = payload as unknown as {
    email?: string;
    'cognito:username'?: string;
    username?: string;
  };
  const email = claims.email ?? claims['cognito:username'] ?? claims.username ?? '';
  return {
    sub: payload.sub,
    email,
    username: email,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const fetchProfile = useCallback(async (accessToken: string): Promise<UserProfile | null> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${API_URL}/v1/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const data = await res.json() as UserProfile;
          setProfile(data);
          return data;
        }
      } catch {
        // Profile fetch is best-effort; retries absorb transient edge failures.
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }

    return null;
  }, []);

  // Restore session from localStorage on mount.
  useEffect(() => {
    async function restoreOrHandleOAuthCallback() {
      try {
        const search = new URLSearchParams(window.location.search);
        const code = search.get('code');
        const state = search.get('state');
        const isOAuthCallback = window.location.pathname === '/auth/callback' && !!code;

        if (isOAuthCallback) {
          const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
          const codeVerifier = sessionStorage.getItem(OAUTH_PKCE_VERIFIER_KEY);

          sessionStorage.removeItem(OAUTH_STATE_KEY);
          sessionStorage.removeItem(OAUTH_PKCE_VERIFIER_KEY);
          sessionStorage.removeItem(OAUTH_MODE_KEY);

          if (!state || !expectedState || state !== expectedState || !codeVerifier) {
            throw new Error('OAuth callback state validation failed');
          }

          const result = await exchangeCodeForTokens(code, codeVerifier);
          const newTokens: AuthTokens = {
            accessToken: result.AccessToken,
            refreshToken: result.RefreshToken ?? '',
            idToken: result.IdToken,
          };
          storeTokens(newTokens);
          // Fetch profile before setting auth state so contextProfile is ready
          // when isAuthenticated transitions to true and triggers route guards.
          const profileData = await fetchProfile(result.AccessToken);
          setTokens(newTokens);
          setUser(userFromTokens(newTokens));
          if (profileData) {
            storePostAuthRedirect(resolvePostAuthRedirect(profileData));
          }
          return;
        }

        const stored = loadStoredTokens();
        if (stored) {
          const payload = decodeJwtPayload(stored.accessToken);
          if (payload && !isTokenExpired(payload)) {
            setTokens(stored);
            setUser(userFromTokens(stored));
            // Fetch profile in background – don't block isLoading on a network call
            void fetchProfile(stored.accessToken);
          } else {
            clearTokens();
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    restoreOrHandleOAuthCallback().catch((err) => {
      clearTokens();
      setTokens(null);
      setUser(null);
      setProfile(null);
      setIsLoading(false);
      const message = err instanceof Error ? err.message : 'OAuth callback failed';
      window.history.replaceState({}, '', `/login?oauthError=${encodeURIComponent(message)}`);
    });
  }, [fetchProfile]);

  async function signIn(email: string, password: string): Promise<void> {
    const result = await cognitoInitiateAuth(email, password);
    const newTokens: AuthTokens = {
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken ?? '',
      idToken: result.IdToken,
    };
    storeTokens(newTokens);
    // Fetch profile before setting auth state so contextProfile is ready when
    // isAuthenticated transitions to true and triggers route guards / effects.
    const profileData = await fetchProfile(result.AccessToken);
    setTokens(newTokens);
    setUser(userFromTokens(newTokens));
    if (profileData) {
      storePostAuthRedirect(resolvePostAuthRedirect(profileData));
    }
  }

  async function startSignUp(): Promise<void> {
    await startHostedAuth('signup');
  }

  async function startSocialSignIn(provider: string): Promise<void> {
    await startHostedAuth('login', provider);
  }

  const signOut = useCallback((): void => {
    clearTokens();
    setTokens(null);
    setUser(null);
    setProfile(null);
  }, []);

  const getAccessToken = useCallback((): string | null => {
    if (!tokens) return null;
    const payload = decodeJwtPayload(tokens.accessToken);
    if (!payload || isTokenExpired(payload)) {
      signOut();
      return null;
    }
    return tokens.accessToken;
  }, [tokens, signOut]);

  async function switchProfile(role: 'BUYER' | 'SELLER'): Promise<void> {
    const token = getAccessToken();
    if (!token) throw new Error('Sessão expirada. Faça login novamente.');

    const res = await fetch(`${API_URL}/v1/me/switch-profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'Não foi possível trocar o perfil.');
    }

    const data = await res.json() as UserProfile;
    setProfile(data);
  }

  async function reloadProfile(): Promise<void> {
    const token = getAccessToken();
    if (token) await fetchProfile(token);
  }

  function consumePostAuthRedirect(): '/profile' | '/' | null {
    return consumeStoredPostAuthRedirect();
  }

  const currentRole: 'BUYER' | 'SELLER' | 'ADMIN' | null = profile
    ? (profile.role === 'ADMIN' ? 'ADMIN' : (profile.activeRole ?? profile.role))
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        isLoading,
        isAuthenticated: !!user,
        profile,
        currentRole,
        isSeller: profile?.isSeller ?? false,
        signIn,
        startSignUp,
        startSocialSignIn,
        socialProviders: getSocialProviders(),
        signOut,
        getAccessToken,
        switchProfile,
        reloadProfile,
        consumePostAuthRedirect,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
