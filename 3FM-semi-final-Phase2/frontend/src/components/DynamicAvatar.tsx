import { type AvatarStyle } from './AvatarCustomization';

interface DynamicAvatarProps {
  userName: string;
  avatarStyle: AvatarStyle;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
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

// Color palette for initials
const COLOR_PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B785', '#A9DFBF',
  '#F1948A', '#AED6F1',
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  const hash = hashCode(name);
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

// Gradient options from AvatarCustomization
const GRADIENT_OPTIONS = [
  { name: 'sunset', from: '#FF6B6B', to: '#FF8C42' },
  { name: 'ocean', from: '#0099FF', to: '#00CCFF' },
  { name: 'forest', from: '#00A651', to: '#00D86E' },
  { name: 'purple', from: '#9D4EDD', to: '#C77DFF' },
  { name: 'rose', from: '#E63946', to: '#F1A3A3' },
  { name: 'indigo', from: '#4F46E5', to: '#818CF8' },
  { name: 'pink', from: '#EC4899', to: '#F472B6' },
  { name: 'teal', from: '#14B8A6', to: '#2DD4BF' },
];

const sizeMap = {
  sm: { width: 32, height: 32, textSize: 'text-xs', rounded: 'rounded-md' },
  md: { width: 40, height: 40, textSize: 'text-sm', rounded: 'rounded-lg' },
  lg: { width: 64, height: 64, textSize: 'text-lg', rounded: 'rounded-xl' },
};

export default function DynamicAvatar({
  userName,
  avatarStyle,
  size = 'md',
  className = '',
}: DynamicAvatarProps) {
  const sizeConfig = sizeMap[size];
  const initials = getInitials(userName);

  // Render Initials Style
  if (avatarStyle.type === 'initials') {
    const color = getAvatarColor(userName);
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
        style={{
          backgroundColor: color,
          width: `${sizeConfig.width}px`,
          height: `${sizeConfig.height}px`,
        }}
        title={userName}
      >
        {initials}
      </div>
    );
  }

  // Render Emoji Style
  if (avatarStyle.type === 'emoji') {
    return (
      <div
        className={`
          flex items-center justify-center
          bg-gray-100 dark:bg-zinc-800
          transition-all duration-200
          hover:shadow-lg
          ${sizeConfig.rounded}
          ${sizeConfig.textSize}
          ${className}
        `}
        style={{
          width: `${sizeConfig.width}px`,
          height: `${sizeConfig.height}px`,
        }}
        title={userName}
      >
        {avatarStyle.value || '🌟'}
      </div>
    );
  }

  // Render Pattern Style
  if (avatarStyle.type === 'pattern') {
    const patternDisplay = {
      dots: '●●●',
      stripes: '═══',
      grid: '⬜⬜',
      waves: '≈≈≈',
      diamond: '◆◆◆',
      star: '★★★',
    };

    return (
      <div
        className={`
          flex items-center justify-center
          bg-gradient-to-br from-indigo-500 to-purple-600
          text-white font-semibold
          transition-all duration-200
          hover:shadow-lg
          ${sizeConfig.rounded}
          ${sizeConfig.textSize}
          ${className}
        `}
        style={{
          width: `${sizeConfig.width}px`,
          height: `${sizeConfig.height}px`,
        }}
        title={userName}
      >
        {patternDisplay[avatarStyle.value as keyof typeof patternDisplay] || '◆◆◆'}
      </div>
    );
  }

  // Render Gradient Style
  if (avatarStyle.type === 'gradient') {
    const gradient = GRADIENT_OPTIONS.find(g => g.name === avatarStyle.value);
    return (
      <div
        className={`
          transition-all duration-200
          hover:shadow-lg
          ${sizeConfig.rounded}
          ${className}
        `}
        style={{
          width: `${sizeConfig.width}px`,
          height: `${sizeConfig.height}px`,
          backgroundImage: gradient ? `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)` : 'none',
        }}
        title={userName}
      />
    );
  }

  // Fallback to initials
  const color = getAvatarColor(userName);
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
      style={{
        backgroundColor: color,
        width: `${sizeConfig.width}px`,
        height: `${sizeConfig.height}px`,
      }}
      title={userName}
    >
      {initials}
    </div>
  );
}
