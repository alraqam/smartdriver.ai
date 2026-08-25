import { NavLink } from 'react-router-dom';
import { useTheme, hexA } from './theme.jsx';
import { Icon } from './Icon.jsx';
import { useI18n } from '../i18n/index.jsx';

// Phone navigation, replacing the 248px sidebar below the mobile breakpoint.
// The idiom comes from the original Claude Design prototype, whose shared.jsx
// had exactly this: a blurred bar pinned to the bottom, four or five tabs.
//
// The sidebar's eight entries do not fit, so two are re-homed rather than
// crammed in: the mock exam already has the finish flag at the end of the road,
// and the sign library gets a header button on the topic list. Admin, the
// language toggle, the theme toggle and sign-out all live inside Profil.

export const TAB_BAR_HEIGHT = 58;

const TABS = [
  { id: 'road', to: '/', icon: 'map', end: true },
  { id: 'lessons', to: '/lessons', icon: 'book' },
  { id: 'mistakes', to: '/mistakes', icon: 'target', badge: 'due' },
  { id: 'tutor', to: '/tutor', icon: 'sparkle' },
  { id: 'profile', to: '/profile', icon: 'profile' },
];

export function BottomTabBar({ due = 0 }) {
  const T = useTheme();
  const { t } = useI18n();

  return (
    <nav
      aria-label={t('nav.primary')}
      style={{
        flex: 'none', display: 'flex', alignItems: 'stretch',
        // The bar sits on `surface`, not on the desktop shell's colour.
        // Measured: the light shell surface left the active label's accent at
        // 4.43 against it, and these labels are 10px, so AA wants the full 4.5
        // with no large-text allowance. On `surface` it clears 5.
        background: hexA(T.surface, T.dark ? 0.92 : 0.94),
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${T.line}`,
        // The home indicator on a modern iPhone sits inside the viewport; without
        // this the last row of labels lands under it.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.id}
          to={tab.to}
          end={tab.end}
          style={({ isActive }) => ({
            flex: 1, minWidth: 0, height: TAB_BAR_HEIGHT,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            textDecoration: 'none', position: 'relative',
            color: isActive ? T.a : T.textDim,
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{ position: 'relative', display: 'flex', lineHeight: 0 }}>
                <Icon name={tab.icon} size={22} color={isActive ? T.a : T.textDim} strokeWidth={isActive ? 2.4 : 2} />
                {tab.badge === 'due' && due > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, left: 12,
                    minWidth: 17, padding: '0 4px', borderRadius: 9,
                    background: T.dangerFill, color: '#fff',
                    fontSize: 10, fontWeight: 800, lineHeight: '17px', textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                    // Punch the badge out of the icon so a two-digit count still
                    // reads as a badge rather than as part of the glyph. The
                    // ring has to be the bar's own colour, not a fixed hex, or
                    // it stops matching the moment the bar's surface changes.
                    boxShadow: `0 0 0 2px ${T.surface}`,
                  }}>{due > 99 ? '99+' : due}</span>
                )}
              </span>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 800 : 600, letterSpacing: -0.1,
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{t(`nav.${tab.id}`)}</span>
              {isActive && (
                <span aria-hidden="true" style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 26, height: 3, borderRadius: '0 0 3px 3px', background: T.a,
                  boxShadow: `0 2px 8px ${hexA(T.a, 0.5)}`,
                }} />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
