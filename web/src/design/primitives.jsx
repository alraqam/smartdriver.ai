import { useTheme, hexA } from './theme.jsx';
import { Icon } from './Icon.jsx';
import { useI18n } from '../i18n/index.jsx';

/// Progress ring. Ported from the prototype.
export function Ring({ size = 64, value = 0, stroke = 6, color, track, children }) {
  const T = useTheme();
  const c = color || T.a;
  const tk = track || (T.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tk} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={stroke}
          strokeDasharray={C} strokeDashoffset={C * (1 - v)} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(.2,.7,.3,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ icon, color, value, label }) {
  const T = useTheme();
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 14,
      background: T.surface, border: `0.5px solid ${T.stroke}`,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon name={icon} size={14} color={color} strokeWidth={2.2} />
        <span style={{
          fontSize: 10, color: T.textDim, fontWeight: 700, letterSpacing: 0.3,
          textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

export function StatChip({ icon, value, label, color }) {
  const T = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '6px 10px', borderRadius: 12,
      background: T.surface, boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
      border: `0.5px solid ${T.stroke}`,
    }}>
      <Icon name={icon} size={15} color={color} strokeWidth={2.2} />
      <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 10, color: T.textDim, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled, icon, style }) {
  const T = useTheme();
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', border: 'none',
      background: disabled ? T.surface2 : T.aFill,
      color: disabled ? T.textFaint : '#fff',
      padding: '15px 18px', borderRadius: 16,
      fontSize: 15, fontWeight: 800, letterSpacing: -0.2,
      cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
      boxShadow: disabled ? 'none' : `0 10px 28px ${hexA(T.a, 0.4)}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      ...style,
    }}>
      {icon && <Icon name={icon} size={17} color={disabled ? T.textFaint : '#fff'} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, style }) {
  const T = useTheme();
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', border: `1.5px solid ${T.stroke}`, background: T.surface, color: T.text,
      padding: '13px', borderRadius: 14, fontSize: 14, fontWeight: 700,
      cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}>{children}</button>
  );
}

/// Round back button used in every screen header.
export function BackButton({ onClick }) {
  const T = useTheme();
  return (
    <button onClick={onClick} aria-label="back" style={{
      border: 'none', background: T.surface, width: 38, height: 38, borderRadius: 19,
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none',
    }}>
      <Icon name="back" size={18} color={T.text} />
    </button>
  );
}

export function Segmented({ options, value, onChange, style }) {
  const T = useTheme();
  return (
    <div style={{ display: 'flex', gap: 6, ...style }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
          borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
          background: value === o.id ? T.text : T.surface,
          color: value === o.id ? T.bg : T.textDim,
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Spinner({ size = 20, color }) {
  const T = useTheme();
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${T.stroke}`,
      borderTopColor: color || T.a,
      borderRadius: '50%',
      animation: 'sdai-spin 700ms linear infinite',
      display: 'inline-block',
    }} />
  );
}

export function Loading({ label }) {
  const T = useTheme();
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 10, color: T.textDim, fontSize: 14, background: T.bg,
    }}>
      <Spinner /> {label}
    </div>
  );
}

export function ErrorNote({ error, onRetry, retryLabel }) {
  const T = useTheme();
  const { t } = useI18n();
  if (!error) return null;
  // Status 0 is the api client's marker for "the request never got an answer".
  // Every screen shows this note, so translating it here covers all of them at
  // once rather than each page checking for itself.
  const message = error.status === 0 ? t('common.offline') : error.message;
  return (
    <div style={{
      margin: '12px 0', padding: '12px 14px', borderRadius: 14,
      background: hexA(T.danger, T.dark ? 0.16 : 0.1),
      border: `0.5px solid ${hexA(T.danger, 0.4)}`,
      color: T.dark ? '#FFB3AE' : T.danger,
      fontSize: 13, lineHeight: 1.4,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          border: 'none', background: 'transparent', color: 'inherit',
          fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          textDecoration: 'underline', padding: 0, flex: 'none',
        }}>{retryLabel}</button>
      )}
    </div>
  );
}

/// A screen fills its panel absolutely, exactly as the prototype's screens did.
export function Screen({ children, scroll = false, style }) {
  const T = useTheme();
  return (
    <div style={{
      position: 'absolute', inset: 0, background: T.bg,
      display: 'flex', flexDirection: 'column',
      overflowY: scroll ? 'auto' : 'hidden',
      ...style,
    }}>{children}</div>
  );
}

export function ScreenHeader({ title, eyebrow, onBack, right }) {
  const T = useTheme();
  return (
    <div style={{
      padding: '28px 20px 14px', borderBottom: `0.5px solid ${T.stroke}`,
      display: 'flex', alignItems: 'center', gap: 12, flex: 'none',
    }}>
      {onBack && <BackButton onClick={onBack} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div style={{ fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.6 }}>{eyebrow}</div>
        )}
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.4 }}>{title}</div>
      </div>
      {right}
    </div>
  );
}
