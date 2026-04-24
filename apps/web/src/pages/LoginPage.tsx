import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signIn, startSignUp, startSocialSignIn, socialProviders, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/profile';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const oauthError = searchParams.get('oauthError');

  // Redirect authenticated users away from the login page.
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, from, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignUpClick() {
    try {
      setError(null);
      await startSignUp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar cadastro.');
    }
  }

  async function handleSocialSignIn(provider: string) {
    try {
      setError(null);
      await startSocialSignIn(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar login social.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-3xl font-extrabold text-brand-500">
            Arremate
          </Link>
          <p className="mt-2 text-sm text-gray-500">Entre na sua conta</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-sm rounded-2xl p-8 space-y-5"
        >
          {oauthError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {decodeURIComponent(oauthError)}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignUpClick}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            Criar conta
          </button>

          <div className="space-y-2">
            {socialProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleSocialSignIn(provider.id)}
                className="w-full border border-gray-300 hover:border-gray-400 bg-white text-gray-900 font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                Continuar com {provider.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">ou</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="voce@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
