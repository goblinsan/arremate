import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Show, ShowStatus } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const STATUS_LABELS: Record<ShowStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  LIVE: 'Ao vivo',
  ENDED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<ShowStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  LIVE: 'bg-red-100 text-red-700',
  ENDED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-red-50 text-red-400',
};

export default function SellerShowsPage() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState<Show[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchShows();
  }, [isAuthenticated]);

  async function fetchShows() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao carregar shows.');
      const body = await res.json() as { data: Show[] };
      setShows(body.data);
    } catch {
      setError('Erro ao carregar shows.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Confirma o cancelamento deste show?')) return;
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao cancelar show.');
      }
      await fetchShows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar show.');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para acessar o painel de shows.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Shows</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie seus shows e transmissões ao vivo.</p>
        </div>
        <button
          onClick={() => navigate('/seller/shows/new')}
          className="bg-brand-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Novo show
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 py-16">Carregando…</div>
      ) : shows.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <p className="text-gray-500 mb-4">Você ainda não tem nenhum show.</p>
          <button
            onClick={() => navigate('/seller/shows/new')}
            className="bg-brand-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Criar primeiro show
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {shows.map((show) => (
            <div
              key={show.id}
              className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold text-gray-900 truncate">{show.title}</h2>
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[show.status]}`}>
                    {STATUS_LABELS[show.status]}
                  </span>
                </div>
                {show.description && (
                  <p className="text-sm text-gray-500 truncate">{show.description}</p>
                )}
                {show.scheduledAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    📅 {new Date(show.scheduledAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/seller/shows/${show.id}`}
                  className="text-sm font-medium text-brand-500 hover:underline"
                >
                  Editar
                </Link>
                {(show.status === 'DRAFT' || show.status === 'SCHEDULED') && (
                  <button
                    onClick={() => handleCancel(show.id)}
                    className="text-sm font-medium text-red-500 hover:underline"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
