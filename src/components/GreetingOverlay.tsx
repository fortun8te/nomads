/**
 * GreetingOverlay — Full-screen splash with deep gradient background.
 * Context-aware: time of day, day of week.
 * Dismisses on click or after timeout.
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NAME = 'Michael';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeSlot(): TimeSlot {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function getGreetingPool(): Array<[string, string?]> {
  const time = getTimeSlot();
  const day = DAYS[new Date().getDay()];

  const pool: Array<[string, string?]> = [];

  if (time === 'morning') {
    pool.push(
      [`Morning, ${NAME}.`],
      [`Good morning.`],
      [`New day, ${NAME}.`],
    );
  } else if (time === 'afternoon') {
    pool.push(
      [`Afternoon, ${NAME}.`],
      [`Back at it.`],
      [`${NAME}.`],
    );
  } else if (time === 'evening') {
    pool.push(
      [`Evening, ${NAME}.`],
      [`Still going.`],
      [`${NAME}.`],
    );
  } else {
    pool.push(
      [`Late one, ${NAME}.`],
      [`Night shift.`],
      [`${NAME}.`],
    );
  }

  pool.push(
    [`${NAME}.`],
    [`Welcome back.`],
    [`Let's go, ${NAME}.`],
  );

  return pool;
}

function pickGreeting(): string {
  const pool = getGreetingPool();
  return pool[Math.floor(Math.random() * pool.length)][0];
}

interface GreetingOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function GreetingOverlay({ open, onClose }: GreetingOverlayProps) {
  const [greeting, setGreeting] = useState('');
  const [time, setTime] = useState('');
  const [dateLine, setDateLine] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open) {
      setGreeting(pickGreeting());
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase());
      setDateLine(`${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`);
    }
  }, [open]);

  // Grain texture
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 256;
    canvas.height = 256;
    const imageData = ctx.createImageData(256, 256);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
      data[i + 3] = 8;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [open]);

  // Auto-dismiss
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [open, onClose]);

  // ESC / click to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          onClick={onClose}
          className="fixed inset-0 z-[999] flex items-center justify-center cursor-pointer select-none overflow-hidden"
          style={{ background: '#050508' }}
        >
          {/* ── Deep gradient layers ── */}

          {/* Primary: large blue-indigo glow — bottom-right quadrant */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.5, ease: 'easeOut' }}
            className="absolute pointer-events-none"
            style={{
              bottom: '-20%', right: '-10%',
              width: '80%', height: '80%',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 60% 60%, rgba(30,64,175,0.35) 0%, rgba(30,58,138,0.15) 35%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />

          {/* Secondary: deep navy spread — center-bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2, delay: 0.2 }}
            className="absolute pointer-events-none"
            style={{
              bottom: '-10%', left: '20%',
              width: '70%', height: '60%',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at 50% 80%, rgba(15,23,42,0.9) 0%, rgba(30,58,138,0.08) 50%, transparent 75%)',
              filter: 'blur(40px)',
            }}
          />

          {/* Tertiary: subtle cyan accent — top-left */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 3, delay: 0.3, ease: 'easeOut' }}
            className="absolute pointer-events-none"
            style={{
              top: '-15%', left: '-10%',
              width: '50%', height: '50%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(56,189,248,0.06) 0%, rgba(30,64,175,0.03) 40%, transparent 65%)',
              filter: 'blur(50px)',
            }}
          />

          {/* Deep ambient: warm undertone — center */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 3, delay: 0.5 }}
            className="absolute pointer-events-none"
            style={{
              top: '30%', left: '40%',
              width: '40%', height: '40%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 60%)',
              filter: 'blur(80px)',
            }}
          />

          {/* Edge light: bright blue point — bottom-right corner */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0.4 }}
            className="absolute pointer-events-none"
            style={{
              bottom: '5%', right: '15%',
              width: '25%', height: '25%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(37,99,235,0.04) 40%, transparent 65%)',
              filter: 'blur(30px)',
            }}
          />

          {/* Grain */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
            style={{ mixBlendMode: 'overlay' }}
          />

          {/* ── Content ── */}
          <div className="relative w-full max-w-[680px] px-12">
            {/* Time + date */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="flex items-center gap-3 mb-6"
            >
              <span className="text-[11px] font-mono tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.12)' }}>
                {time}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.06)' }}>|</span>
              <span className="text-[11px] font-mono tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.12)' }}>
                {dateLine}
              </span>
            </motion.div>

            {/* Greeting */}
            <motion.h1
              initial={{ opacity: 0, y: 30, filter: 'blur(12px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="text-[48px] font-extralight tracking-[-0.03em] leading-[1.1]"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              {greeting}
            </motion.h1>

            {/* Accent line */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 1, delay: 0.7, ease: [0.23, 1, 0.32, 1] }}
              className="mt-8 origin-left"
              style={{
                width: 32,
                height: 1,
                background: 'linear-gradient(90deg, rgba(59,130,246,0.4), rgba(59,130,246,0.05))',
              }}
            />
          </div>

          {/* Bottom — version, very faint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="absolute bottom-7 left-12"
          >
            <span className="text-[9px] font-mono tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.05)' }}>
              NOMAD
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
