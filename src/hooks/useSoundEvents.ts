/**
 * useSoundEvents — Wires app events to the sound engine.
 *
 * Subscribes to agent status transitions and fires appropriate sounds.
 * Designed to be called once at the top of AgentPanel.
 *
 * Props mirroring the AgentPanel state shape keep this hook dependency-free
 * from internal implementation details.
 */

import { useEffect, useRef } from 'react';
import {
  playSend,
  playReceive,
  playThinking,
  stopThinking,
  playStop,
  playSuccess,
  playError,
} from '../utils/soundEngine';

type AgentStatus = 'idle' | 'routing' | 'thinking' | 'streaming' | 'error';

interface SoundEventProps {
  /** Current agent status from AgentPanel */
  status: AgentStatus;
  /** Increments each time a user message is sent */
  sendCount: number;
  /** Increments each time a tool call completes successfully */
  successCount: number;
}

export function useSoundEvents({ status, sendCount, successCount }: SoundEventProps): void {
  const prevStatusRef    = useRef<AgentStatus>('idle');
  const prevSendRef      = useRef<number>(sendCount);
  const prevSuccessRef   = useRef<number>(successCount);
  const thinkingActiveRef = useRef<boolean>(false);

  // ── Sent message ──
  useEffect(() => {
    if (sendCount > prevSendRef.current) {
      prevSendRef.current = sendCount;
      playSend();
    }
  }, [sendCount]);

  // ── Tool call success ──
  useEffect(() => {
    if (successCount > prevSuccessRef.current) {
      prevSuccessRef.current = successCount;
      playSuccess();
    }
  }, [successCount]);

  // ── Status transitions ──
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    // Agent starts thinking or routing → start thinking loop
    if ((status === 'thinking' || status === 'routing') && !thinkingActiveRef.current) {
      thinkingActiveRef.current = true;
      playThinking();
      return;
    }

    // Agent was thinking and stops → stop loop + play stop sound
    if (thinkingActiveRef.current && status !== 'thinking' && status !== 'routing') {
      thinkingActiveRef.current = false;
      stopThinking();

      if (status === 'idle' && (prev === 'thinking' || prev === 'streaming' || prev === 'routing')) {
        // Completed normally
        return;
      }
      if (status === 'error') {
        playError();
        return;
      }
      // Explicit stop/abort
      playStop();
      return;
    }

    // Agent starts streaming response (after routing)
    if (status === 'streaming' && prev !== 'streaming') {
      playReceive();
      return;
    }

    // Error state
    if (status === 'error' && prev !== 'error') {
      stopThinking();
      thinkingActiveRef.current = false;
      playError();
      return;
    }
  }, [status]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopThinking();
      thinkingActiveRef.current = false;
    };
  }, []);
}
