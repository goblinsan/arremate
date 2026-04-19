import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Show, ShowInventoryItem, InventoryItem, ItemCondition } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

interface PublicShow extends Omit<Show, 'seller'> {
  seller: { id: string; name: string | null };
  queueItems: (ShowInventoryItem & { inventoryItem: InventoryItem })[];
}

export default function ShowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [show, setShow] = useState<PublicShow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchShow();
  }, [id]);

  async function fetchShow() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/shows/${id}`);
      if (res.status === 404) {
        setError('Show não encontrado.');
        return;
      }
      if (!res.ok) throw new Error('Erro ao carregar show.');
      const data: PublicShow = await res.json();
      setShow(data);
    } catch {
      setError('Erro ao carregar o show.');
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  if (error || !show) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">{error ?? 'Show não encontrado.'}</p>
        <Link to="/shows" className="text-brand-500 hover:underline text-sm">← Ver todos os shows</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link to="/shows" className="text-gray-400 hover:text-gray-600 text-sm mb-6 inline-block">
        ← Todos os shows
      </Link>

      {/* Show header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  show.status === 'LIVE'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {show.status === 'LIVE' ? '🔴 Ao vivo agora' : '📅 Agendado'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{show.title}</h1>
            {show.description && (
              <p className="text-gray-600 leading-relaxed mb-3">{show.description}</p>
            )}
            <div className="text-sm text-gray-500 space-y-1">
              <p>
                Vendedor:{' '}
                <span className="font-medium text-gray-700">{show.seller?.name ?? 'Vendedor'}</span>
              </p>
              {show.scheduledAt && (
                <p>
                  Data:{' '}
                  <span className="font-medium text-gray-700">
                    {new Date(show.scheduledAt).toLocaleString('pt-BR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Queue / item list */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          Itens do show ({show.queueItems.length})
        </h2>

        {show.queueItems.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-400">
            Nenhum item cadastrado ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {show.queueItems.map((entry, index) => {
              const item = entry.inventoryItem as InventoryItem | undefined;
              if (!item) return null;
              return (
                <div
                  key={entry.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-4"
                >
                  <span className="text-sm font-bold text-gray-300 w-6 text-center shrink-0">
                    {index + 1}
                  </span>
                  <div className="h-14 w-14 bg-gray-100 rounded-xl flex items-center justify-center text-xl shrink-0">
                    📦
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-500 truncate">{item.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {CONDITION_LABELS[item.condition]}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-brand-500">
                      R$ {Number(item.startingPrice).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">lance inicial</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
