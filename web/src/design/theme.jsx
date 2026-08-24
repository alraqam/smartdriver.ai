import { createContext, useContext, useMemo } from 'react';

// Design tokens, ported from the Claude Design prototype
// (SmartDriverAi Web App.html → screens/shared.jsx).
//
// Two accents rather than one: A carries navigation and progress, B carries
// streaks and "next up" markers, so the two never compete for the same meaning.

export const ACCENT_A = '#3AA2FF';
export const ACCENT_B = '#E39016';

const ThemeCtx = createContext(null);

export function ThemeProvider({ dark, accentA = ACCENT_A, accentB = ACCENT_B, children }) {
  const T = useMemo(() => {
    const base = { a: accentA, b: accentB };
    if (dark) {
      return {
        ...base,
        dark: true,
        bg: '#0E1116',
        surface: '#171B22',
        surface2: '#1F252E',
        text: '#F2F4F7',
        textDim: 'rgba(235,240,248,0.62)',
        textFaint: 'rgba(235,240,248,0.35)',
        stroke: 'rgba(255,255,255,0.08)',
        success: '#34C77B',
        danger: '#FF5B5B',
        warn: '#F6B23A',
        asphalt: '#12161C',
        asphaltEdge: '#232A34',
        // Shell sits a shade darker than the panel so the panel reads as a card.
        shellBg: '#141217',
        shellSurface: '#1A1D24',
        line: 'rgba(255,255,255,0.07)',
      };
    }
    return {
      ...base,
      dark: false,
      bg: '#F6F3EC', // warm off-white — reads as paper, not as a form
      surface: '#FFFFFF',
      surface2: '#EFEAE0',
      text: '#151617',
      textDim: 'rgba(32,33,36,0.62)',
      textFaint: 'rgba(32,33,36,0.35)',
      stroke: 'rgba(20,22,28,0.07)',
      success: '#1FA463',
      danger: '#E2443B',
      warn: '#E39016',
      asphalt: '#242832',
      asphaltEdge: '#3A414E',
      shellBg: '#DCD6CB',
      shellSurface: '#F1EDE4',
      line: 'rgba(0,0,0,0.07)',
    };
  }, [dark, accentA, accentB]);

  return <ThemeCtx.Provider value={T}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const T = useContext(ThemeCtx);
  if (!T) throw new Error('useTheme must be used inside ThemeProvider');
  return T;
}

/// Hex colour at an alpha. Used constantly for tinted surfaces and glows, which
/// need to sit on either theme without a second token per shade.
export function hexA(hex, alpha) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
