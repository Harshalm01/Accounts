import { useState } from 'react';
import type { PresenceEntry } from '../hooks/usePresence';

interface Props {
  onlineUsers: PresenceEntry[];
}

export default function PresenceBar({ onlineUsers }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (onlineUsers.length === 0) return null;

  const displayUsers = expanded ? onlineUsers : onlineUsers.slice(0, 5);
  const overflow = onlineUsers.length - 5;

  return (
    <div className="mx-3 mt-4 mb-3 rounded-xl bg-gray-50 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800 p-3">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full mb-2 group"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {onlineUsers.length} Online
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* User avatars */}
      {!expanded ? (
        <div className="flex items-center -space-x-1.5">
          {displayUsers.map((u) => (
            <div
              key={u.userId}
              className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white dark:ring-zinc-900 cursor-default"
              title={`${u.userName} — ${u.action}`}
            >
              {u.userName?.charAt(0).toUpperCase() || '?'}
            </div>
          ))}
          {overflow > 0 && (
            <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-zinc-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-[10px] font-bold ring-2 ring-white dark:ring-zinc-900">
              +{overflow}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {onlineUsers.map((u) => (
            <div key={u.userId} className="flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 relative">
                {u.userName?.charAt(0).toUpperCase() || '?'}
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white dark:border-zinc-900" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{u.userName}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{u.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
