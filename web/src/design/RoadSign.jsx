// Road signs, ported verbatim from the Claude Design prototype.
//
// Drawn as geometry rather than shipped as images: they render crisp at every
// size from a 28px review thumbnail to a 110px quiz hero, they theme correctly,
// and the whole set costs nothing to load. They follow Vienna Convention shapes
// (which Uzbekistan uses) but are original drawings, not scans of official
// artwork.

export function RoadSign({ kind, size = 64 }) {
  const s = { width: size, height: size, display: 'block' };

  switch (kind) {
    case 'yield':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,56 4,10 60,10" fill="#fff" stroke="#D9241F" strokeWidth="5" strokeLinejoin="round" /></svg>;
    case 'stop':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="20,6 44,6 58,20 58,44 44,58 20,58 6,44 6,20" fill="#D9241F" stroke="#fff" strokeWidth="3" /><text x="32" y="39" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="Helvetica">STOP</text></svg>;
    case 'no-entry':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#D9241F" stroke="#fff" strokeWidth="3" /><rect x="14" y="28" width="36" height="8" fill="#fff" /></svg>;
    case 'speed':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#fff" stroke="#D9241F" strokeWidth="6" /><text x="32" y="40" textAnchor="middle" fontSize="22" fontWeight="800" fill="#111" fontFamily="Helvetica">60</text></svg>;
    case 'pedestrian':
      return <svg style={s} viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#1B4FC4" /><polygon points="32,14 54,50 10,50" fill="#fff" /><circle cx="32" cy="26" r="3" fill="#1B4FC4" /><path d="M27 42l3-10h4l3 10" fill="#1B4FC4" /></svg>;
    case 'turn-right':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#1B4FC4" /><path d="M22 32h18l-6-6M40 32l-6 6" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>;
    case 'warn-curve':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,4 60,32 32,60 4,32" fill="#F6B23A" stroke="#111" strokeWidth="3" /><path d="M22 44c0-14 10-16 10-24M32 20l-4-4M32 20l4-4" stroke="#111" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'priority':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,6 58,32 32,58 6,32" fill="#F6B23A" stroke="#111" strokeWidth="2" /><polygon points="32,14 50,32 32,50 14,32" fill="none" stroke="#fff" strokeWidth="3" /></svg>;
    case 'parking':
      return <svg style={s} viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#1B4FC4" /><text x="32" y="46" textAnchor="middle" fontSize="36" fontWeight="800" fill="#fff" fontFamily="Helvetica">P</text></svg>;
    case 'crossing':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,6 60,56 4,56" fill="#fff" stroke="#D9241F" strokeWidth="5" strokeLinejoin="round" /><circle cx="30" cy="28" r="3" fill="#111" /><path d="M27 42l3-9h3l3 9M23 48l9-8M36 40l5 8" stroke="#111" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>;
    case 'main-road-end':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,6 58,32 32,58 6,32" fill="#F6B23A" stroke="#111" strokeWidth="2" /><polygon points="32,14 50,32 32,50 14,32" fill="none" stroke="#fff" strokeWidth="3" /><line x1="14" y1="14" x2="50" y2="50" stroke="#111" strokeWidth="3" /></svg>;
    case 'no-overtake':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#fff" stroke="#D9241F" strokeWidth="5" /><rect x="16" y="22" width="14" height="20" rx="2" fill="#111" /><rect x="34" y="22" width="14" height="20" rx="2" fill="#D9241F" /></svg>;
    case 'no-stopping':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#1B4FC4" stroke="#D9241F" strokeWidth="5" /><line x1="16" y1="16" x2="48" y2="48" stroke="#D9241F" strokeWidth="5" /><line x1="48" y1="16" x2="16" y2="48" stroke="#D9241F" strokeWidth="5" /></svg>;
    case 'no-parking':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#1B4FC4" stroke="#D9241F" strokeWidth="5" /><line x1="14" y1="14" x2="50" y2="50" stroke="#D9241F" strokeWidth="5" /></svg>;
    case 'roundabout':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#1B4FC4" /><path d="M32 18 a14 14 0 1 1 -10 24" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" /><polygon points="20,40 26,42 22,46" fill="#fff" /><path d="M32 18 a14 14 0 0 1 12 8" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" /><polygon points="44,28 42,22 38,26" fill="#fff" /></svg>;
    case 'go-straight':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#1B4FC4" /><path d="M32 46 v-22 m-7 7 l7-7 l7 7" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>;
    case 'turn-left':
      return <svg style={s} viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#1B4FC4" /><path d="M42 32h-18l6-6M24 32l6 6" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>;
    case 'children':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,6 60,56 4,56" fill="#fff" stroke="#D9241F" strokeWidth="5" strokeLinejoin="round" /><circle cx="26" cy="28" r="2.5" fill="#111" /><path d="M23 42l3-8h3l3 8" stroke="#111" strokeWidth="2" fill="none" /><circle cx="38" cy="32" r="2" fill="#111" /><path d="M36 44l2-6h2l2 6" stroke="#111" strokeWidth="2" fill="none" /></svg>;
    case 'slippery':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,6 60,56 4,56" fill="#fff" stroke="#D9241F" strokeWidth="5" strokeLinejoin="round" /><rect x="22" y="32" width="20" height="10" rx="2" fill="#111" /><path d="M16 50q4-4 8 0 q4-4 8 0 q4-4 8 0" stroke="#111" strokeWidth="2" fill="none" /></svg>;
    case 'animals':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,6 60,56 4,56" fill="#fff" stroke="#D9241F" strokeWidth="5" strokeLinejoin="round" /><path d="M22 44c0-6 4-9 8-9s8 3 8 9M28 30c0-3 0-5-3-7M40 30c0-3 0-5 3-7" stroke="#111" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>;
    case 'roadworks':
      return <svg style={s} viewBox="0 0 64 64"><polygon points="32,6 60,56 4,56" fill="#fff" stroke="#D9241F" strokeWidth="5" strokeLinejoin="round" /><circle cx="32" cy="28" r="3" fill="#111" /><path d="M28 50l4-15 l4 15M20 42l8-7M44 42l-8-7" stroke="#111" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>;
    case 'hospital':
      return <svg style={s} viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#1B4FC4" /><text x="32" y="46" textAnchor="middle" fontSize="34" fontWeight="800" fill="#fff" fontFamily="Helvetica">H</text></svg>;
    case 'fuel':
      return <svg style={s} viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#1B4FC4" /><rect x="20" y="20" width="14" height="28" fill="#fff" /><rect x="22" y="22" width="10" height="6" fill="#1B4FC4" /><path d="M34 28h6v18a4 4 0 01-4 4" stroke="#fff" strokeWidth="2.5" fill="none" /></svg>;
    case 'one-way':
      return <svg style={s} viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#1B4FC4" /><path d="M14 32h36l-8-8M50 32l-8 8" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>;
    case 'highway':
      return <svg style={s} viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#1A8A4A" /><path d="M14 38l8-12h20l8 12M14 38h36v8H14z" stroke="#fff" strokeWidth="2.5" fill="none" /><circle cx="32" cy="42" r="2" fill="#fff" /></svg>;
    default:
      return <div style={{ width: size, height: size, background: '#ddd', borderRadius: 8 }} />;
  }
}

/// Every topic gets a sign so the road, the module rows and the lesson header
/// all show the same face for a topic. Keyed by the slugs in content/topics.json.
export const TOPIC_SIGNS = {
  general: 'priority',
  signals: 'go-straight',
  signs: 'warn-curve',
  markings: 'one-way',
  priority: 'yield',
  maneuvering: 'turn-right',
  overtaking: 'no-overtake',
  speed: 'speed',
  stopping: 'no-parking',
  pedestrians: 'crossing',
  special: 'roundabout',
  safety: 'hospital',
};

export function signForTopic(slug, index = 0) {
  // Falls back by position so an imported topic we have not mapped still gets a
  // stable, distinct sign instead of a grey box.
  const FALLBACK = ['priority', 'stop', 'no-entry', 'parking', 'fuel', 'highway', 'animals', 'children'];
  return TOPIC_SIGNS[slug] || FALLBACK[index % FALLBACK.length];
}
