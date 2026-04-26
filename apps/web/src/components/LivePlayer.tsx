import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface LivePlayerProps {
  playbackUrl?: string | null;
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
export default function LivePlayer({ playbackUrl }: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) return;

    // Clean up any previous Hls instance before attaching a new source.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari, some mobile browsers).
      video.src = playbackUrl;
    } else if (Hls.isSupported()) {
      // Use hls.js for browsers without native HLS support (Chrome, Firefox…).
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackUrl]);

  if (!playbackUrl) {
    return (
      <div className="bg-gray-900 rounded-2xl mb-6 aspect-video flex items-center justify-center text-gray-400 text-sm">
        Transmissão ao vivo em breve…
      </div>
    );
  }

  return (
    <div className="bg-black rounded-2xl overflow-hidden mb-6 aspect-video flex items-center justify-center">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  );
}
