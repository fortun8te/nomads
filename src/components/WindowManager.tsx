/**
 * WindowManager — Renders all open windows as absolutely positioned divs.
 *
 * Each window features:
 * - Traffic light buttons (close / minimize / maximize)
 * - Draggable title bar
 * - Resize handle (bottom-right corner)
 * - Slot-based content via render prop
 * - Liquid glass styling: backdrop-blur, semi-transparent dark bg, subtle border
 * - Framer Motion open/close animations
 */

import React, { useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { WindowState } from '../utils/windowManager'
import {
  useWindowManager,
} from '../hooks/useWindowManager'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WindowContentMap {
  [appId: string]: ReactNode
}

interface WindowManagerProps {
  /** Map of appId → content to render inside that window */
  contentMap?: WindowContentMap
  /** Fallback content renderer if appId is not in contentMap */
  renderContent?: (win: WindowState) => ReactNode
  /** Container dimensions used to clamp maximized windows */
  containerWidth?: number
  containerHeight?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TITLE_BAR_HEIGHT = 40
const TRAFFIC_LIGHT_SIZE = 12
const TRAFFIC_LIGHT_GAP = 8
const TRAFFIC_LIGHT_LEFT = 12

const COLORS = {
  close: '#FF5F57',
  minimize: '#FFBD2E',
  maximize: '#28C840',
  closeHover: '#FF3B30',
  minimizeHover: '#FF9500',
  maximizeHover: '#34C759',
}

// ── Traffic Light Button ──────────────────────────────────────────────────────

interface TrafficLightProps {
  color: string
  hoverColor: string
  onClick: (e: React.MouseEvent) => void
  title: string
  symbol: string
}

function TrafficLight({ color, hoverColor, onClick, title, symbol }: TrafficLightProps) {
  const [hovered, setHovered] = React.useState(false)

  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: TRAFFIC_LIGHT_SIZE,
        height: TRAFFIC_LIGHT_SIZE,
        borderRadius: '50%',
        background: hovered ? hoverColor : color,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.12s ease',
        padding: 0,
      }}
    >
      {hovered && (
        <span
          style={{
            fontSize: 7,
            lineHeight: 1,
            color: 'rgba(0,0,0,0.55)',
            fontWeight: 700,
            userSelect: 'none',
          }}
        >
          {symbol}
        </span>
      )}
    </button>
  )
}

// ── Single Window ─────────────────────────────────────────────────────────────

interface SingleWindowProps {
  win: WindowState
  content: ReactNode
  onClose: (id: string) => void
  onMinimize: (id: string) => void
  onMaximize: (id: string) => void
  onFocus: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, w: number, h: number) => void
  containerWidth: number
  containerHeight: number
}

