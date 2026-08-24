// Stroke icon set, ported from the Claude Design prototype.
// One consistent 24-grid, one stroke weight scale — so icons never read as
// borrowed from three different libraries.

export function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 1.8 }) {
  const p = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  const s = { width: size, height: size, display: 'block' };

  switch (name) {
    case 'home':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9z" /></svg>;
    case 'book':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M4 4h10a4 4 0 014 4v13M4 4v15a2 2 0 002 2h12M4 4v15" /></svg>;
    case 'quiz':
      return <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="9" /><path {...p} d="M9 9a3 3 0 016 0c0 2-3 2-3 4" /><circle cx="12" cy="17" r="1" fill={color} /></svg>;
    case 'profile':
      return <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="8" r="4" /><path {...p} d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>;
    case 'chevron':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M9 6l6 6-6 6" /></svg>;
    case 'back':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M15 6l-6 6 6 6" /></svg>;
    case 'flame':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M12 3c1 4 5 5 5 10a5 5 0 11-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-6 1-9z" /></svg>;
    case 'bolt':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" /></svg>;
    case 'check':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M5 12l5 5 9-11" /></svg>;
    case 'close':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'lock':
      return <svg style={s} viewBox="0 0 24 24"><rect {...p} x="5" y="11" width="14" height="10" rx="2" /><path {...p} d="M8 11V8a4 4 0 018 0v3" /></svg>;
    case 'star':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M12 3l2.6 5.8 6.4.7-4.8 4.4 1.3 6.3L12 17l-5.5 3.2L7.8 14 3 9.5l6.4-.7L12 3z" /></svg>;
    case 'bell':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z" /><path {...p} d="M10 20a2 2 0 004 0" /></svg>;
    case 'heart':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M12 20s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z" /></svg>;
    case 'timer':
      return <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="13" r="8" /><path {...p} d="M12 9v4l3 2M9 3h6" /></svg>;
    case 'target':
      return <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="9" /><circle {...p} cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill={color} /></svg>;
    case 'map':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14" /></svg>;
    case 'car':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M4 16v-2l2-5a2 2 0 012-1h8a2 2 0 012 1l2 5v2M4 16v3h3v-3M20 16v3h-3v-3M4 16h16" /><circle cx="8" cy="15" r="1" fill={color} /><circle cx="16" cy="15" r="1" fill={color} /></svg>;
    case 'sign':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M3 7h13l3 3-3 3H3V7zM8 13v8M5 21h6" /></svg>;
    case 'trophy':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M9 17h6l-1 4h-4l-1-4z" /></svg>;
    case 'sun':
      return <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="4" /><path {...p} d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>;
    case 'moon':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M20 14A8 8 0 0110 4a8 8 0 1010 10z" /></svg>;
    case 'mountain':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M3 20l6-10 4 6 3-4 5 8H3z" /></svg>;
    case 'search':
      return <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="11" cy="11" r="7" /><path {...p} d="M16 16l5 5" /></svg>;
    case 'grid':
      return <svg style={s} viewBox="0 0 24 24"><rect {...p} x="3" y="3" width="7" height="7" rx="1.5" /><rect {...p} x="14" y="3" width="7" height="7" rx="1.5" /><rect {...p} x="3" y="14" width="7" height="7" rx="1.5" /><rect {...p} x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case 'library':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M12 3l9 6-9 6-9-6 9-6z" /><path {...p} d="M12 15v6" /></svg>;
    // Added for this app: the AI tutor, which the prototype had no screen for.
    case 'sparkle':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path {...p} d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" /></svg>;
    case 'logout':
      return <svg style={s} viewBox="0 0 24 24"><path {...p} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
    case 'phone':
      return <svg style={s} viewBox="0 0 24 24"><rect {...p} x="6" y="2" width="12" height="20" rx="3" /><path {...p} d="M11 18h2" /></svg>;
    default:
      return null;
  }
}
