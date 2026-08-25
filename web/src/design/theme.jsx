import { createContext, useContext, useEffect, useMemo } from 'react';

// Design tokens, ported from the Claude Design prototype
// (SmartDriverAi Web App.html → screens/shared.jsx).
//
// Two accents rather than one: A carries navigation and progress, B carries
// streaks and "next up" markers, so the two never compete for the same meaning.

export const ACCENT_A = '#3AA2FF';
export const ACCENT_B = '#E39016';

// Every semantic colour needs TWO values, because one cannot do both jobs.
//
// A colour light enough to read as text on a dark surface is too light for
// white text to sit on, and vice versa — measured, not guessed: the design's
// #3AA2FF reads at 7.0 against the dark background but leaves white at 2.7,
// well under the 4.5 WCAG AA asks for. That affected the primary call to
// action, the active nav item and the "you are here" badge.
//
// So: `a` / `success` / `danger` / `warn` are for TEXT, icons and borders and
// vary by theme; the `*Fill` values are backgrounds that white sits on, are
// the same in both themes, and all clear 5:1.
const FILL = {
  aFill: '#1A6FBF',       // white on this: 5.16
  successFill: '#157A48', // 5.37
  dangerFill: '#CF2E26',  // 5.16
  warnFill: '#9A6100',    // 5.14
};

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
        textFaint: 'rgba(235,240,248,0.55)',
        stroke: 'rgba(255,255,255,0.08)',
        success: '#34C77B',
        danger: '#FF5B5B',
        warn: '#F6B23A',
        ...FILL,
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
      // In light theme the accent has to work as text on a pale background,
      // where #3AA2FF manages only 2.4. The fill value doubles as the text
      // value here: 4.66 as text, 5.16 behind white.
      a: FILL.aFill,
      bg: '#F6F3EC', // warm off-white — reads as paper, not as a form
      surface: '#FFFFFF',
      surface2: '#EFEAE0',
      text: '#151617',
      // 0.62 landed at 4.33–4.41 against the warm background: under 4.5, and
      // this is the colour most of the app's secondary text uses.
      textDim: 'rgba(32,33,36,0.70)',
      textFaint: 'rgba(32,33,36,0.58)',
      stroke: 'rgba(20,22,28,0.07)',
      // Darker than the design's originals so they also pass as TEXT on the
      // warm light background, which the originals did not (2.9 / 3.7 / 2.3).
      success: '#157A48',
      danger: '#CF2E26',
      warn: '#9A6100',
      ...FILL,
      asphalt: '#242832',
      asphaltEdge: '#3A414E',
      shellBg: '#DCD6CB',
      shellSurface: '#F1EDE4',
      line: 'rgba(0,0,0,0.07)',
    };
  }, [dark, accentA, accentB]);

  // Bridge the two tokens CSS has to own. Everything else is an inline style,
  // but a focus ring is a :focus-visible rule and inline styles cannot express
  // a pseudo-class — so these are published as custom properties for
  // styles.css to use.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--sdai-focus', T.aFill);
    // A second, contrasting ring sits between the element and the accent one,
    // so the focus indicator stays visible whether it lands on a pale card or
    // on a filled accent button.
    root.setProperty('--sdai-focus-halo', T.dark ? '#0E1116' : '#FFFFFF');

    // Installed to a home screen, the page paints its own status bar and
    // address bar. index.html ships the light value; without this the bar stays
    // pale after switching to dark and the app looks like it has a white
    // sliver stuck to the top of it.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', T.shellBg);
  }, [T]);

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
