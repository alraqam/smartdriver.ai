import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from './theme.jsx';
import { Icon } from './Icon.jsx';
import { Spinner } from './primitives.jsx';
import { clearPack, packMeta } from '../lib/offlinePack.js';
import { pendingCount } from '../lib/offlineQueue.js';

// Downloading the question bank, and the state of anything waiting to be sent
// back. Lives on the profile screen because it is a setting, not a feature —
// the practice itself is unchanged whether the questions came from the network
// or from the device.

function Row({ icon, color, label, value, T }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textDim }}>
      <Icon name={icon} size={14} color={color ?? T.textDim} strokeWidth={2.2} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export function OfflineCard() {
  const T = useTheme();
  const { t, locale } = useI18n();

  const [meta, setMeta] = useState(() => packMeta());
  const [queued, setQueued] = useState(() => pendingCount());
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  const refreshCounts = useCallback(() => {
    setMeta(packMeta());
    setQueued(pendingCount());
  }, []);

  // The queue drains from App's `online` listener, not from here, so this
  // screen has to re-read rather than assume its own count is current.
  useEffect(() => {
    window.addEventListener('online', refreshCounts);
    window.addEventListener('focus', refreshCounts);
    return () => {
      window.removeEventListener('online', refreshCounts);
      window.removeEventListener('focus', refreshCounts);
    };
  }, [refreshCounts]);

  async function download() {
    setBusy('download');
    setError(null);
    setNote(null);
    try {
      const res = await api.downloadPack();
      setMeta(res);
      setNote(res.unchanged ? t('offline.upToDate') : t('offline.downloaded', { n: res.questionCount }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy('sync');
    setError(null);
    setNote(null);
    try {
      const res = await api.syncNow();
      setNote(res ? t('offline.synced', { n: res.accepted }) : t('offline.nothingToSync'));
    } catch (err) {
      setError(err);
    } finally {
      refreshCounts();
      setBusy(null);
    }
  }

  function remove() {
    clearPack();
    refreshCounts();
    setNote(null);
  }

  const savedAt = meta?.savedAt
    ? new Date(meta.savedAt).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div style={{ padding: 16, borderRadius: 18, background: T.surface, border: `0.5px solid ${T.stroke}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flex: 'none',
          background: hexA(meta ? T.success : T.a, 0.14),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={meta ? 'check' : 'book'} size={17} color={meta ? T.success : T.a} strokeWidth={2.4} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>
            {t('offline.title')}
          </div>
          <div style={{ fontSize: 12, color: T.textDim, marginTop: 1 }}>
            {meta ? t('offline.ready') : t('offline.notDownloaded')}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: T.textDim, lineHeight: 1.5, margin: '8px 0 12px' }}>
        {/* Said plainly, because the alternative is a learner boarding a train
            believing they can sit a mock exam on it. */}
        {t('offline.explainer')}
      </p>

      {meta && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <Row T={T} icon="quiz" label={t('offline.questions')} value={meta.questionCount} />
          <Row T={T} icon="book" label={t('offline.topics')} value={meta.topicCount} />
          {savedAt && <Row T={T} icon="timer" label={t('offline.updated')} value={savedAt} />}
        </div>
      )}

      {queued > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '10px 12px', borderRadius: 12,
          background: hexA(T.warn, T.dark ? 0.16 : 0.1),
          border: `0.5px solid ${hexA(T.warn, 0.4)}`,
          fontSize: 12, color: T.text, lineHeight: 1.4,
        }}>
          <Icon name="timer" size={15} color={T.warn} strokeWidth={2.2} />
          <span style={{ flex: 1 }}>{t('offline.queued', { n: queued })}</span>
        </div>
      )}

      {note && (
        <div style={{ fontSize: 12, color: T.success, fontWeight: 700, marginBottom: 10 }}>{note}</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: T.danger, marginBottom: 10, lineHeight: 1.4 }}>
          {error.status === 0 ? t('common.offline') : error.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={download} disabled={busy !== null} style={{
          flex: 1, border: 'none', cursor: busy ? 'default' : 'pointer',
          background: busy === 'download' ? T.surface2 : T.aFill,
          color: busy === 'download' ? T.textFaint : '#fff',
          padding: '11px 12px', borderRadius: 12, fontFamily: 'inherit',
          fontSize: 13, fontWeight: 800, letterSpacing: -0.1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}>
          {busy === 'download' && <Spinner size={14} color={T.textFaint} />}
          {meta ? t('offline.refresh') : t('offline.download')}
        </button>

        {queued > 0 && (
          <button onClick={sync} disabled={busy !== null} style={{
            flex: 'none', border: `1.5px solid ${T.stroke}`, background: T.surface, color: T.text,
            padding: '11px 14px', borderRadius: 12, cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {busy === 'sync' && <Spinner size={14} />}
            {t('offline.syncNow')}
          </button>
        )}

        {meta && queued === 0 && (
          <button onClick={remove} disabled={busy !== null} aria-label={t('offline.remove')} style={{
            flex: 'none', border: `1.5px solid ${T.stroke}`, background: T.surface, color: T.textDim,
            padding: '11px 14px', borderRadius: 12, cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
          }}>
            {t('offline.remove')}
          </button>
        )}
      </div>
    </div>
  );
}
