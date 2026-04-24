import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Store, ShoppingCart, ArrowLeft } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  activeRole: 'BUYER' | 'SELLER' | null;
  isSeller: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ProfilePage() {
  const { isAuthenticated, isLoading, getAccessToken, currentRole, isSeller, switchProfile, profile: contextProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [name, setName] = useState(contextProfile?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // If auth context already has profile data (loaded during login), skip initial loading state
  const [isFetching, setIsFetching] = useState(!contextProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { replace: true, state: { from: location } });
    }
  }, [isAuthenticated, isLoading, location, navigate]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    async function loadProfile() {
      setIsFetching(true);
      setError(null);

      try {
        const token = getAccessToken();
        if (!token) throw new Error('Sessão expirada. Faça login novamente.');

        const res = await fetch(`${API_URL}/v1/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null) as { message?: string } | null;
          throw new Error(body?.message ?? 'Não foi possível carregar seu perfil.');
        }

        const data = await res.json() as MeResponse;
        setProfile(data);
        setName(data.name ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar seu perfil.');
      } finally {
        setIsFetching(false);
      }
    }

    loadProfile().catch(() => undefined);
  }, [getAccessToken, isAuthenticated, isLoading]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${API_URL}/v1/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? 'Não foi possível atualizar seu perfil.');
      }

      const updated = await res.json() as MeResponse;
      setProfile(updated);
      setName(updated.name ?? '');
      setSuccess('Perfil atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar seu perfil.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSwitchProfile(role: 'BUYER' | 'SELLER') {
    setIsSwitching(true);
    setError(null);
    try {
      await switchProfile(role);
      // Refresh local profile data
      const token = getAccessToken();
      if (token) {
        const res = await fetch(`${API_URL}/v1/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json() as MeResponse;
          setProfile(data);
        }
      }
      setSuccess(`Perfil alterado para ${role === 'SELLER' ? 'Vendedor' : 'Comprador'} com sucesso.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível trocar o perfil.');
    } finally {
      setIsSwitching(false);
    }
  }

  if (isLoading || (!isAuthenticated && !error)) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  const isSellerMode = currentRole === 'SELLER' || currentRole === 'ADMIN';

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link to="/" className="text-sm text-brand-500 hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Voltar para a home</Link>
        <h1 className="mt-3 text-3xl font-bold text-gray-900">Seu perfil</h1>
        <p className="mt-2 text-gray-500">
          Complete seus dados para personalizar sua conta no Arremate.
        </p>
      </div>

      {/* Profile switcher card */}
      {isSeller && (
        <div className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Perfil ativo</h2>
          <div className="flex gap-3">
            <button
              onClick={() => !isSellerMode && !isSwitching && handleSwitchProfile('SELLER')}
              disabled={isSwitching}
              className={`flex-1 flex flex-col items-center gap-2 rounded-xl border-2 py-4 px-3 transition-colors ${
                isSellerMode
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-500 hover:border-brand-300 hover:bg-gray-50'
              }`}
            >
              <Store className="w-6 h-6" />
              <span className="text-sm font-semibold">Vendedor</span>
              {isSellerMode && <span className="text-xs font-medium text-brand-500">Ativo</span>}
            </button>

            <button
              onClick={() => isSellerMode && !isSwitching && handleSwitchProfile('BUYER')}
              disabled={isSwitching}
              className={`flex-1 flex flex-col items-center gap-2 rounded-xl border-2 py-4 px-3 transition-colors ${
                !isSellerMode
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-500 hover:border-brand-300 hover:bg-gray-50'
              }`}
            >
              <ShoppingCart className="w-6 h-6" />
              <span className="text-sm font-semibold">Comprador</span>
              {!isSellerMode && <span className="text-xs font-medium text-brand-500">Ativo</span>}
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-400 text-center">
            Clique no perfil desejado para alternar instantaneamente.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            {success}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Nome
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="Seu nome completo"
            maxLength={120}
            disabled={isFetching || isSaving}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={profile?.email ?? contextProfile?.email ?? ''}
            className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
            disabled
            readOnly
          />
          <p className="mt-2 text-xs text-gray-400">
            Seu e-mail é gerenciado pelo provedor de autenticação.
          </p>
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de conta
          </label>
          <input
            id="role"
            type="text"
            value={(() => {
              const role = profile?.role ?? contextProfile?.role;
              return role === 'SELLER' ? 'Vendedor' : role === 'ADMIN' ? 'Administrador' : 'Comprador';
            })()}
            className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
            disabled
            readOnly
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isFetching || isSaving}
            className="bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
          >
            {isSaving ? 'Salvando…' : 'Salvar perfil'}
          </button>
        </div>
      </form>
    </div>
  );
}
