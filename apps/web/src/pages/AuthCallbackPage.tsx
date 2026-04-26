import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallbackPage() {
  const { isAuthenticated, isLoading, consumePostAuthRedirect } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        const postAuthRedirect = consumePostAuthRedirect();
        navigate(postAuthRedirect ?? '/', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [consumePostAuthRedirect, isAuthenticated, isLoading, navigate]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">
      Finalizando login...
    </div>
  );
}
