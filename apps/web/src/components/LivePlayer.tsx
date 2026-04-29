import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface LivePlayerProps {
  playbackUrl?: string | null;
  controls?: boolean;
  containerClassName?: string;
  videoClassName?: string;
  placeholderClassName?: string;
}

/**
 * Cross-browser HLS player.
 *
 * - In Safari (and any browser with native HLS support) the URL is assigned
 *   directly to the video element so the browser handles playback natively.
 * - In all other browsers hls.js loads the manifest and feeds the decoded
 *   media segments to a MediaSource object attached to the video element.
 * - When `playbackUrl` is absent the component renders the "transmissão em
 *   breve" placeholder so the caller does not need to branch on its own.
 */
export default function LivePlayer({
  playbackUrl,
  controls = true,
  containerClassName = 'bg-black rounded-2xl overflow-hidden mb-6 aspect-video flex items-center justify-center',
  videoClassName = 'w-full h-full object-contain',
  placeholderClassName = 'bg-gray-900 rounded-2xl mb-6 aspect-video flex items-center justify-center text-gray-400 text-sm',
}: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) return;
    const videoEl = video;
    let isDisposed = false;

    // Clean up any previous playback state before attaching a new source.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.srcObject = null;
    videoEl.load();

    async function attachWebRtcPlayback(url: string) {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      });
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      videoEl.srcObject = remoteStream;

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        event.streams.forEach((stream) => {
          stream.getTracks().forEach((track) => remoteStream.addTrack(track));
        });
        void videoEl.play().catch(() => {});
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Timed out waiting for ICE candidates.')), 15_000);
        if (pc.iceGatheringState === 'complete') {
          window.clearTimeout(timeout);
          resolve();
          return;
        }

        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            window.clearTimeout(timeout);
            pc.onicegatheringstatechange = null;
            resolve();
          }
        };
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription?.sdp,
      });

      if (!response.ok) {
        throw new Error(`Playback endpoint returned ${response.status}`);
      }

      const answerSdp = await response.text();
      if (isDisposed) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    }

    if (playbackUrl.includes('/webRTC/play')) {
      void attachWebRtcPlayback(playbackUrl).catch(() => {
        if (isDisposed) return;
        videoEl.pause();
        videoEl.srcObject = null;
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari, some mobile browsers).
      videoEl.src = playbackUrl;
      void videoEl.play().catch(() => {});
    } else if (Hls.isSupported()) {
      // Use hls.js for browsers without native HLS support (Chrome, Firefox…).
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(playbackUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void videoEl.play().catch(() => {});
      });
    }

    return () => {
      isDisposed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.srcObject = null;
      videoEl.load();
    };
  }, [playbackUrl]);

  if (!playbackUrl) {
    return (
      <div className={placeholderClassName}>
        Transmissão ao vivo em breve…
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <video
        ref={videoRef}
        controls={controls}
        autoPlay
        playsInline
        className={videoClassName}
      />
    </div>
  );
}
