import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Redirects unauthenticated users to /login.
 * For the admin app all authenticated users are allowed through here;
 * API-level role enforcement guarantees that non-ADMIN users cannot perform
 * privileged operations even if they reach the UI.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <span className="text-gray-400 text-sm">Carregando…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
