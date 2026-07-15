import React from 'react';

interface AvatarGeneratorProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Color palette - 12 distinct colors
const COLOR_PALETTE = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1E2', // Sky Blue
  '#F8B785', // Peach
  '#A9DFBF', // Light Green
  '#F1948A', // Pink
  '#AED6F1', // Light Blue
];

// Simple hash function to get consistent color for a name
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Get color based on name
function getAvatarColor(name: string): string {
  const hash = hashCode(name);
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

// Get initials from name
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// Size mappings
const sizeMap = {
  sm: { width: 32, height: 32, textSize: 'text-xs', rounded: 'rounded-md' },
  md: { width: 40, height: 40, textSize: 'text-sm', rounded: 'rounded-lg' },
  lg: { width: 64, height: 64, textSize: 'text-lg', rounded: 'rounded-xl' },
};

export default function AvatarGenerator({
  name,
  size = 'md',
  className = '',
}: AvatarGeneratorProps) {
  const color = getAvatarColor(name);
  const initials = getInitials(name);
  const sizeConfig = sizeMap[size];

  const inlineStyle = {
    backgroundColor: color,
    width: `${sizeConfig.width}px`,
    height: `${sizeConfig.height}px`,
  };

  return (
    <div
      className={`
        flex items-center justify-center
        text-white font-semibold
        transition-all duration-200
        hover:shadow-lg
        ${sizeConfig.rounded}
        ${sizeConfig.textSize}
        ${className}
      `}
      style={inlineStyle}
      title={name}
    >
      {initials}
    </div>
  );
}
