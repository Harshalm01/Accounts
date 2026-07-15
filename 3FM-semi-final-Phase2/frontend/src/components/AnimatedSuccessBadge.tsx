import React, { useEffect, useState } from 'react';

interface AnimatedSuccessBadgeProps {
  message: string;
  visible: boolean;
  duration?: number; // auto-dismiss after duration (ms)
  onDismiss?: () => void;
}

export default function AnimatedSuccessBadge({
  message,
  visible,
  duration = 3000,
  onDismiss,
}: AnimatedSuccessBadgeProps) {
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        onDismiss?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onDismiss]);

  if (!shouldRender) return null;

  return (
    <div
      className={`
        fixed bottom-24 right-6 z-50
        flex items-center gap-2
        px-4 py-3 rounded-lg
        bg-gradient-to-r from-green-500 to-emerald-600
        text-white font-medium text-sm
        shadow-lg
        animate-fade-in
        transition-all duration-300
        ${!visible ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}
      `}
    >
      <svg
        className="w-5 h-5 flex-shrink-0 animate-bounce"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}
