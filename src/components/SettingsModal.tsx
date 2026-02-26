import { useTheme } from '../context/ThemeContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { isDarkMode, toggleTheme } = useTheme();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className={`pointer-events-auto w-96 ${
          isDarkMode
            ? 'bg-[#0d0d0d] border-zinc-800'
            : 'bg-white border-zinc-200'
        } border rounded-lg shadow-2xl`}>

          {/* Header */}
          <div className={`px-6 py-4 border-b ${
            isDarkMode ? 'border-zinc-800' : 'border-zinc-200'
          } flex items-center justify-between`}>
            <h2 className={`font-mono text-sm font-bold uppercase tracking-widest ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              Settings
            </h2>
            <button
              onClick={onClose}
              className={`font-mono text-lg hover:opacity-50 transition-opacity ${
                isDarkMode ? 'text-zinc-500' : 'text-zinc-400'
              }`}
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <label className={`font-mono text-xs uppercase tracking-widest ${
                isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
              }`}>
                Theme
              </label>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs ${
                  isDarkMode ? 'text-zinc-500' : 'text-zinc-500'
                }`}>
                  {isDarkMode ? 'Dark' : 'Light'}
                </span>
                <button
                  onClick={toggleTheme}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    isDarkMode
                      ? 'bg-white'
                      : 'bg-black'
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                    isDarkMode
                      ? 'right-0.5 bg-black'
                      : 'left-0.5 bg-white'
                  }`} />
                </button>
              </div>
            </div>

            {/* Version */}
            <div className={`pt-4 border-t ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <p className={`font-mono text-xs ${
                isDarkMode ? 'text-zinc-600' : 'text-zinc-400'
              }`}>
                Ad Creative Agent v1.0
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className={`px-6 py-3 border-t ${
            isDarkMode ? 'border-zinc-800' : 'border-zinc-200'
          } flex justify-end`}>
            <button
              onClick={onClose}
              className={`font-mono text-xs uppercase tracking-widest px-4 py-1.5 rounded transition-colors ${
                isDarkMode
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-black text-white hover:bg-zinc-800'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
