/**
 * VNCViewer — React wrapper for noVNC RFB client.
 * Renders a live VNC stream from the Docker sandbox's websockify.
 */

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';

// noVNC doesn't have TS types — import as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RFB: any = null;

// Dynamic import of noVNC (it's an ES module)
const loadRFB = async () => {
  if (RFB) return RFB;
  try {
    const mod = await import('@novnc/novnc/lib/rfb.js');
    RFB = mod.default || mod;
    return RFB;
  } catch (e) {
    console.error('Failed to load noVNC:', e);
    return null;
  }
};

export interface VNCViewerProps {
  wsUrl: string;               // e.g. "ws://localhost:5901"
  viewOnly?: boolean;          // true = watch mode, false = interactive
  scaleViewport?: boolean;     // auto-scale to fit container
  style?: React.CSSProperties;
  className?: string;
  onConnect?: () => void;
  onDisconnect?: (clean: boolean) => void;
}

export interface VNCViewerHandle {
  disconnect: () => void;
  sendKey: (keysym: number, down: boolean) => void;
}

export const VNCViewer = forwardRef<VNCViewerHandle, VNCViewerProps>(function VNCViewer(
  { wsUrl, viewOnly = true, scaleViewport = true, style, className, onConnect, onDisconnect },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfbRef = useRef<any>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const disconnect = useCallback(() => {
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch {}
      rfbRef.current = null;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    disconnect,
    sendKey: (keysym: number, down: boolean) => {
      if (rfbRef.current) {
        rfbRef.current.sendKey(keysym, undefined, down);
      }
    },
  }), [disconnect]);

  useEffect(() => {
    if (!containerRef.current || !wsUrl) return;

    let mounted = true;

    const connect = async () => {
      const RFBClass = await loadRFB();
      if (!RFBClass || !mounted || !containerRef.current) return;

      // Clean up previous connection
      if (rfbRef.current) {
        try { rfbRef.current.disconnect(); } catch {}
      }

      setStatus('connecting');

      try {
        const rfb = new RFBClass(containerRef.current, wsUrl, {
          wsProtocols: ['binary'],
        });

        rfb.viewOnly = viewOnly;
        rfb.scaleViewport = scaleViewport;
        rfb.resizeSession = false;
        rfb.showDotCursor = !viewOnly;
        rfb.background = '#0a0a0b';
        rfb.qualityLevel = 6;
        rfb.compressionLevel = 2;

        rfb.addEventListener('connect', () => {
          if (!mounted) return;
          setStatus('connected');
          onConnect?.();
        });

        rfb.addEventListener('disconnect', (e: { detail: { clean: boolean } }) => {
          if (!mounted) return;
          setStatus('disconnected');
          onDisconnect?.(e.detail.clean);
        });

        rfbRef.current = rfb;
      } catch (e) {
        console.error('VNC connection error:', e);
        setStatus('disconnected');
      }
    };

    connect();

    return () => {
      mounted = false;
      disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  // Update viewOnly when prop changes (without reconnecting)
  useEffect(() => {
    if (rfbRef.current) {
      rfbRef.current.viewOnly = viewOnly;
      rfbRef.current.showDotCursor = !viewOnly;
    }
  }, [viewOnly]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        background: '#0a0a0b',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {status === 'connecting' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.25)',
          fontSize: 12,
          fontFamily: 'monospace',
        }}>
          Connecting to sandbox...
        </div>
      )}
      {status === 'disconnected' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(239,68,68,0.5)',
          fontSize: 12,
          fontFamily: 'monospace',
        }}>
          Sandbox disconnected
        </div>
      )}
    </div>
  );
});
