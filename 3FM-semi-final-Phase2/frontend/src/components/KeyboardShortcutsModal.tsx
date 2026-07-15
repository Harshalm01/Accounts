interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

const NAV_SHORTCUTS = [
  { keys: ['G', 'I'], description: 'Go to Influencers' },
  { keys: ['G', 'C'], description: 'Go to Campaign' },
  { keys: ['G', 'B'], description: 'Go to Brands' },
  { keys: ['G', 'R'], description: 'Go to Roaster' },
  { keys: ['G', 'A'], description: 'Go to Analytics' },
  { keys: ['G', 'S'], description: 'Go to Settings' },
];

const ACTION_SHORTCUTS = [
  { keys: ['Ctrl', 'K'], description: 'Global search' },
  { keys: ['/'], description: 'Global search' },
  { keys: ['Esc'], description: 'Close modal / panel' },
  { keys: ['?'], description: 'Show this shortcuts guide' },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] px-2 py-1 text-xs font-mono font-semibold bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-zinc-600 rounded shadow-sm">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Navigation */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
              Navigation
            </p>
            <div className="space-y-2">
              {NAV_SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{s.description}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <Kbd>{k}</Kbd>
                        {j < s.keys.length - 1 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">then</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 dark:border-zinc-800" />

          {/* Actions */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
              Actions
            </p>
            <div className="space-y-2">
              {ACTION_SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{s.description}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <Kbd key={j}>{k}</Kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-4 py-3">
            <p className="text-xs text-indigo-700 dark:text-indigo-400">
              Shortcuts are disabled when typing in input fields.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
