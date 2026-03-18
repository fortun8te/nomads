import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export interface ColorFontPreferences {
  colorPalette: 'warm' | 'cool' | 'neutral' | 'vibrant';
  fontStyle: 'system' | 'serif' | 'geometric' | 'script' | 'mono';
  textDensity: 'minimal' | 'balanced' | 'detailed';
}

interface ColorFontQuestionnaireProps {
  onComplete: (prefs: ColorFontPreferences) => void;
  isDarkMode?: boolean;
}

export function ColorFontQuestionnaire({ onComplete, isDarkMode: propDarkMode }: ColorFontQuestionnaireProps) {
  const { isDarkMode: themeDarkMode } = useTheme();
  const isDarkMode = propDarkMode !== undefined ? propDarkMode : themeDarkMode;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [colorPalette, setColorPalette] = useState<'warm' | 'cool' | 'neutral' | 'vibrant'>('warm');
  const [fontStyle, setFontStyle] = useState<'system' | 'serif' | 'geometric' | 'script' | 'mono'>('system');
  const [textDensity, setTextDensity] = useState<'minimal' | 'balanced' | 'detailed'>('balanced');

  const bgClass = isDarkMode ? 'bg-[#0f0f0f]' : 'bg-zinc-50';
  const labelClass = isDarkMode ? 'text-white/[0.55]' : 'text-zinc-700';
  const borderClass = isDarkMode ? 'border-white/[0.08]' : 'border-zinc-300';

  const colorPalettes = {
    warm: {
      label: 'Warm (Orange, Red, Gold)',
      colors: ['#ff6b35', '#ff9a56', '#ffc266'],
      desc: 'Energetic, friendly, urgent',
    },
    cool: {
      label: 'Cool (Blue, Teal, Purple)',
      colors: ['#1a5f7a', '#2d7a9a', '#4a9fba'],
      desc: 'Professional, trustworthy, calm',
    },
    neutral: {
      label: 'Neutral (Gray, Black, White)',
      colors: ['#2d2d2d', '#666666', '#cccccc'],
      desc: 'Minimalist, sophisticated, timeless',
    },
    vibrant: {
      label: 'Vibrant (Multi-color)',
      colors: ['#ff1744', '#00bcd4', '#9c27b0'],
      desc: 'Bold, playful, modern',
    },
  };

  const fontStyles = {
    system: {
      label: 'System Font',
      example: 'Sans-serif, clean and modern',
      css: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    serif: {
      label: 'Serif (Classic)',
      example: 'Georgia, elegant and traditional',
      css: '"Georgia", serif',
    },
    geometric: {
      label: 'Geometric (Montserrat)',
      example: 'Modern, bold, geometric shapes',
      css: '"Montserrat", sans-serif',
    },
    script: {
      label: 'Script (Playfair)',
      example: 'Luxury, elegant, high-end feel',
      css: '"Playfair Display", serif',
    },
    mono: {
      label: 'Monospace',
      example: 'Technical, code-like, minimalist',
      css: '"Monaco", "Courier New", monospace',
    },
  };

  const handleNext = () => {
    if (step === 3) {
      onComplete({ colorPalette, fontStyle, textDensity });
    } else {
      setStep((step + 1) as 1 | 2 | 3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3);
    }
  };

  return (
    <div className={`${bgClass} p-8 max-w-2xl mx-auto`}>
      <div className="space-y-6">
        <div>
          <h2 className={`text-2xl font-bold font-mono ${isDarkMode ? 'text-white' : 'text-black'}`}>
            STYLE PREFERENCES
          </h2>
          <p className={`text-xs font-mono mt-2 ${labelClass}`}>
            Step {step} of 3 — Help us match your brand aesthetic
          </p>
        </div>

        {/* Step 1: Color Palette */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className={`text-lg font-mono font-bold mb-4 ${labelClass}`}>
                What color palette resonates with your brand?
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {(Object.entries(colorPalettes) as [keyof typeof colorPalettes, typeof colorPalettes[keyof typeof colorPalettes]][]).map(([key, palette]) => (
                  <button
                    key={key}
                    onClick={() => setColorPalette(key)}
                    className={`p-4 border-2 rounded transition-all ${
                      colorPalette === key
                        ? `${borderClass} bg-opacity-10`
                        : `border-zinc-300 ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-100'}`
                    }`}
                  >
                    <div className="flex gap-2 mb-2">
                      {palette.colors.map((color) => (
                        <div
                          key={color}
                          className="w-8 h-8 rounded"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <p className={`text-sm font-mono font-semibold ${labelClass}`}>
                      {palette.label}
                    </p>
                    <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {palette.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Font Style */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className={`text-lg font-mono font-bold mb-4 ${labelClass}`}>
                What typography best represents your brand?
              </h3>
              <div className="space-y-3">
                {(Object.entries(fontStyles) as [keyof typeof fontStyles, typeof fontStyles[keyof typeof fontStyles]][]).map(([key, style]) => (
                  <button
                    key={key}
                    onClick={() => setFontStyle(key)}
                    className={`w-full p-4 border-2 rounded transition-all text-left ${
                      fontStyle === key
                        ? `${borderClass} bg-opacity-10`
                        : `border-zinc-300 ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-100'}`
                    }`}
                  >
                    <p className={`font-mono font-semibold ${labelClass}`}>
                      {style.label}
                    </p>
                    <p style={{ fontFamily: style.css }} className="text-sm mt-1">
                      {style.example}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Text Density */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className={`text-lg font-mono font-bold mb-4 ${labelClass}`}>
                How much copy should ads contain?
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => setTextDensity('minimal')}
                  className={`w-full p-4 border-2 rounded transition-all ${
                    textDensity === 'minimal'
                      ? `${borderClass} bg-opacity-10`
                      : `border-zinc-300 ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-100'}`
                  }`}
                >
                  <p className={`font-mono font-semibold ${labelClass}`}>
                    Minimal — Short & snappy
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    Short headline + CTA. Impact over words.
                  </p>
                </button>
                <button
                  onClick={() => setTextDensity('balanced')}
                  className={`w-full p-4 border-2 rounded transition-all ${
                    textDensity === 'balanced'
                      ? `${borderClass} bg-opacity-10`
                      : `border-zinc-300 ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-100'}`
                  }`}
                >
                  <p className={`font-mono font-semibold ${labelClass}`}>
                    Balanced — Just right
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    Headline + body copy + CTA. Convincing without overwhelming.
                  </p>
                </button>
                <button
                  onClick={() => setTextDensity('detailed')}
                  className={`w-full p-4 border-2 rounded transition-all ${
                    textDensity === 'detailed'
                      ? `${borderClass} bg-opacity-10`
                      : `border-zinc-300 ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-100'}`
                  }`}
                >
                  <p className={`font-mono font-semibold ${labelClass}`}>
                    Detailed — Tell the full story
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    Multiple benefits, detailed explanation. Persuasive & thorough.
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4 pt-6 border-t border-zinc-300">
          {step > 1 && (
            <button
              onClick={handleBack}
              className={`px-4 py-2 text-xs font-mono font-semibold border rounded ${
                isDarkMode
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-200 hover:bg-zinc-300 text-black border-zinc-300'
              }`}
            >
              BACK
            </button>
          )}
          <button
            onClick={handleNext}
            className={`ml-auto px-6 py-2 text-xs font-mono font-semibold rounded ${
              isDarkMode
                ? 'bg-white hover:bg-zinc-200 text-black'
                : 'bg-black hover:bg-zinc-900 text-white'
            }`}
          >
            {step === 3 ? 'APPLY' : 'NEXT'}
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="flex gap-2 justify-center pt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-all ${
                step >= s
                  ? isDarkMode
                    ? 'bg-white'
                    : 'bg-black'
                  : isDarkMode
                    ? 'bg-zinc-700'
                    : 'bg-zinc-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
