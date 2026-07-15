import { useState, useCallback, useEffect } from 'react';

export interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean; // Has current user reacted with this emoji?
}

interface MessageReactionState {
  [messageId: string]: {
    [emoji: string]: Reaction;
  };
}

/**
 * Hook for managing message reactions in local state
 * Reactions are persisted to localStorage so they survive page refreshes
 */
export function useMessageReactions() {
  const [reactions, setReactions] = useState<MessageReactionState>(() => {
    try {
      const stored = localStorage.getItem('3fm-message-reactions');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Persist reactions to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem('3fm-message-reactions', JSON.stringify(reactions));
    } catch {}
  }, [reactions]);

  /**
   * Initialize reaction state for a message
   * @param messageId - The message to initialize reactions for
   * @param initialReactions - Optional initial reactions to set
   */
  const initializeMessage = useCallback(
    (messageId: string, initialReactions?: { emoji: string; count: number }[]) => {
      setReactions((prev) => {
        if (prev[messageId]) return prev; // Already initialized

        const newState = { ...prev };
        newState[messageId] = {};

        if (initialReactions) {
          initialReactions.forEach(({ emoji, count }) => {
            newState[messageId][emoji] = {
              emoji,
              count,
              userReacted: false,
            };
          });
        }

        return newState;
      });
    },
    []
  );

  /**
   * Toggle a reaction on a message
   * Increments count if user hasn't reacted, decrements if they have
   */
  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    setReactions((prev) => {
      const newState = { ...prev };

      // Initialize message reactions if not exists
      if (!newState[messageId]) {
        newState[messageId] = {};
      }

      // Get or create reaction
      const currentReaction = newState[messageId][emoji] || {
        emoji,
        count: 0,
        userReacted: false,
      };

      // Toggle reaction
      if (currentReaction.userReacted) {
        // User is removing their reaction
        currentReaction.count = Math.max(0, currentReaction.count - 1);
        currentReaction.userReacted = false;
      } else {
        // User is adding a reaction
        currentReaction.count += 1;
        currentReaction.userReacted = true;
      }

      // Remove emoji if count is 0
      if (currentReaction.count === 0) {
        delete newState[messageId][emoji];
      } else {
        newState[messageId][emoji] = currentReaction;
      }

      return newState;
    });
  }, []);

  /**
   * Get all reactions for a message
   */
  const getMessageReactions = useCallback(
    (messageId: string): Reaction[] => {
      return Object.values(reactions[messageId] || {}).sort((a, b) => b.count - a.count);
    },
    [reactions]
  );

  /**
   * Get a specific reaction
   */
  const getReaction = useCallback(
    (messageId: string, emoji: string): Reaction | null => {
      return reactions[messageId]?.[emoji] || null;
    },
    [reactions]
  );

  /**
   * Clear all reactions for a message
   */
  const clearMessageReactions = useCallback((messageId: string) => {
    setReactions((prev) => {
      const newState = { ...prev };
      delete newState[messageId];
      return newState;
    });
  }, []);

  /**
   * Update reactions from external source (e.g., Socket.io event)
   * Used to sync reactions across multiple users
   */
  const updateFromSocket = useCallback(
    (messageId: string, emoji: string, userId: string, isAdding: boolean, currentUserId: string) => {
      setReactions((prev) => {
        const newState = { ...prev };

        if (!newState[messageId]) {
          newState[messageId] = {};
        }

        const currentReaction = newState[messageId][emoji] || {
          emoji,
          count: 0,
          userReacted: userId === currentUserId,
        };

        if (isAdding) {
          currentReaction.count += 1;
          if (userId === currentUserId) {
            currentReaction.userReacted = true;
          }
        } else {
          currentReaction.count = Math.max(0, currentReaction.count - 1);
          if (userId === currentUserId) {
            currentReaction.userReacted = false;
          }
        }

        if (currentReaction.count === 0) {
          delete newState[messageId][emoji];
        } else {
          newState[messageId][emoji] = currentReaction;
        }

        return newState;
      });
    },
    []
  );

  return {
    reactions,
    initializeMessage,
    toggleReaction,
    getMessageReactions,
    getReaction,
    clearMessageReactions,
    updateFromSocket,
  };
}
