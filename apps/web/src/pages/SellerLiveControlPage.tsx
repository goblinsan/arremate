import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Radio, Pin, Mic, ArrowLeft, Info, Camera, CameraOff, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, MonitorPlay, Wifi, WifiOff, MessageSquare, Send } from 'lucide-react';
import type { Show, ShowSession, ShowInventoryItem, InventoryItem, GoLiveResponse, BroadcastPayload, ChatMessage } from '@arremate/types';
import { useBroadcastPublisher } from '../hooks/useBroadcastPublisher';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const CHAT_POLL_INTERVAL_MS = 3000;

interface QueueEntry extends ShowInventoryItem {
  inventoryItem: InventoryItem;
}

interface LiveShow extends Show {
  queueItems: QueueEntry[];
}

export default function SellerLiveControlPage() {
  const { id: showId } = useParams<{ id: string }>();
  const { getAccessToken, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [show, setShow] = useState<LiveShow | null>(null);
  const [session, setSession] = useState<ShowSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isBastao, setIsBastao] = useState(false);
  const [streamPlaybackUrl, setStreamPlaybackUrl] = useState('');
  const [isUpdatingStream, setIsUpdatingStream] = useState(false);
  const [showStreamGuide, setShowStreamGuide] = useState(false);
  const [bastaoTarget, setBastaoTarget] = useState<{ showId: string; showTitle: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState<BroadcastPayload | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    publishState,
    localStream,
    error: publishError,
    reconnectCount,
    startPreview,
    stopPreview,
    startPublish,
    stopPublish,
    reset: resetPublisher,
  } = useBroadcastPublisher();

  // Attach local stream to preview element
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const loadShow = useCallback(async () => {
    if (!showId) return;
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/v1/seller/shows/${showId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      navigate('/seller/shows');
      return;
    }
    if (!res.ok) throw new Error('Erro ao carregar show.');
    const data: LiveShow = await res.json();
    setShow(data);
    return data;
  }, [showId, getAccessToken, navigate]);

  const loadSession = useCallback(async (data: LiveShow) => {
    if (data.status !== 'LIVE') return;
    try {
      const res = await fetch(`${API_URL}/v1/shows/${data.id}/session`);
      if (res.ok) {
        const s: ShowSession = await res.json();
        setSession(s);
      } else {
        setSession(null);
      }
    } catch {
      // session not yet available
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    loadShow()
      .then((data) => {
        if (data) return loadSession(data);
      })
      .catch(() => setError('Erro ao carregar show.'))
      .finally(() => setIsLoading(false));
  }, [isAuthenticated, showId, loadShow, loadSession]);

  useEffect(() => {
    setStreamPlaybackUrl(session?.playbackUrl ?? '');
  }, [session?.playbackUrl]);

  const fetchMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API_URL}/v1/sessions/${sessionId}/chat`);
      if (!res.ok) return;
      const data = await res.json() as ChatMessage[];
      setMessages(data);
    } catch {
      // Best-effort for studio chat polling.
    }
  }, []);

  // Reconstruct broadcast state from session data when the page is loaded for an
  // already-live show (e.g. after a page refresh).  publishToken is short-lived
  // and not persisted, but the publishUrl (which embeds auth for most providers)
  // and ingestMode are stored on the session and are enough to restore the UI.
  // ingestMode is nullable in the schema for backwards-compat with older sessions;
  // defaulting to 'RTMP_EXTERNAL' is safe: if publishUrl is also null the native
  // studio section won't render regardless, and the external-encoder panel is
  // the correct fallback for sessions that pre-date the ingestMode column.
  // Use the functional updater form to avoid including `broadcast` in the deps
  // and to ensure we never overwrite a broadcast already set by handleGoLive.
  useEffect(() => {
    if (session) {
      setBroadcast((current) => {
        if (current) return current;
        return {
          mode: session.ingestMode ?? 'RTMP_EXTERNAL',
          provider: session.providerName ?? 'stub',
          publishUrl: session.publishUrl ?? undefined,
          playbackUrl: session.playbackUrl ?? undefined,
        };
      });
    }
  }, [session]);

  // Auto-expand the external encoder panel when native WHIP streaming fails so
  // the fallback path is immediately visible without an extra click.
  useEffect(() => {
    if (publishState === 'ERROR' && broadcast?.mode === 'NATIVE_WEBRTC') {
      setShowFallback(true);
    }
  }, [publishState, broadcast?.mode]);

  useEffect(() => {
    if (!session || show?.status !== 'LIVE') return;
    void fetchMessages(session.id);
    const interval = window.setInterval(() => {
      void fetchMessages(session.id);
    }, CHAT_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchMessages, session, show?.status]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleGoLive() {
    if (!show) return;
    setError(null);
    setIsStarting(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${show.id}/go-live`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao iniciar sessão.');
      }
      const body = (await res.json()) as GoLiveResponse;
      setSession(body.session);
      setBroadcast(body.broadcast);
      setShow((prev) => prev ? { ...prev, status: 'LIVE' } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar sessão.');
    } finally {
      setIsStarting(false);
    }
  }

  async function handlePin(queueItemId: string) {
    if (!session) return;
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/sessions/${session.id}/pin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueItemId }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao fixar item.');
      }
      const updated: ShowSession = await res.json();
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fixar item.');
    }
  }

  async function handleUnpin() {
    if (!session) return;
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/sessions/${session.id}/pin`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao desafixar item.');
      }
      const updated: ShowSession = await res.json();
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desafixar item.');
    }
  }

  async function handleSoldOut(itemId: string, soldOut: boolean) {
    if (!show) return;
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${show.id}/queue/${itemId}/sold-out`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ soldOut }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao atualizar item.');
      }
      const updatedEntry = await res.json() as QueueEntry;
      setShow((prev) =>
        prev
          ? {
              ...prev,
              queueItems: prev.queueItems.map((q) =>
                q.id === itemId ? { ...q, soldOut: updatedEntry.soldOut } : q,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar item.');
    }
  }

  async function handlePassarBastao() {
    if (!session) return;
    if (!confirm('Passar o bastão para outro show ao vivo? Seus espectadores serão redirecionados automaticamente.')) return;
    setError(null);
    setIsBastao(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/sessions/${session.id}/passar-bastao`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao passar o bastão.');
      }
      const data = await res.json() as { session: typeof session; targetShowId: string; targetShowTitle: string };
      setSession(data.session);
      setShow((prev) => prev ? { ...prev, status: 'ENDED' } : prev);
      setBastaoTarget({ showId: data.targetShowId, showTitle: data.targetShowTitle });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao passar o bastão.');
    } finally {
      setIsBastao(false);
    }
  }

  async function handleUpdateStream() {
    if (!session) return;
    setError(null);
    setIsUpdatingStream(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/sessions/${session.id}/stream`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playbackUrl: streamPlaybackUrl.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Erro ao atualizar stream.');
      }

      const updated: ShowSession = await res.json();
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar stream.');
    } finally {
      setIsUpdatingStream(false);
    }
  }

  async function handleEndSession() {
    if (!session) return;
    if (!confirm('Encerrar a sessão ao vivo? Isso não pode ser desfeito.')) return;
    setError(null);
    setIsEnding(true);
    try {
      stopPublish();
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/sessions/${session.id}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao encerrar sessão.');
      }
      const ended: ShowSession = await res.json();
      setSession(ended);
      setShow((prev) => prev ? { ...prev, status: 'ENDED' } : prev);
      resetPublisher();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar sessão.');
    } finally {
      setIsEnding(false);
    }
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !chatInput.trim()) return;

    setChatError(null);
    setIsSendingMessage(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/sessions/${session.id}/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: chatInput.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? 'Não foi possível responder ao chat.');
      }

      const message = await res.json() as ChatMessage;
      setMessages((current) => [...current, message]);
      setChatInput('');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Não foi possível responder ao chat.');
    } finally {
      setIsSendingMessage(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para controlar o show.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  if (!show) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Show não encontrado.</p>
        <Link to="/seller/shows" className="text-brand-500 hover:underline text-sm inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Meus Shows</Link>
      </div>
    );
  }

  const isLive = show.status === 'LIVE';
  const isEnded = show.status === 'ENDED' || show.status === 'CANCELLED';
  const canGoLive = show.status === 'SCHEDULED';

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <Link to={`/seller/shows/${show.id}`} className="text-gray-400 hover:text-gray-600 text-sm inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Editar Show
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 truncate">{show.title}</h1>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 ${
            isLive
              ? 'bg-red-100 text-red-700'
              : isEnded
              ? 'bg-gray-100 text-gray-500'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {isLive ? <><Radio className="w-3 h-3" /> Ao vivo</> : show.status}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {/* Go-live panel */}
      {canGoLive && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6 text-center">
          <p className="text-gray-600 mb-4 text-sm">
            O show está agendado. Quando estiver pronto, inicie a transmissão ao vivo.
          </p>
          <button
            onClick={handleGoLive}
            disabled={isStarting}
            className="bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors"
          >
            {isStarting ? 'Iniciando…' : <><Radio className="w-4 h-4 mr-1.5 inline" />Ir ao vivo</>}
          </button>
        </div>
      )}

      {/* Ended panel */}
      {isEnded && (
        <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-500 mb-6">
          {bastaoTarget ? (
            <>
              <p className="font-semibold text-gray-700 mb-2 flex items-center justify-center gap-2"><Mic className="w-4 h-4" /> Bastão passado com sucesso!</p>
              <p className="text-sm mb-3">Seus espectadores foram redirecionados para:</p>
              <Link
                to={`/shows/${bastaoTarget.showId}/live`}
                className="text-brand-500 font-semibold hover:underline"
              >
                {bastaoTarget.showTitle}
              </Link>
            </>
          ) : (
            'Este show foi encerrado.'
          )}
          {show.status === 'ENDED' && (
            <div className="mt-4">
              <Link
                to={`/seller/shows/${show.id}/analytics`}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
              >
                Ver analytics do show
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Live control panel */}
      {isLive && session && (
        <>
          {/* Native Broadcast Studio */}
          {broadcast?.mode === 'NATIVE_WEBRTC' && broadcast.publishUrl && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <MonitorPlay className="w-4 h-4 text-brand-500" />
                  Studio de transmissão
                </h2>
                {publishState === 'LIVE' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
                    <Radio className="w-3 h-3" /> Ao vivo
                  </span>
                )}
                {publishState === 'RECONNECTING' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Reconectando…
                  </span>
                )}
              </div>

              {/* Preflight: IDLE state */}
              {publishState === 'IDLE' && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-5 text-center">
                  <Camera className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700 mb-1">Pronto para transmitir pelo navegador</p>
                  <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
                    O Arremate vai solicitar acesso à câmera e microfone. Aceite a permissão para ver o preview e começar a transmissão.
                  </p>
                  {typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent) && (
                    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700 text-left">
                      <p className="font-semibold mb-1 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> iPhone / iPad</p>
                      <p>Certifique-se de que o Safari tem permissão de Câmera e Microfone em Ajustes do iPhone. Em Safari, acesse Ajustes &gt; Safari &gt; Câmera e Microfone e selecione Permitir.</p>
                    </div>
                  )}
                  <button
                    onClick={startPreview}
                    className="bg-brand-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors inline-flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" /> Ativar câmera e microfone
                  </button>
                </div>
              )}

              {/* Preflight: PREPARING state */}
              {publishState === 'PREPARING' && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-5 text-center">
                  <Camera className="w-8 h-8 text-gray-300 mx-auto mb-3 animate-pulse" />
                  <p className="text-sm text-gray-500">Aguardando permissão de câmera e microfone…</p>
                  <p className="text-xs text-gray-400 mt-1">Aceite a solicitação do navegador para continuar.</p>
                </div>
              )}

              {/* Preview: READY / CONNECTING / LIVE / RECONNECTING state */}
              {(publishState === 'READY' || publishState === 'CONNECTING' || publishState === 'LIVE' || publishState === 'RECONNECTING') && (
                <div className="space-y-4">
                  {/* Local preview */}
                  <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {publishState === 'READY' && (
                      <div className="absolute bottom-2 left-2 text-xs font-semibold bg-black/60 text-white px-2 py-0.5 rounded-full">
                        Preview
                      </div>
                    )}
                    {publishState === 'LIVE' && (
                      <div className="absolute bottom-2 left-2 text-xs font-semibold bg-red-600/90 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Radio className="w-2.5 h-2.5" /> Ao vivo
                      </div>
                    )}
                    {publishState === 'CONNECTING' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="text-white text-sm font-medium">Conectando…</span>
                      </div>
                    )}
                    {publishState === 'RECONNECTING' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="text-white text-sm font-medium flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Reconectando… (tentativa {reconnectCount})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Publish controls */}
                  <div className="flex flex-wrap gap-3 items-center">
                    {(publishState === 'READY') && (
                      <button
                        onClick={() => void startPublish(broadcast.publishUrl!, broadcast.publishToken)}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors inline-flex items-center gap-2"
                      >
                        <Wifi className="w-4 h-4" /> Iniciar transmissão
                      </button>
                    )}
                    {(publishState === 'LIVE' || publishState === 'CONNECTING' || publishState === 'RECONNECTING') && (
                      <button
                        onClick={stopPublish}
                        className="bg-gray-700 hover:bg-gray-800 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors inline-flex items-center gap-2"
                      >
                        <WifiOff className="w-4 h-4" /> Parar transmissão
                      </button>
                    )}
                    <button
                      onClick={stopPreview}
                      className="text-gray-400 hover:text-gray-600 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                    >
                      <CameraOff className="w-3.5 h-3.5" /> Desativar câmera
                    </button>
                  </div>
                </div>
              )}

              {/* Error state */}
              {publishState === 'ERROR' && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-4">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{publishError ?? 'Erro ao transmitir.'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={startPreview}
                      className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-semibold px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </button>
                    <button
                      onClick={() => setShowFallback(true)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      Usar encoder externo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* External encoder fallback - primary panel when no native publish URL, or opened manually */}
          {(broadcast?.mode !== 'NATIVE_WEBRTC' || !broadcast?.publishUrl || showFallback) && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-base font-semibold text-gray-800">Video ao vivo</h2>
                <button
                  type="button"
                  onClick={() => setShowStreamGuide((prev) => !prev)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
                >
                  <Info className="w-3.5 h-3.5" />
                  {showStreamGuide ? 'Fechar guia' : 'Como transmitir'}
                </button>
              </div>

              {showStreamGuide && (
                <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-gray-700 space-y-2">
                  <p className="font-semibold text-gray-800">Guia rapido (funciona hoje)</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Clique em Ir ao vivo no Arremate.</li>
                    <li>Inicie o stream no Larix (iPhone) ou PRISM/OBS (desktop).</li>
                    <li>Copie a URL publica HLS (.m3u8).</li>
                    <li>Cole abaixo e clique em Atualizar video.</li>
                  </ol>
                  <p className="text-gray-600">Dica: aguarde 10-30s e confirme no modo comprador.</p>
                </div>
              )}

              {/* RTMP ingest credentials when available */}
              {(broadcast?.fallbackRtmp ?? session.publishUrl) && (
                <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700 space-y-2">
                  <p className="font-semibold text-gray-800">Dados para encoder externo (RTMP)</p>
                  {broadcast?.fallbackRtmp && (
                    <>
                      <div>
                        <span className="text-gray-500 font-medium">URL de ingest:</span>
                        <code className="ml-2 bg-white border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-800 select-all">{broadcast.fallbackRtmp.ingestUrl}</code>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium">Stream key:</span>
                        <code className="ml-2 bg-white border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-800 select-all">{broadcast.fallbackRtmp.streamKey}</code>
                      </div>
                    </>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-500 mb-3">
                Cole a URL publica de playback do seu stream (ex.: HLS .m3u8) para que compradores assistam ao vivo.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  value={streamPlaybackUrl}
                  onChange={(e) => setStreamPlaybackUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={handleUpdateStream}
                  disabled={isUpdatingStream || streamPlaybackUrl.trim().length === 0}
                  className="bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
                >
                  {isUpdatingStream ? 'Atualizando…' : 'Atualizar video'}
                </button>
              </div>

              {session.playbackUrl && (
                <div className="mt-4 bg-black rounded-xl overflow-hidden aspect-video">
                  <video src={session.playbackUrl} controls autoPlay muted className="w-full h-full object-contain" />
                </div>
              )}
            </div>
          )}

          {/* Encoder external toggle - only shown when native is available but fallback is not yet open */}
          {broadcast?.mode === 'NATIVE_WEBRTC' && broadcast.publishUrl && !showFallback && (
            <button
              type="button"
              onClick={() => setShowFallback((prev) => !prev)}
              className="w-full text-xs text-gray-400 hover:text-gray-600 font-medium flex items-center justify-center gap-1.5 mb-6 py-2 transition-colors"
            >
              {showFallback ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Encoder externo (avançado)
            </button>
          )}

          {/* Currently pinned item */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">Item fixado</h2>
              {session.pinnedItemId && (
                <button
                  onClick={handleUnpin}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Desafixar
                </button>
              )}
            </div>
            {session.pinnedItem ? (
              <div className="flex items-center gap-3 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                <Pin className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">{session.pinnedItem.inventoryItem.title}</p>
                  <p className="text-sm text-brand-500 font-bold">
                    R$ {Number(session.pinnedItem.inventoryItem.startingPrice).toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhum item fixado. Selecione um item da fila abaixo.</p>
            )}
          </div>

          {/* Queue items */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Fila de itens</h2>
            {show.queueItems.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum item na fila.</p>
            ) : (
              <ol className="space-y-2">
                {show.queueItems.map((entry, index) => {
                  const isPinned = session.pinnedItemId === entry.id;
                  return (
                    <li
                      key={entry.id}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${
                        isPinned
                          ? 'bg-red-50 border-red-200'
                          : entry.soldOut
                          ? 'bg-gray-50 border-gray-100 opacity-60'
                          : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <span className="text-xs font-bold text-gray-400 w-5 text-center">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate block">
                          {entry.inventoryItem.title}
                        </span>
                        <span className="text-xs text-brand-500 font-semibold">
                          R$ {Number(entry.inventoryItem.startingPrice).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.soldOut ? (
                          <span className="text-xs text-gray-400 font-medium">Esgotado</span>
                        ) : (
                          <>
                            {isPinned ? (
                              <button
                                onClick={handleUnpin}
                                className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded-lg font-medium transition-colors"
                              >
                              <Pin className="w-3 h-3 mr-0.5 inline" /> Fixado
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePin(entry.id)}
                                className="text-xs bg-gray-200 text-gray-600 hover:bg-gray-300 px-2 py-1 rounded-lg font-medium transition-colors"
                              >
                                Fixar
                              </button>
                            )}
                            <button
                              onClick={() => handleSoldOut(entry.id, true)}
                              className="text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 px-2 py-1 rounded-lg font-medium transition-colors"
                            >
                              Esgotado
                            </button>
                          </>
                        )}
                        {entry.soldOut && (
                          <button
                            onClick={() => handleSoldOut(entry.id, false)}
                            className="text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 px-2 py-1 rounded-lg font-medium transition-colors"
                          >
                            Reativar
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-500" />
                Chat da transmissão
              </h2>
              <span className="text-xs text-gray-400">
                {messages.length} mensagem(ns)
              </span>
            </div>

            <div
              ref={chatContainerRef}
              className="max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 px-4 py-4"
            >
              {messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">
                  As mensagens do público aparecerão aqui enquanto o show estiver ao vivo.
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div key={message.id} className="rounded-xl bg-white px-3 py-2 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500">
                        {message.user?.name ?? 'Usuário'}
                      </p>
                      <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="mt-4">
              {chatError && (
                <p className="mb-2 text-xs text-red-600">{chatError}</p>
              )}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  maxLength={300}
                  placeholder="Responder no chat ao vivo…"
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="submit"
                  disabled={isSendingMessage || !chatInput.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  {isSendingMessage ? 'Enviando…' : 'Responder'}
                </button>
              </div>
            </form>
          </div>

          {/* End session */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handlePassarBastao}
              disabled={isBastao || isEnding}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
              title="Encerra seu show e redireciona seus espectadores para outro show ao vivo"
            >
              {isBastao ? 'Passando…' : <><Mic className="w-4 h-4 mr-1.5 inline" />Passar o Bastão</>}
            </button>
            <button
              onClick={handleEndSession}
              disabled={isEnding || isBastao}
              className="bg-gray-800 hover:bg-gray-900 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              {isEnding ? 'Encerrando…' : 'Encerrar sessão'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
