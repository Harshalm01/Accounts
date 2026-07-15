export type ThemeName = 'dark' | 'light' | 'neon' | 'pastel' | 'retro' | 'minimal' | 'cyber80s' | 'ocean' | 'candy' | 'forest' | 'aurora' | 'sunset';

export const THEMES: Record<ThemeName, {
  label: string;
  description: string;
  preview: { bg: string; accent: string; text: string };
  isDark: boolean;
}> = {
  dark: {
    label: 'Dark',
    description: 'Default dark theme',
    preview: { bg: '#000000', accent: '#6366f1', text: '#f9fafb' },
    isDark: true,
  },
  light: {
    label: 'Light',
    description: 'Clean light theme',
    preview: { bg: '#ffffff', accent: '#6366f1', text: '#111827' },
    isDark: false,
  },
  neon: {
    label: 'Neon',
    description: 'Cyberpunk glow',
    preview: { bg: '#0a0a0a', accent: '#00ff88', text: '#e0ffe0' },
    isDark: true,
  },
  pastel: {
    label: 'Rosé',
    description: 'Dark pink elegance',
    preview: { bg: '#0a0408', accent: '#be185d', text: '#fce7f3' },
    isDark: true,
  },
  retro: {
    label: 'Amber',
    description: 'Warm dark vintage',
    preview: { bg: '#0a0800', accent: '#d97706', text: '#fef3c7' },
    isDark: true,
  },
  minimal: {
    label: 'Slate',
    description: 'Dark monochrome',
    preview: { bg: '#0a0a0a', accent: '#a3a3a3', text: '#e5e5e5' },
    isDark: true,
  },
  cyber80s: {
    label: 'Cyber 80s',
    description: 'Bright neon 80s vibes',
    preview: { bg: '#2a0845', accent: '#ff00ff', text: '#ffff00' },
    isDark: true,
  },
  ocean: {
    label: 'Ocean',
    description: 'Deep ocean blue',
    preview: { bg: '#001f3f', accent: '#0099ff', text: '#e0f2fe' },
    isDark: true,
  },
  candy: {
    label: 'Candy',
    description: 'Dark candy theme with pink accents',
    preview: { bg: '#1a0d0f', accent: '#ff69b4', text: '#ffd0e8' },
    isDark: true,
  },
  forest: {
    label: 'Forest',
    description: 'Dark green nature theme',
    preview: { bg: '#0a1f12', accent: '#52b788', text: '#b4e197' },
    isDark: true,
  },
  aurora: {
    label: 'Aurora',
    description: 'Purple & green northern lights',
    preview: { bg: '#0f0a1a', accent: '#7bed9f', text: '#a0e7e5' },
    isDark: true,
  },
  sunset: {
    label: 'Sunset',
    description: 'Dark sunset with warm orange accents',
    preview: { bg: '#1a0800', accent: '#ff6b35', text: '#fdb833' },
    isDark: true,
  },
};

export function applyTheme(theme: ThemeName) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);

  // Dark class for Tailwind dark: variants
  const meta = THEMES[theme];
  if (meta?.isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  localStorage.setItem('theme', theme);
}