function SingleWindow({
  win,
  content,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onMove,
  onResize,
  containerWidth,
  containerHeight,
}: SingleWindowProps) {
  const dragState = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null)
  const resizeState = useRef<{ startX: number; startY: number; winW: number; winH: number } | null>(null)

  // ── Drag (title bar) ──

  const handleTitlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only drag on left button, not on traffic lights
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        winX: win.x,
        winY: win.y,
      }
      onFocus(win.id)
    },
    [win.id, win.x, win.y, onFocus]
  )

  const handleTitlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      const newX = Math.max(0, Math.min(containerWidth - win.width, dragState.current.winX + dx))
      const newY = Math.max(0, Math.min(containerHeight - TITLE_BAR_HEIGHT, dragState.current.winY + dy))
      onMove(win.id, newX, newY)
    },
    [win.id, win.width, containerWidth, containerHeight, onMove]
  )

  const handleTitlePointerUp = useCallback(() => {
    dragState.current = null
  }, [])

  // ── Resize handle ──

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      resizeState.current = {
        startX: e.clientX,
        startY: e.clientY,
        winW: win.width,
        winH: win.height,
      }
    },
    [win.width, win.height]
  )

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeState.current) return
      const dx = e.clientX - resizeState.current.startX
      const dy = e.clientY - resizeState.current.startY
      onResize(win.id, resizeState.current.winW + dx, resizeState.current.winH + dy)
    },
    [win.id, onResize]
  )

  const handleResizePointerUp = useCallback(() => {
    resizeState.current = null
  }, [])

  // ── Computed geometry ──

  const isMax = win.maximized
  const posX = isMax ? 0 : win.x
  const posY = isMax ? 0 : win.y
  const width = isMax ? containerWidth : win.width
  const height = isMax ? containerHeight : win.height

  if (win.minimized) return null

  return (
    <motion.div
      key={win.id}
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
      onPointerDown={() => onFocus(win.id)}
      style={{
        position: 'absolute',
        left: posX,
        top: posY,
        width,
        height,
        zIndex: win.zIndex,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: isMax ? 0 : 12,
        overflow: 'hidden',
        // Liquid glass styling
        background: win.isActive
          ? 'linear-gradient(145deg, rgba(18,18,24,0.82) 0%, rgba(12,14,22,0.78) 100%)'
          : 'linear-gradient(145deg, rgba(14,14,18,0.72) 0%, rgba(10,11,18,0.68) 100%)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        border: win.isActive
          ? '1px solid rgba(255,255,255,0.15)'
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: win.isActive
          ? '0 24px 64px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 8px 32px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease, left 0.0s, top 0.0s, width 0.0s, height 0.0s',
      }}
    >
      {/* Title bar */}
      <div
        onPointerDown={handleTitlePointerDown}
        onPointerMove={handleTitlePointerMove}
        onPointerUp={handleTitlePointerUp}
        onDoubleClick={() => onMaximize(win.id)}
        style={{
          height: TITLE_BAR_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          cursor: 'grab',
          userSelect: 'none',
          background: win.isActive
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Traffic lights */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: TRAFFIC_LIGHT_GAP,
            paddingLeft: TRAFFIC_LIGHT_LEFT,
            zIndex: 1,
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          <TrafficLight
            color={COLORS.close}
            hoverColor={COLORS.closeHover}
            onClick={(e) => { e.stopPropagation(); onClose(win.id) }}
            title="Close"
            symbol="✕"
          />
          <TrafficLight
            color={COLORS.minimize}
            hoverColor={COLORS.minimizeHover}
            onClick={(e) => { e.stopPropagation(); onMinimize(win.id) }}
            title="Minimize"
            symbol="–"
          />
          <TrafficLight
            color={COLORS.maximize}
            hoverColor={COLORS.maximizeHover}
            onClick={(e) => { e.stopPropagation(); onMaximize(win.id) }}
            title={win.maximized ? 'Restore' : 'Maximize'}
            symbol="+"
          />
        </div>

        {/* Centered title */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: win.isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
              letterSpacing: '0.01em',
              transition: 'color 0.2s ease',
            }}
          >
            {win.title}
          </span>
        </div>
      </div>

      {/* Window content */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {content}
      </div>

      {/* Resize handle — bottom-right */}
      {!isMax && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 18,
            height: 18,
            cursor: 'nwse-resize',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 4,
          }}
        >
          {/* Grip dots */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <circle cx="8.5" cy="8.5" r="1" fill="rgba(255,255,255,0.25)" />
            <circle cx="5"   cy="8.5" r="1" fill="rgba(255,255,255,0.15)" />
            <circle cx="8.5" cy="5"   r="1" fill="rgba(255,255,255,0.15)" />
          </svg>
        </div>
      )}
    </motion.div>
  )
}

// ── WindowManager (root) ──────────────────────────────────────────────────────

export function WindowManager({
  contentMap = {},
  renderContent,
  containerWidth = 1188,
  containerHeight = 668,
}: WindowManagerProps) {
  const {
    windows,
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    moveWindow,
    resizeWindow,
  } = useWindowManager()

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <AnimatePresence>
        {windows.map(win => {
          const content =
            contentMap[win.appId] ??
            (renderContent ? renderContent(win) : null)

          return (
            <div
              key={win.id}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
            >
              <SingleWindow
                win={win}
                content={content}
                onClose={closeWindow}
                onMinimize={minimizeWindow}
                onMaximize={maximizeWindow}
                onFocus={focusWindow}
                onMove={moveWindow}
                onResize={resizeWindow}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
              />
            </div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
