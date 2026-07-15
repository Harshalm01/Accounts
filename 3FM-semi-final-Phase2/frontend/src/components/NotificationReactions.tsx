import React, { useState } from 'react';

export type ReactionType = '👍' | '❤️' | '🔥' | '👏';

const REACTIONS: ReactionType[] = ['👍', '❤️', '🔥', '👏'];

export interface Reaction {
  emoji: ReactionType;
  count: number;
  userReacted: boolean;
}

interface NotificationReactionsProps {
  notificationId: string;
  reactions?: Reaction[];
  onReact?: (reaction: ReactionType) => void;
  className?: string;
}

export default function NotificationReactions({
  notificationId,
  reactions = [],
  onReact,
  className = '',
}: NotificationReactionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleReaction = (reaction: ReactionType) => {
    onReact?.(reaction);
    setIsExpanded(false);
  };

  return (
    <div className={`flex items-center flex-wrap gap-1.5 mt-2 ${className}`}>
      {/* Show existing reactions with counts */}
      {reactions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => handleReaction(reaction.emoji)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all duration-200 ${
                reaction.userReacted
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-400 dark:ring-indigo-600'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
              title={`${reaction.count} reaction${reaction.count !== 1 ? 's' : ''}`}
            >
              <span className="text-sm leading-none">{reaction.emoji}</span>
              {reaction.count > 0 && <span className="text-xs font-medium">{reaction.count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Add reaction button with dropdown */}
      <div className="relative group/picker">
        <button
          className={`flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-all duration-200 text-xs font-bold ${
            reactions.length === 0 ? 'opacity-0 group-hover:opacity-100' : 'opacity-60 hover:opacity-100'
          }`}
          title="Add reaction"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          +
        </button>

        {/* Emoji picker dropdown */}
        {isExpanded && (
          <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-zinc-850 rounded-lg shadow-xl p-2 z-50 border border-gray-200 dark:border-zinc-700 animate-in fade-in duration-150">
            <div className="flex gap-1">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="text-lg p-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors duration-150 cursor-pointer hover:scale-125 transform transition-transform"
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type { NotificationReactionsProps };
