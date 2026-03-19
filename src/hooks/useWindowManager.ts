/**
 * useWindowManager — React hook wrapping the window manager store.
 *
 * Subscribes to store updates and re-renders on every change.
 * Returns all windows plus the full action API.
 */

import { useState, useEffect, useCallback } from 'react'
import type { WindowState, DefaultSize } from '../utils/windowManager'
import {
  getWindows,
  addListener,
  openWindow as _openWindow,
  closeWindow as _closeWindow,
  focusWindow as _focusWindow,
  minimizeWindow as _minimizeWindow,
  unminimizeWindow as _unminimizeWindow,
  maximizeWindow as _maximizeWindow,
  moveWindow as _moveWindow,
  resizeWindow as _resizeWindow,
} from '../utils/windowManager'

export interface UseWindowManagerReturn {
  windows: WindowState[]
  openWindow: (appId: string, title: string, defaultSize?: DefaultSize) => WindowState
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  unminimizeWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, width: number, height: number) => void
}

export function useWindowManager(): UseWindowManagerReturn {
  const [windows, setWindows] = useState<WindowState[]>(() => getWindows())

  useEffect(() => {
    // Subscribe to store changes
    const unsub = addListener(() => setWindows(getWindows()))
    return unsub
  }, [])

  const openWindow = useCallback(
    (appId: string, title: string, defaultSize?: DefaultSize) =>
      _openWindow(appId, title, defaultSize),
    []
  )

  const closeWindow = useCallback((id: string) => _closeWindow(id), [])
  const focusWindow = useCallback((id: string) => _focusWindow(id), [])
  const minimizeWindow = useCallback((id: string) => _minimizeWindow(id), [])
  const unminimizeWindow = useCallback((id: string) => _unminimizeWindow(id), [])
  const maximizeWindow = useCallback((id: string) => _maximizeWindow(id), [])
  const moveWindow = useCallback((id: string, x: number, y: number) => _moveWindow(id, x, y), [])
  const resizeWindow = useCallback(
    (id: string, width: number, height: number) => _resizeWindow(id, width, height),
    []
  )

  return {
    windows,
    openWindow,
    closeWindow,
    focusWindow,
    minimizeWindow,
    unminimizeWindow,
    maximizeWindow,
    moveWindow,
    resizeWindow,
  }
}
