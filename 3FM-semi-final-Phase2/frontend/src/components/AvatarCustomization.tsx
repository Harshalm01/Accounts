import { useState } from 'react';

interface AvatarCustomizationProps {
  userName: string;
  onAvatarStyleChange?: (style: AvatarStyle) => void;
  currentStyle?: AvatarStyle;
}

export interface AvatarStyle {
  type: 'initials' | 'emoji' | 'pattern' | 'gradient';
  value?: string; // emoji character or pattern name
  color1?: string;
  color2?: string;
}

// Emoji options organized by category
const EMOJI_OPTIONS = {
  nature: ['🌟', '🌈', '🌻', '🌺', '🌸', '🌼', '🌷', '💐'],
  animals: ['🦁', '🐯', '🦊', '🐻', '🦝', '🐼', '🐨', '🦘'],
  objects: ['🎨', '🎭', '🎪', '🎬', '🎸', '🎯', '🎲', '📚'],
  food: ['🍕', '🍔', '🍟', '🌮', '🍣', '🍰', '🎂', '☕'],
  misc: ['🔥', '⚡', '💎', '👑', '🎀', '🌙', '☀️', '✨'],
};

// Pattern options
const PATTERN_OPTIONS = [
  { name: 'dots', label: '●●●' },
  { name: 'stripes', label: '═══' },
  { name: 'grid', label: '⬜⬜' },
  { name: 'waves', label: '≈≈≈' },
  { name: 'diamond', label: '◆◆◆' },
  { name: 'star', label: '★★★' },
];

// Gradient combinations
const GRADIENT_OPTIONS = [
  { name: 'sunset', label: 'Sunset', from: '#FF6B6B', to: '#FF8C42' },
  { name: 'ocean', label: 'Ocean', from: '#0099FF', to: '#00CCFF' },
  { name: 'forest', label: 'Forest', from: '#00A651', to: '#00D86E' },
  { name: 'purple', label: 'Purple', from: '#9D4EDD', to: '#C77DFF' },
  { name: 'rose', label: 'Rose', from: '#E63946', to: '#F1A3A3' },
  { name: 'indigo', label: 'Indigo', from: '#4F46E5', to: '#818CF8' },
  { name: 'pink', label: 'Pink', from: '#EC4899', to: '#F472B6' },
  { name: 'teal', label: 'Teal', from: '#14B8A6', to: '#2DD4BF' },
];

