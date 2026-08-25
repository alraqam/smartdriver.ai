import { useEffect, useState } from 'react';

// Breakpoint in JS rather than CSS.
//
// The layout is built from theme-driven inline styles, and an inline style
// cannot express a media query — so the one number that decides phone-versus-
// desktop has to be readable from JavaScript. 899px because Login.jsx already
// switches its hero panel at 900, and two breakpoints that disagree by a pixel
// is a bug waiting to happen.
export const MOBILE_QUERY = '(max-width: 899px)';

function read(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => read(query));

  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return undefined;

    // Re-read on subscribe: the query may have changed since the initial
    // state was computed, and the listener only fires on the next change.
    setMatches(mql.matches);
    const onChange = (e) => setMatches(e.matches);

    // addListener is the pre-Safari-14 spelling. Plenty of the phones this app
    // is aimed at are old enough to need it.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
