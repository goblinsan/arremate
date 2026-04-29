import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeJwtPayload, isTokenExpired, type AuthTokens } from '@arremate/auth';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'arremate.accessToken';
const ID_TOKEN_KEY = 'arremate.idToken';
const REFRESH_TOKEN_KEY = 'arremate.refreshToken';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const COGNITO_REGION = process.env.EXPO_PUBLIC_COGNITO_REGION ?? 'sa-east-1';
const COGNITO_CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  activeRole: 'BUYER' | 'SELLER' | null;
  isSeller: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  currentRole: 'BUYER' | 'SELLER' | 'ADMIN' | null;
  isSeller: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): void;
  getAccessToken(): string | null;
  reloadProfile(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CognitoAuthResult {
  AccessToken: string;
  IdToken: string;
  RefreshToken?: string;
  ExpiresIn: number;
  TokenType: string;
}

async function cognitoSignIn(email: string, password: string): Promise<CognitoAuthResult> {
  if (!COGNITO_REGION || !COGNITO_CLIENT_ID) {
    throw new Error('Missing EXPO_PUBLIC_COGNITO_REGION or EXPO_PUBLIC_COGNITO_CLIENT_ID');
  }
  const endpoint = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Autenticação falhou' })) as {
      __type?: string;
      message?: string;
    };
    throw new Error(error.__type ?? error.message ?? 'Autenticação falhou');
  }

  const data = await res.json() as { AuthenticationResult: CognitoAuthResult };
  return data.AuthenticationResult;
}

async function loadStoredTokens(): Promise<AuthTokens | null> {
  const [accessToken, refreshToken, idToken] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_TOKEN_KEY),
    AsyncStorage.getItem(ID_TOKEN_KEY),
  ]);
  if (!accessToken) return null;
  return { accessToken, refreshToken: refreshToken ?? '', idToken: idToken ?? undefined };
}

async function storeTokens(tokens: AuthTokens): Promise<void> {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  if (tokens.idToken) {
    await AsyncStorage.setItem(ID_TOKEN_KEY, tokens.idToken);
  }
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(ID_TOKEN_KEY),
  ]);
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
  return { sub: payload.sub, email };
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        // Best-effort; retries absorb transient failures.
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return null;
  }, []);

  // Restore session from AsyncStorage on mount.
  useEffect(() => {
    async function restoreSession() {
      try {
        const stored = await loadStoredTokens();
        if (stored) {
          const payload = decodeJwtPayload(stored.accessToken);
          if (payload && !isTokenExpired(payload)) {
            setTokens(stored);
            setUser(userFromTokens(stored));
            void fetchProfile(stored.accessToken);
          } else {
            await clearTokens();
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      const result = await cognitoSignIn(email, password);
      const newTokens: AuthTokens = {
        accessToken: result.AccessToken,
        refreshToken: result.RefreshToken ?? '',
        idToken: result.IdToken,
      };
      await storeTokens(newTokens);
      await fetchProfile(result.AccessToken);
      setTokens(newTokens);
      setUser(userFromTokens(newTokens));
    },
    [fetchProfile],
  );

  const signOut = useCallback((): void => {
    void clearTokens();
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

  const reloadProfile = useCallback(async (): Promise<void> => {
    const token = getAccessToken();
    if (token) await fetchProfile(token);
  }, [getAccessToken, fetchProfile]);

  const currentRole: 'BUYER' | 'SELLER' | 'ADMIN' | null = profile
    ? profile.role === 'ADMIN'
      ? 'ADMIN'
      : (profile.activeRole ?? profile.role)
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        tokens,
        isLoading,
        isAuthenticated: !!user,
        currentRole,
        isSeller: profile?.isSeller ?? false,
        signIn,
        signOut,
        getAccessToken,
        reloadProfile,
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