// Get initials from name
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function AvatarCustomization({
  userName,
  onAvatarStyleChange,
  currentStyle = { type: 'initials' },
}: AvatarCustomizationProps) {
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>(currentStyle);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const handleStyleChange = (newStyle: AvatarStyle) => {
    setSelectedStyle(newStyle);
    onAvatarStyleChange?.(newStyle);
  };

  const renderPreview = () => {
    const previewSize = 'w-20 h-20';
    const textSize = 'text-2xl';

    if (selectedStyle.type === 'initials') {
      return (
        <div className={`${previewSize} bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold ${textSize}`}>
          {getInitials(userName)}
        </div>
      );
    }

    if (selectedStyle.type === 'emoji') {
      return (
        <div className={`${previewSize} bg-gray-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center ${textSize}`}>
          {selectedStyle.value || '🌟'}
        </div>
      );
    }

    if (selectedStyle.type === 'pattern') {
      return (
        <div className={`${previewSize} bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white ${textSize}`}>
          {selectedStyle.value === 'dots' && '●●●'}
          {selectedStyle.value === 'stripes' && '═══'}
          {selectedStyle.value === 'grid' && '⬜⬜'}
          {selectedStyle.value === 'waves' && '≈≈≈'}
          {selectedStyle.value === 'diamond' && '◆◆◆'}
          {selectedStyle.value === 'star' && '★★★'}
        </div>
      );
    }

    if (selectedStyle.type === 'gradient') {
      const gradient = GRADIENT_OPTIONS.find(g => g.name === selectedStyle.value);
      return (
        <div
          className={`${previewSize} rounded-lg`}
          style={{
            backgroundImage: gradient ? `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)` : 'none',
          }}
        />
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Preview */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Avatar Preview</h3>
        <div className="flex justify-center">
          {renderPreview()}
        </div>
      </div>

      {/* Style Options */}
      <div className="space-y-4">
        {/* Initials Style */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
          <button
            onClick={() => handleStyleChange({ type: 'initials' })}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
              selectedStyle.type === 'initials'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-500'
                : 'hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              {getInitials(userName)}
            </div>
            <div className="text-left flex-1">
              <div className="font-semibold text-gray-900 dark:text-white">Initials</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Classic initials style</div>
            </div>
            {selectedStyle.type === 'initials' && (
              <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>

        {/* Emoji Style */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <button
            onClick={() => setExpandedCategory(expandedCategory === 'emoji' ? null : 'emoji')}
            className={`w-full flex items-center gap-3 p-4 transition-all ${
              selectedStyle.type === 'emoji'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 border-b border-indigo-500'
                : 'hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <div className="text-2xl">🌟</div>
            <div className="text-left flex-1">
              <div className="font-semibold text-gray-900 dark:text-white">Emoji Avatar</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Pick your favorite emoji</div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'emoji' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {expandedCategory === 'emoji' && (
            <div className="p-4 border-t border-gray-200 dark:border-zinc-800 space-y-3">
              {Object.entries(EMOJI_OPTIONS).map(([category, emojis]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 capitalize">{category}</p>
                  <div className="grid grid-cols-6 gap-2">
                    {emojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleStyleChange({ type: 'emoji', value: emoji })}
                        className={`p-2 rounded-lg text-xl transition-all hover:scale-110 ${
                          selectedStyle.type === 'emoji' && selectedStyle.value === emoji
                            ? 'bg-indigo-600 scale-110'
                            : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pattern Style */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <button
            onClick={() => setExpandedCategory(expandedCategory === 'pattern' ? null : 'pattern')}
            className={`w-full flex items-center gap-3 p-4 transition-all ${
              selectedStyle.type === 'pattern'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 border-b border-indigo-500'
                : 'hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <div className="text-2xl">◆◆◆</div>
            <div className="text-left flex-1">
              <div className="font-semibold text-gray-900 dark:text-white">Pattern Avatar</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Geometric patterns</div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'pattern' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {expandedCategory === 'pattern' && (
            <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
              <div className="grid grid-cols-3 gap-2">
                {PATTERN_OPTIONS.map((pattern) => (
                  <button
                    key={pattern.name}
                    onClick={() => handleStyleChange({ type: 'pattern', value: pattern.name })}
                    className={`p-3 rounded-lg transition-all text-center text-sm font-semibold ${
                      selectedStyle.type === 'pattern' && selectedStyle.value === pattern.name
                        ? 'bg-indigo-600 text-white border-2 border-indigo-700'
                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <div className="text-lg">{pattern.label}</div>
                    <div className="text-xs mt-1 capitalize">{pattern.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gradient Style */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <button
            onClick={() => setExpandedCategory(expandedCategory === 'gradient' ? null : 'gradient')}
            className={`w-full flex items-center gap-3 p-4 transition-all ${
              selectedStyle.type === 'gradient'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 border-b border-indigo-500'
                : 'hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <div
              className="w-8 h-8 rounded-lg"
              style={{
                backgroundImage: 'linear-gradient(135deg, #FF6B6B 0%, #FF8C42 100%)',
              }}
            />
            <div className="text-left flex-1">
              <div className="font-semibold text-gray-900 dark:text-white">Gradient Avatar</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Colorful gradients</div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'gradient' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {expandedCategory === 'gradient' && (
            <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
              <div className="grid grid-cols-4 gap-2">
                {GRADIENT_OPTIONS.map((gradient) => (
                  <button
                    key={gradient.name}
                    onClick={() => handleStyleChange({ type: 'gradient', value: gradient.name })}
                    className={`p-3 rounded-lg transition-all hover:scale-105 ${
                      selectedStyle.type === 'gradient' && selectedStyle.value === gradient.name
                        ? 'ring-2 ring-offset-2 ring-indigo-600 dark:ring-offset-zinc-900'
                        : ''
                    }`}
                    title={gradient.label}
                  >
                    <div
                      className="w-full h-8 rounded-md"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
                      }}
                    />
                    <div className="text-xs font-semibold mt-1 text-gray-700 dark:text-gray-300">{gradient.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
