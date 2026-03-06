import { useState, useCallback } from 'react';

export interface ColorFontPreferences {
  colorPalette: 'warm' | 'cool' | 'neutral' | 'vibrant';
  fontStyle: 'system' | 'serif' | 'geometric' | 'script' | 'mono';
  textDensity: 'minimal' | 'balanced' | 'detailed';
}

const DEFAULT_PREFS: ColorFontPreferences = {
  colorPalette: 'warm',
  fontStyle: 'system',
  textDensity: 'balanced',
};

const STORAGE_KEY = 'nomad_color_font_prefs';

export function useColorFontPreferences() {
  const [prefs, setPrefs] = useState<ColorFontPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  const updatePreferences = useCallback((newPrefs: ColorFontPreferences) => {
    setPrefs(newPrefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
    } catch (err) {
      console.warn('Failed to save preferences:', err);
    }
  }, []);

  const getPaletteColors = (palette: string): string[] => {
    const palettes: Record<string, string[]> = {
      warm: ['#ff6b35', '#ff9a56', '#ffc266'],
      cool: ['#1a5f7a', '#2d7a9a', '#4a9fba'],
      neutral: ['#2d2d2d', '#666666', '#cccccc'],
      vibrant: ['#ff1744', '#00bcd4', '#9c27b0'],
    };
    return palettes[palette] || palettes.warm;
  };

  const getFontValue = (font: string): string => {
    const fonts: Record<string, string> = {
      system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      serif: '"Georgia", serif',
      geometric: '"Montserrat", "Helvetica Neue", sans-serif',
      script: '"Playfair Display", serif',
      mono: '"Monaco", "Courier New", monospace',
    };
    return fonts[font] || fonts.system;
  };

  return {
    prefs,
    updatePreferences,
    getPaletteColors,
    getFontValue,
  };
}
