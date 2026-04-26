import { useCallback, useEffect, useRef, useState } from 'react';

export type PublishState =
  | 'IDLE'
  | 'PREPARING'
  | 'READY'
  | 'CONNECTING'
  | 'LIVE'
  | 'RECONNECTING'
  | 'ENDED'
  | 'ERROR';

export interface BroadcastPublisherState {
  publishState: PublishState;
  localStream: MediaStream | null;
  error: string | null;
  reconnectCount: number;
}

export interface BroadcastPublisherActions {
  startPreview: () => Promise<void>;
  stopPreview: () => void;
  startPublish: (publishUrl: string, publishToken?: string) => Promise<void>;
  stopPublish: () => void;
  reset: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 3000;

function isWebRTCSupported(): boolean {
  return (
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function useBroadcastPublisher(): BroadcastPublisherState & BroadcastPublisherActions {
  const [publishState, setPublishState] = useState<PublishState>('IDLE');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const publishParamsRef = useRef<{ publishUrl: string; publishToken?: string } | null>(null);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      cleanupPC();
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  function cleanupPC() {
    if (pcRef.current) {
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }

  const startPreview = useCallback(async () => {
    if (!isWebRTCSupported()) {
      setError('Seu navegador nao suporta transmissao nativa. Use o modo encoder externo.');
      setPublishState('ERROR');
      return;
    }
    setError(null);
    setPublishState('PREPARING');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (isUnmountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setLocalStream(stream);
      setPublishState('READY');
    } catch (err) {
      if (isUnmountedRef.current) return;
      const msg = getMediaErrorMessage(err);
      setError(msg);
      setPublishState('ERROR');
    }
  }, []);

  const stopPreview = useCallback(() => {
    setLocalStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop());
      return null;
    });
    cleanupPC();
    reconnectAttemptsRef.current = 0;
    publishParamsRef.current = null;
    setPublishState('IDLE');
    setError(null);
  }, []);

  const connectWHIP = useCallback(
    async (publishUrl: string, publishToken?: string, isReconnect = false) => {
      if (isUnmountedRef.current) return;

      cleanupPC();

      const stream = localStream;
      if (!stream) {
        setError('Nenhuma midia local disponivel para publicar.');
        setPublishState('ERROR');
        return;
      }

      setPublishState(isReconnect ? 'RECONNECTING' : 'CONNECTING');

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.oniceconnectionstatechange = () => {
          if (isUnmountedRef.current) return;
          const state = pc.iceConnectionState;
          if (state === 'connected' || state === 'completed') {
            reconnectAttemptsRef.current = 0;
            setPublishState('LIVE');
          } else if (state === 'disconnected' || state === 'failed') {
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttemptsRef.current += 1;
              setReconnectCount((c) => c + 1);
              setPublishState('RECONNECTING');
              reconnectTimerRef.current = setTimeout(() => {
                if (!isUnmountedRef.current && publishParamsRef.current) {
                  void connectWHIP(
                    publishParamsRef.current.publishUrl,
                    publishParamsRef.current.publishToken,
                    true,
                  );
                }
              }, RECONNECT_DELAY_MS);
            } else {
              setError('Conexao perdida apos multiplas tentativas. Verifique sua rede e tente novamente.');
              setPublishState('ERROR');
            }
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const headers: HeadersInit = { 'Content-Type': 'application/sdp' };
        if (publishToken) headers['Authorization'] = `Bearer ${publishToken}`;

        const resp = await fetch(publishUrl, {
          method: 'POST',
          headers,
          body: offer.sdp,
        });

        if (!resp.ok) {
          throw new Error(`WHIP endpoint retornou ${resp.status}`);
        }

        const answerSdp = await resp.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      } catch (err) {
        if (isUnmountedRef.current) return;
        cleanupPC();
        setError(err instanceof Error ? err.message : 'Erro ao conectar ao servidor de transmissao.');
        setPublishState('ERROR');
      }
    },
    [localStream],
  );

  const startPublish = useCallback(
    async (publishUrl: string, publishToken?: string) => {
      publishParamsRef.current = { publishUrl, publishToken };
      reconnectAttemptsRef.current = 0;
      setReconnectCount(0);
      await connectWHIP(publishUrl, publishToken);
    },
    [connectWHIP],
  );

  const stopPublish = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    cleanupPC();
    reconnectAttemptsRef.current = 0;
    publishParamsRef.current = null;
    setPublishState('READY');
    setError(null);
  }, []);

  const reset = useCallback(() => {
    stopPreview();
    setReconnectCount(0);
    setPublishState('IDLE');
    setError(null);
  }, [stopPreview]);

  return {
    publishState,
    localStream,
    error,
    reconnectCount,
    startPreview,
    stopPreview,
    startPublish,
    stopPublish,
    reset,
  };
}

function getMediaErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Permissao de camera/microfone negada. Verifique as configuracoes do navegador e tente novamente.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'Camera ou microfone nao encontrado. Conecte um dispositivo e tente novamente.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Camera ou microfone em uso por outro aplicativo. Feche-o e tente novamente.';
    }
    if (err.name === 'OverconstrainedError') {
      return 'Configuracao de camera nao suportada pelo dispositivo.';
    }
    if (err.name === 'SecurityError') {
      return 'Acesso a camera/microfone bloqueado por politica de seguranca. Use HTTPS.';
    }
    return err.message;
  }
  return 'Erro ao acessar camera ou microfone.';
}
