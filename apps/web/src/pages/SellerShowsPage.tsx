import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Radio } from 'lucide-react';
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
  const { getAccessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState<Show[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    fetchShows();
  }, [isAuthenticated, authLoading]);

  async function fetchShows() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/v1/seller/shows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao carregar shows.');
      const body = await res.json() as { data: Show[] };
      setShows(Array.isArray(body?.data) ? body.data : []);
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
      if (!token) return;
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

  if (authLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
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
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={fetchShows}
            aria-label="Tentar carregar shows novamente"
            className="shrink-0 text-xs font-medium underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
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
          {shows.map((show) => {
            const href =
              show.status === 'LIVE' || show.status === 'SCHEDULED'
                ? `/seller/shows/${show.id}/live`
                : `/seller/shows/${show.id}`;
            return (
              <Link
                key={show.id}
                to={href}
                className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all flex items-center justify-between gap-4 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-gray-900 truncate group-hover:text-brand-600 transition-colors">{show.title}</h2>
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[show.status]}`}>
                      {STATUS_LABELS[show.status]}
                    </span>
                    {show.status === 'LIVE' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 animate-pulse">
                        <Radio className="w-3 h-3" /> Ao vivo
                      </span>
                    )}
                  </div>
                  {show.description && (
                    <p className="text-sm text-gray-500 truncate">{show.description}</p>
                  )}
                  {show.scheduledAt && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" /> {new Date(show.scheduledAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(show.status === 'DRAFT' || show.status === 'SCHEDULED') && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCancel(show.id); }}
                      className="text-sm font-medium text-red-500 hover:underline"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
