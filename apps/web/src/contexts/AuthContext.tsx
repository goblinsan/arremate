import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { decodeJwtPayload, isTokenExpired, type AuthTokens } from '@arremate/auth';

// ─── Cognito token storage keys ───────────────────────────────────────────────
const ACCESS_TOKEN_KEY = 'arremate.accessToken';
const ID_TOKEN_KEY = 'arremate.idToken';
const REFRESH_TOKEN_KEY = 'arremate.refreshToken';

// ─── Auth state ───────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
  username: string;
}

export interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  signIn(email: string, password: string): Promise<void>;
  signOut(): void;
  /** Returns the current access token, refreshing if necessary. */
  getAccessToken(): string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Cognito InitiateAuth helpers ─────────────────────────────────────────────

interface CognitoAuthResult {
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
  ExpiresIn: number;
  TokenType: string;
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
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, idToken: idToken ?? undefined };
}

function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  if (tokens.idToken) localStorage.setItem(ID_TOKEN_KEY, tokens.idToken);
}

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ID_TOKEN_KEY);
}

function userFromTokens(tokens: AuthTokens): AuthUser | null {
  const payload = decodeJwtPayload(tokens.accessToken);
  if (!payload) return null;
  const email = payload.email ?? '';
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

  // Restore session from localStorage on mount.
  useEffect(() => {
    const stored = loadStoredTokens();
    if (stored) {
      const payload = decodeJwtPayload(stored.accessToken);
      if (payload && !isTokenExpired(payload)) {
        setTokens(stored);
        setUser(userFromTokens(stored));
      } else {
        clearTokens();
      }
    }
    setIsLoading(false);
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    const result = await cognitoInitiateAuth(email, password);
    const newTokens: AuthTokens = {
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken,
      idToken: result.IdToken,
    };
    storeTokens(newTokens);
    setTokens(newTokens);
    setUser(userFromTokens(newTokens));
  }

  function signOut(): void {
    clearTokens();
    setTokens(null);
    setUser(null);
  }

  function getAccessToken(): string | null {
    if (!tokens) return null;
    const payload = decodeJwtPayload(tokens.accessToken);
    if (!payload || isTokenExpired(payload)) {
      signOut();
      return null;
    }
    return tokens.accessToken;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
        getAccessToken,
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
