import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { RoadSign } from '../design/RoadSign.jsx';
import { CATEGORY_ORDER, CATEGORY_TINTS, SIGN_CATALOG } from '../design/signCatalog.js';
import { Screen } from '../design/primitives.jsx';

// Sign library, ported from the prototype's SignLibrary + SignDetail.
//
// The only screen with no backend behind it, deliberately: it is static
// reference content, identical for everyone, so it lives in the bundle and
// works offline. The detail sheet's CTA hands the sign to the AI tutor, which
// is the one thing here that does hit the server.

function SectionHead({ icon, label }) {
  const T = useTheme();
  return (
    <div style={{
      marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 800, color: T.textDim,
      letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      <Icon name={icon} size={12} color={T.textDim} strokeWidth={2.2} />
      {label}
    </div>
  );
}

function SignDetail({ sign, onClose, onAsk }) {
  const T = useTheme();
  const { t, locale } = useI18n();
  const tint = CATEGORY_TINTS[sign.cat];
  const copy = sign[locale] || sign.uz;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end', animation: 'sdai-fade-in 0.15s ease-out',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '90%', background: T.bg,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        display: 'flex', flexDirection: 'column',
        animation: 'sdai-slide-up 0.25s ease-out',
      }}>
        <div style={{ width: 40, height: 4, background: T.textFaint, borderRadius: 2, margin: '10px auto', flex: 'none' }} />

        <div style={{
          flex: 'none', padding: '12px 24px 20px',
          background: `linear-gradient(160deg, ${hexA(tint.dot, T.dark ? 0.3 : 0.18)}, transparent)`,
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: 22, flex: 'none', background: T.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
          }}>
            <RoadSign kind={sign.kind} size={72} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 10,
              background: hexA(tint.dot, 0.2), color: tint.dot,
              fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: tint.dot }} />
              {t(tint.label)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.4, marginTop: 6 }}>
              {copy.name}
            </div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
              {t('signs.code')} {sign.kind.toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
          <SectionHead icon="quiz" label={t('signs.meaning')} />
          <p style={{ fontSize: 14, color: T.text, lineHeight: 1.5, margin: '6px 0 0' }}>{copy.meaning}</p>

          <SectionHead icon="map" label={t('signs.when')} />
          <p style={{ fontSize: 14, color: T.textDim, lineHeight: 1.5, margin: '6px 0 0' }}>{copy.when}</p>

          <SectionHead icon="bolt" label={t('signs.action')} />
          <div style={{
            marginTop: 6, padding: '12px 14px', borderRadius: 14,
            background: hexA(tint.dot, T.dark ? 0.15 : 0.1),
            border: `0.5px solid ${hexA(tint.dot, 0.4)}`,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <div style={{
              flex: '0 0 auto', width: 22, height: 22, borderRadius: 11, background: tint.dot,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="check" size={13} color="#fff" strokeWidth={3} />
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.45, fontWeight: 600 }}>{copy.action}</div>
          </div>

          <button onClick={() => onAsk(copy.name)} style={{
            marginTop: 22, width: '100%', border: 'none', background: T.a, color: '#fff',
            padding: 14, borderRadius: 14, fontFamily: 'inherit',
            fontSize: 15, fontWeight: 800, letterSpacing: -0.2, cursor: 'pointer',
            boxShadow: `0 8px 22px ${hexA(T.a, 0.35)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Icon name="sparkle" size={16} color="#fff" strokeWidth={2.4} />
            {t('signs.askTutor')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Signs() {
  const T = useTheme();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);

  const items = useMemo(() => SIGN_CATALOG.filter((s) => {
    if (cat !== 'all' && s.cat !== cat) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const copy = s[locale] || s.uz;
    return `${copy.name} ${copy.meaning}`.toLowerCase().includes(q);
  }), [cat, query, locale]);

  const grouped = cat === 'all'
    ? CATEGORY_ORDER.map((c) => ({ cat: c, items: items.filter((i) => i.cat === c) }))
    : [{ cat, items }];

  const cats = [
    { id: 'all', label: t('signs.catAll') },
    ...CATEGORY_ORDER.map((c) => ({ id: c, label: t(CATEGORY_TINTS[c].label) })),
  ];

  return (
    <Screen>
      <div style={{ flex: 'none', padding: '22px 20px 8px', borderBottom: `0.5px solid ${T.stroke}` }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.6 }}>
          {t('signs.total', { n: SIGN_CATALOG.length })}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.4 }}>{t('signs.title')}</div>

        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 12, background: T.surface2,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="search" size={16} color={T.textDim} strokeWidth={2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('signs.search')}
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              color: T.text, fontSize: 14, minWidth: 0,
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label={t('common.close')} style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex',
            }}>
              <Icon name="close" size={16} color={T.textDim} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingBottom: 10, overflowX: 'auto' }}>
          {cats.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              cursor: 'pointer', padding: '7px 14px', borderRadius: 14, whiteSpace: 'nowrap',
              background: cat === c.id ? T.text : T.surface,
              color: cat === c.id ? T.bg : T.textDim,
              border: cat === c.id ? '1px solid transparent' : `0.5px solid ${T.stroke}`,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            }}>{c.label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 24px' }}>
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontSize: 14 }}>
            {t('signs.noResults')}
          </div>
        )}

        {grouped.map((g) => g.items.length > 0 && (
          <div key={g.cat} style={{ marginBottom: 18 }}>
            {cat === 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 4px 10px' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_TINTS[g.cat].dot }} />
                <div style={{
                  fontSize: 11, fontWeight: 800, color: T.textDim,
                  letterSpacing: 0.6, textTransform: 'uppercase',
                }}>{t(CATEGORY_TINTS[g.cat].label)} · {g.items.length}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 8 }}>
              {g.items.map((s) => {
                const copy = s[locale] || s.uz;
                return (
                  <button key={s.kind} onClick={() => setActive(s)} style={{
                    background: T.surface, borderRadius: 14, padding: '14px 8px 10px',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    border: `0.5px solid ${T.stroke}`,
                    borderBottom: `2px solid ${CATEGORY_TINTS[s.cat].dot}`,
                  }}>
                    <RoadSign kind={s.kind} size={56} />
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: T.text, textAlign: 'center',
                      lineHeight: 1.25, letterSpacing: -0.1,
                    }}>{copy.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {active && (
        <SignDetail
          sign={active}
          onClose={() => setActive(null)}
          onAsk={(name) => navigate(`/tutor?q=${encodeURIComponent(name)}`)}
        />
      )}
    </Screen>
  );
}
