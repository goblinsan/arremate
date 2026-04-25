import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Radio, Inbox } from 'lucide-react';
import type { Show } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

interface PublicShow extends Omit<Show, 'seller'> {
  seller: { id: string; name: string | null };
  _count: { queueItems: number };
}

export default function AuctionsPage() {
  const [shows, setShows] = useState<PublicShow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchShows();
  }, []);

  async function fetchShows() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/shows`);
      if (!res.ok) throw new Error('Erro ao carregar leilões.');
      const body = await res.json() as { data: PublicShow[] };
      setShows(Array.isArray(body?.data) ? body.data : []);
    } catch {
      setError('Erro ao carregar os leilões.');
    } finally {
      setIsLoading(false);
    }
  }

  const liveShows = shows.filter((s) => s.status === 'LIVE');
  const scheduledShows = shows.filter((s) => s.status === 'SCHEDULED');

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Leilões</h1>
        <p className="text-gray-500 mt-2">Participe dos leilões ao vivo e faça seus lances.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={fetchShows}
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
          <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum leilão disponível no momento.</p>
          <p className="text-gray-400 text-sm mt-2">Volte em breve para novidades!</p>
        </div>
      ) : (
        <>
          {liveShows.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                Ao vivo agora
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {liveShows.map((show) => <ShowCard key={show.id} show={show} />)}
              </div>
            </section>
          )}

          {scheduledShows.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Próximos leilões</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {scheduledShows.map((show) => <ShowCard key={show.id} show={show} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ShowCard({ show }: { show: PublicShow }) {
  return (
    <Link
      to={`/shows/${show.id}`}
      className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow block"
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            show.status === 'LIVE'
              ? 'bg-red-100 text-red-700 animate-pulse'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {show.status === 'LIVE' ? (
            <span className="flex items-center gap-1"><Radio className="w-3 h-3" /> Ao vivo</span>
          ) : (
            'Agendado'
          )}
        </span>
        <span className="text-xs text-gray-400">
          {show._count.queueItems} {show._count.queueItems === 1 ? 'item' : 'itens'}
        </span>
      </div>
      <h2 className="font-semibold text-gray-900 mb-1">{show.title}</h2>
      {show.description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">{show.description}</p>
      )}
      <div className="text-xs text-gray-400">
        <p>
          por <span className="font-medium text-gray-600">{show.seller?.name ?? 'Vendedor'}</span>
        </p>
        {show.scheduledAt && (
          <p className="mt-1">
            {new Date(show.scheduledAt).toLocaleString('pt-BR', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </Link>
  );
}
