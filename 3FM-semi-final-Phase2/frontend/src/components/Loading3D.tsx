import { ReactNode } from 'react';

interface Loading3DCubeProps {
  size?: number;
  color?: string;
  label?: string;
}

export function Loading3DCube({ size = 40, color = 'bg-indigo-500', label }: Loading3DCubeProps) {
  const half = size / 2;
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="perspective-800">
        <div
          className="preserve-3d animate-cube-spin relative"
          style={{ width: size, height: size }}
        >
          {/* Front */}
          <div
            className={`cube-face ${color} opacity-80`}
            style={{ transform: `translateZ(${half}px)` }}
          />
          {/* Back */}
          <div
            className={`cube-face ${color} opacity-60`}
            style={{ transform: `rotateY(180deg) translateZ(${half}px)` }}
          />
          {/* Right */}
          <div
            className={`cube-face ${color} opacity-70`}
            style={{ transform: `rotateY(90deg) translateZ(${half}px)` }}
          />
          {/* Left */}
          <div
            className={`cube-face ${color} opacity-70`}
            style={{ transform: `rotateY(-90deg) translateZ(${half}px)` }}
          />
          {/* Top */}
          <div
            className={`cube-face ${color} opacity-90`}
            style={{ transform: `rotateX(90deg) translateZ(${half}px)` }}
          />
          {/* Bottom */}
          <div
            className={`cube-face ${color} opacity-50`}
            style={{ transform: `rotateX(-90deg) translateZ(${half}px)` }}
          />
        </div>
      </div>
      {label && (
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
      )}
    </div>
  );
}

interface Empty3DStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}

export function Empty3DState({ icon, title, subtitle }: Empty3DStateProps) {
  return (
    <div className="perspective-800 py-12">
      <div className="animate-float-3d flex flex-col items-center gap-3">
        {icon ? (
          <div className="text-gray-300 dark:text-zinc-600">{icon}</div>
        ) : (
          <svg className="w-16 h-16 text-gray-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )}
        <p className="text-gray-500 dark:text-gray-400 font-medium text-base">{title}</p>
        {subtitle && (
          <p className="text-gray-400 dark:text-gray-500 text-sm">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
