import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Show, ShowSession, ItemCondition } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const POLL_INTERVAL_MS = 5000;

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

interface PublicShow extends Omit<Show, 'seller'> {
  seller: { id: string; name: string | null };
}

export default function LiveRoomPage() {
  const { id: showId } = useParams<{ id: string }>();
  const [show, setShow] = useState<PublicShow | null>(null);
  const [session, setSession] = useState<ShowSession | null>(null);
  const [isLoadingShow, setIsLoadingShow] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!showId) return;
    try {
      const res = await fetch(`${API_URL}/v1/shows/${showId}/session`);
      if (res.ok) {
        const data: ShowSession = await res.json();
        setSession(data);
        setSessionError(null);
      } else if (res.status === 404) {
        setSession(null);
        setSessionError(null);
      } else {
        setSessionError('Erro ao buscar sessão.');
      }
    } catch {
      setSessionError('Erro ao buscar sessão.');
    }
  }, [showId]);

  useEffect(() => {
    if (!showId) return;

    // Load show metadata
    setIsLoadingShow(true);
    fetch(`${API_URL}/v1/shows/${showId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<PublicShow>;
      })
      .then((data) => {
        setShow(data);
        if (data.status === 'LIVE') {
          fetchSession();
        }
      })
      .catch(() => {/* show load error handled via null state */})
      .finally(() => setIsLoadingShow(false));
  }, [showId]);

  // Poll session state every POLL_INTERVAL_MS while the show is LIVE
  useEffect(() => {
    if (!show || show.status !== 'LIVE') return;

    fetchSession();
    const interval = setInterval(fetchSession, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [show?.status, fetchSession]);

  if (isLoadingShow) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  if (!show) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Show não encontrado.</p>
        <Link to="/shows" className="text-brand-500 hover:underline text-sm">← Ver todos os shows</Link>
      </div>
    );
  }

  const isLive = show.status === 'LIVE';
  const isEnded = show.status === 'ENDED';

  const pinnedItem = session?.pinnedItem;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link to={`/shows/${show.id}`} className="text-gray-400 hover:text-gray-600 text-sm mb-6 inline-block">
        ← Detalhes do show
      </Link>

      {/* Show header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-3 mb-2">
          {isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
              🔴 Ao vivo agora
            </span>
          )}
          {isEnded && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              Encerrado
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{show.title}</h1>
        {show.description && (
          <p className="text-gray-600 text-sm mb-2">{show.description}</p>
        )}
        <p className="text-sm text-gray-500">
          Vendedor:{' '}
          <span className="font-medium text-gray-700">{show.seller?.name ?? 'Vendedor'}</span>
        </p>
      </div>

      {/* Not live yet */}
      {!isLive && !isEnded && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-8 text-center text-blue-700 mb-6">
          <p className="font-semibold mb-1">O show ainda não começou.</p>
          <p className="text-sm">Volte quando o vendedor iniciar a transmissão.</p>
        </div>
      )}

      {/* Ended */}
      {isEnded && (
        <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500 mb-6">
          A transmissão foi encerrada.
        </div>
      )}

      {/* Live content */}
      {isLive && (
        <>
          {sessionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
              {sessionError}
            </div>
          )}

          {/* Playback area */}
          {session?.playbackUrl ? (
            <div className="bg-black rounded-2xl overflow-hidden mb-6 aspect-video flex items-center justify-center">
              <video
                src={session.playbackUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl mb-6 aspect-video flex items-center justify-center text-gray-400 text-sm">
              Transmissão ao vivo em breve…
            </div>
          )}

          {/* Pinned item */}
          {pinnedItem ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-100 mb-6">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">
                📌 Item em destaque
              </p>
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 bg-gray-100 rounded-xl flex items-center justify-center text-3xl shrink-0">
                  📦
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    {pinnedItem.inventoryItem.title}
                  </h2>
                  {pinnedItem.inventoryItem.description && (
                    <p className="text-sm text-gray-600 mb-2">{pinnedItem.inventoryItem.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mb-2">
                    {CONDITION_LABELS[pinnedItem.inventoryItem.condition]}
                  </p>
                  <p className="text-2xl font-extrabold text-brand-500">
                    R$ {Number(pinnedItem.inventoryItem.startingPrice).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">lance inicial</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 mb-6">
              Nenhum item em destaque no momento.
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">
            Esta página atualiza automaticamente a cada {POLL_INTERVAL_MS / 1000} segundos.
          </p>
        </>
      )}
    </div>
  );
}
