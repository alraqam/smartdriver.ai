import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import {
  ErrorNote, GhostButton, Loading, PrimaryButton, Screen, ScreenHeader, Segmented, Spinner, StatCard,
} from '../design/primitives.jsx';

// Content operations for the team that maintains the question bank.
//
// Only reachable by an admin, and the sidebar only offers it to one — but the
// gate that matters is AdminGuard on the server, which re-reads the role from
// the database. This is convenience, not security.

const STATUS_TINT = {
  draft: 'warn',
  published: 'success',
  retired: 'textDim',
};

function StatusPill({ status }) {
  const T = useTheme();
  const { t } = useI18n();
  const color = T[STATUS_TINT[status]] ?? T.textDim;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 8, whiteSpace: 'nowrap',
      background: hexA(color === T.textDim ? T.text : color, 0.14),
      color: color === T.textDim ? T.textDim : color,
      fontSize: 10, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase',
    }}>{t(`admin.${status}`)}</span>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────

function Overview() {
  const T = useTheme();
  const { t, locale } = useI18n();
  const [stats, setStats] = useState(null);
  const [ai, setAi] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.admin.stats(), api.admin.aiUsage(30)])
      .then(([s, a]) => { setStats(s); setAi(a); })
      .catch(setError);
  }, []);
  useEffect(load, [load]);

  if (error && !stats) return <div style={{ padding: 20 }}><ErrorNote error={error} onRetry={load} retryLabel={t('common.retry')} /></div>;
  if (!stats) return <Loading label={t('common.loading')} />;

  const q = stats.questions;
  const healthIssues = [];
  if (stats.ungroundedQuestions > 0) healthIssues.push(t('admin.ungrounded', { n: stats.ungroundedQuestions }));
  if (stats.danglingRuleRefs.length > 0) {
    healthIssues.push(t('admin.dangling', {
      n: stats.danglingRuleRefs.length,
      codes: stats.danglingRuleRefs.slice(0, 8).join(', '),
    }));
  }

  const liveCalls = (ai?.byFeature ?? []).filter((f) => !f.mock);
  const mockCalls = (ai?.byFeature ?? []).filter((f) => f.mock);

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <StatCard icon="check" color={T.success} value={q.published} label={t('admin.published')} />
        <StatCard icon="book" color={T.warn} value={q.draft} label={t('admin.draft')} />
        <StatCard icon="close" color={T.textDim} value={q.retired} label={t('admin.retired')} />
        <StatCard icon="quiz" color={T.a} value={stats.rules} label={t('admin.rules')} />
      </div>

      {/* Content health — the things a learner never sees */}
      <div style={{
        padding: 14, borderRadius: 14, marginBottom: 16,
        background: healthIssues.length ? hexA(T.warn, T.dark ? 0.14 : 0.1) : T.surface,
        border: `0.5px solid ${healthIssues.length ? hexA(T.warn, 0.4) : T.stroke}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.5,
          textTransform: 'uppercase', marginBottom: 6,
        }}>{t('admin.health')}</div>
        {healthIssues.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={15} color={T.success} strokeWidth={2.4} />
            {t('admin.healthOk')}
          </div>
        ) : (
          healthIssues.map((h, i) => (
            <div key={i} style={{
              fontSize: 13, color: T.text, lineHeight: 1.45, marginTop: i ? 6 : 0,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <Icon name="bell" size={15} color={T.warn} strokeWidth={2.2} />
              <span>{h}</span>
            </div>
          ))
        )}
      </div>

      {/* AI spend */}
      {ai && (
        <div style={{ padding: 14, borderRadius: 14, background: T.surface, border: `0.5px solid ${T.stroke}`, marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.5,
            textTransform: 'uppercase', marginBottom: 8,
          }}>{t('admin.aiUsage')}</div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: T.text }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{ai.cachedExplanations}</div>
              <div style={{ fontSize: 11, color: T.textDim }}>{t('admin.aiCached')}</div>
            </div>
            {liveCalls.map((f) => (
              <div key={f.feature}>
                <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{f.calls}</div>
                <div style={{ fontSize: 11, color: T.textDim }}>
                  {f.feature} · {f.inputTokens.toLocaleString()}/{f.outputTokens.toLocaleString()}
                </div>
              </div>
            ))}
            {mockCalls.map((f) => (
              <div key={f.feature}>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.textDim, fontVariantNumeric: 'tabular-nums' }}>{f.calls}</div>
                <div style={{ fontSize: 11, color: T.textDim }}>{f.feature} · {t('admin.aiMock')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per topic */}
      <div style={{
        fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.5,
        textTransform: 'uppercase', marginBottom: 8,
      }}>{t('admin.byTopic')}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stats.topics.map((tp) => (
          <div key={tp.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            borderRadius: 12, background: T.surface, border: `0.5px solid ${T.stroke}`,
          }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.text }}>
              {locale === 'ru' ? tp.titleRu : tp.titleUz}
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.success, fontVariantNumeric: 'tabular-nums' }}>{tp.published}</span>
            {tp.draft > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: T.warn, fontVariantNumeric: 'tabular-nums' }}>+{tp.draft}</span>}
            {tp.retired > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: T.textFaint, fontVariantNumeric: 'tabular-nums' }}>−{tp.retired}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Review queue
// ─────────────────────────────────────────────────────────────

const PAGE = 25;

/// Diagram control for one question row.
///
/// Many exam questions ARE a diagram — the signs and markings topics are
/// almost entirely pictures — so attaching one has to be a two-click job in
/// the review queue, not a round trip through the import file.
function ImageCell({ item, onChanged, onError }) {
  const T = useTheme();
  const { t } = useI18n();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = ''; // so re-picking the same file fires change again
    if (!f) return;
    setBusy(true);
    try {
      const up = await api.admin.uploadImage(f);
      await api.admin.updateQuestion(item.id, { imageUrl: up.url });
      onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.admin.updateQuestion(item.id, { imageUrl: null });
      onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 56 }}>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} style={{ display: 'none' }} />

      <button
        onClick={() => ref.current?.click()}
        disabled={busy}
        title={item.imageUrl ? t('admin.replaceImage') : `${t('admin.addImage')} · ${t('admin.imageHelp')}`}
        style={{
          width: 56, height: 44, borderRadius: 8, cursor: busy ? 'default' : 'pointer',
          border: `1px dashed ${item.imageUrl ? 'transparent' : T.stroke}`,
          background: item.imageUrl ? T.surface2 : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', padding: 0,
        }}
      >
        {busy ? (
          <Spinner size={14} />
        ) : item.imageUrl ? (
          <img src={item.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
        ) : (
          <Icon name="map" size={16} color={T.textFaint} strokeWidth={2} />
        )}
      </button>

      {item.imageUrl && !busy && (
        <button onClick={remove} style={{
          border: 'none', background: 'transparent', color: T.textFaint,
          fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>{t('admin.removeImage')}</button>
      )}
    </div>
  );
}

function Questions() {
  const T = useTheme();
  const { t, locale } = useI18n();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.admin
      .questions({ ...(status ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}), skip, take: PAGE })
      .then(setData)
      .catch(setError);
  }, [status, q, skip]);

  useEffect(load, [load]);
  // Selection is by id, so it would survive a filter change and silently apply
  // a bulk action to rows no longer on screen.
  useEffect(() => { setSelected(new Set()); }, [status, q, skip]);

  async function apply(next) {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.setStatusBulk([...selected], next);
      setSelected(new Set());
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function applyOne(id, next) {
    setBusy(true);
    setError(null);
    try {
      await api.admin.setStatus(id, next);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* Filters */}
      <div style={{ flex: 'none', padding: '14px 20px 8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 10,
          background: T.surface2, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="search" size={15} color={T.textDim} strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setSkip(0); }}
            placeholder={t('admin.searchPlaceholder')}
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: T.text, fontSize: 13, minWidth: 0 }}
          />
        </div>
        <Segmented
          value={status}
          onChange={(v) => { setStatus(v); setSkip(0); }}
          options={[
            { id: '', label: t('admin.filterAll') },
            { id: 'draft', label: t('admin.draft') },
            { id: 'published', label: t('admin.published') },
            { id: 'retired', label: t('admin.retired') },
          ]}
          style={{ flex: 'none' }}
        />
      </div>

      {/* Bulk bar — only when something is selected */}
      {selected.size > 0 && (
        <div style={{
          flex: 'none', margin: '0 20px 8px', padding: '10px 12px', borderRadius: 12,
          background: hexA(T.a, 0.12), border: `0.5px solid ${hexA(T.a, 0.4)}`,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
            {t('admin.selected', { n: selected.size })}
          </span>
          <button onClick={() => setSelected(new Set())} style={{
            border: 'none', background: 'transparent', color: T.textDim,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}>{t('admin.clearSelection')}</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => apply('published')} disabled={busy} style={{
              border: 'none', background: T.success, color: '#fff', padding: '8px 14px',
              borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>{t('admin.publish')}</button>
            <button onClick={() => apply('retired')} disabled={busy} style={{
              border: `1px solid ${T.stroke}`, background: T.surface, color: T.danger, padding: '8px 14px',
              borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>{t('admin.retire')}</button>
          </div>
        </div>
      )}

      <div style={{ flex: 'none', padding: '0 20px' }}><ErrorNote error={error} /></div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 16px' }}>
        {!data ? (
          <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : data.items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontSize: 14 }}>{t('admin.noQuestions')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.items.map((item) => {
              const on = selected.has(item.id);
              const correct = item.options.find((o) => o.isCorrect);
              return (
                <div key={item.id} style={{
                  padding: 12, borderRadius: 12,
                  background: on ? hexA(T.a, 0.08) : T.surface,
                  border: `1px solid ${on ? hexA(T.a, 0.5) : T.stroke}`,
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}>
                  <button onClick={() => toggle(item.id)} aria-label={item.externalId} style={{
                    flex: 'none', marginTop: 2, width: 20, height: 20, borderRadius: 6,
                    border: `1.5px solid ${on ? T.a : T.textFaint}`,
                    background: on ? T.a : 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}>
                    {on && <Icon name="check" size={13} color="#fff" strokeWidth={3} />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <code style={{ fontSize: 11, color: T.textDim, fontFamily: 'ui-monospace, monospace' }}>{item.externalId}</code>
                      <StatusPill status={item.status} />
                      <span style={{ fontSize: 11, color: T.textFaint }}>{locale === 'ru' ? item.topic.titleRu : item.topic.titleUz}</span>
                      {item.ruleRefs.length === 0 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: T.warn }}>⚠ no ruleRefs</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>
                      {locale === 'ru' ? item.textRu : item.textUz}
                    </div>
                    {correct && (
                      <div style={{ fontSize: 12, color: T.success, marginTop: 4 }}>
                        ✓ {locale === 'ru' ? correct.textRu : correct.textUz}
                      </div>
                    )}
                  </div>

                  <ImageCell item={item} onChanged={load} onError={setError} />

                  <div style={{ flex: 'none', display: 'flex', gap: 6 }}>
                    {item.status !== 'published' && (
                      <button onClick={() => applyOne(item.id, 'published')} disabled={busy} title={t('admin.publish')} style={{
                        border: 'none', background: hexA(T.success, 0.15), color: T.success,
                        width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}><Icon name="check" size={15} color={T.success} strokeWidth={2.6} /></button>
                    )}
                    {item.status !== 'retired' && (
                      <button onClick={() => applyOne(item.id, 'retired')} disabled={busy} title={t('admin.retire')} style={{
                        border: 'none', background: hexA(T.danger, 0.12), color: T.danger,
                        width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}><Icon name="close" size={15} color={T.danger} strokeWidth={2.6} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paging */}
      {data && data.total > PAGE && (
        <div style={{
          flex: 'none', padding: '10px 20px 16px', borderTop: `0.5px solid ${T.stroke}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 12, color: T.textDim, fontVariantNumeric: 'tabular-nums' }}>
            {t('admin.showing', { a: data.skip + 1, b: Math.min(data.skip + data.take, data.total), total: data.total })}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <GhostButton onClick={() => setSkip(Math.max(0, skip - PAGE))} disabled={skip === 0} style={{ width: 'auto', padding: '8px 14px' }}>
              {t('admin.prev')}
            </GhostButton>
            <GhostButton onClick={() => setSkip(skip + PAGE)} disabled={skip + PAGE >= data.total} style={{ width: 'auto', padding: '8px 14px' }}>
              {t('admin.next')}
            </GhostButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Import
// ─────────────────────────────────────────────────────────────

function ImportTab() {
  const T = useTheme();
  const { t } = useI18n();
  const fileRef = useRef(null);

  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [dry, setDry] = useState(null);
  const [applied, setApplied] = useState(null);
  const [allowMassRetire, setAllowMassRetire] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(() => {
    api.admin.imports(15).then(setHistory).catch(() => {});
  }, []);
  useEffect(loadHistory, [loadHistory]);

  function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null); setDry(null); setApplied(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error(t('admin.invalidJson'));
        setFile(f); setRows(parsed);
      } catch (err) {
        setFile(null); setRows(null);
        setError(new Error(err.message || t('admin.invalidJson')));
      }
    };
    reader.readAsText(f);
  }

  // Always dry-run first. Applying straight from a file picker is how a wrong
  // export quietly retires half the bank.
  async function run(isDry) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.admin.import(rows, file.name, { dryRun: isDry, allowMassRetire });
      if (isDry) { setDry(r); setApplied(null); }
      else { setApplied(r); setDry(null); loadHistory(); }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const report = applied ?? dry;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
      <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.5, marginBottom: 14 }}>
        {t('admin.importHelp')}
      </div>

      <input ref={fileRef} type="file" accept="application/json,.json" onChange={pick} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <GhostButton onClick={() => fileRef.current?.click()} style={{ width: 'auto', padding: '11px 18px' }}>
          {t('admin.chooseFile')}
        </GhostButton>
        {file && rows && (
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
            {t('admin.fileChosen', { name: file.name, n: rows.length })}
          </span>
        )}
      </div>

      <ErrorNote error={error} />

      {rows && (
        <>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
            fontSize: 12.5, color: T.textDim, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={allowMassRetire} onChange={(e) => setAllowMassRetire(e.target.checked)} />
            {t('admin.allowMassRetire')}
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <PrimaryButton onClick={() => run(true)} disabled={busy} style={{ width: 'auto', padding: '12px 20px' }}>
              {busy && !dry ? t('admin.checking') : t('admin.dryRun')}
            </PrimaryButton>
            {dry && (
              <button onClick={() => run(false)} disabled={busy} style={{
                border: 'none', background: T.success, color: '#fff', padding: '12px 20px',
                borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}>{busy ? t('admin.applying') : t('admin.apply')}</button>
            )}
          </div>
        </>
      )}

      {report && (
        <div style={{
          marginTop: 16, padding: 14, borderRadius: 14,
          background: applied ? hexA(T.success, T.dark ? 0.14 : 0.1) : T.surface,
          border: `0.5px solid ${applied ? hexA(T.success, 0.4) : T.stroke}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: applied ? T.success : T.textDim, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {applied ? t('admin.applied') : t('admin.dryResult')}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              { v: report.inserted, l: t('admin.inserted'), c: T.success },
              { v: report.updated, l: t('admin.updated'), c: T.a },
              { v: report.skipped, l: t('admin.unchanged'), c: T.textDim },
            ].map((x) => (
              <div key={x.l}>
                <div style={{ fontSize: 22, fontWeight: 800, color: x.c, fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
                <div style={{ fontSize: 11, color: T.textDim, fontWeight: 600 }}>{x.l}</div>
              </div>
            ))}
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{report.kind}</div>
              <div style={{ fontSize: 11, color: T.textDim, fontWeight: 600 }}>{report.filename}</div>
            </div>
          </div>

          {report.warnings?.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${T.stroke}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.warn, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {t('admin.warnings')}
              </div>
              {report.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12.5, color: T.text, marginTop: 4, lineHeight: 1.45 }}>· {w}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div style={{
        fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.5,
        textTransform: 'uppercase', margin: '24px 0 8px',
      }}>{t('admin.history')}</div>

      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textDim }}>{t('admin.noHistory')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {history.map((h) => (
            <div key={h.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 10, background: T.surface, border: `0.5px solid ${T.stroke}`,
              fontSize: 12, color: T.textDim,
            }}>
              <span style={{ fontWeight: 800, color: T.text, minWidth: 66 }}>{h.kind}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.filename}</span>
              {h.dryRun && <span style={{ color: T.warn, fontWeight: 700 }}>dry</span>}
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{h.inserted} ~{h.updated} ={h.skipped}</span>
              <span style={{ color: T.textFaint }}>{new Date(h.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

export default function Admin() {
  const { t } = useI18n();
  const [tab, setTab] = useState('overview');

  return (
    <Screen>
      <ScreenHeader title={t('admin.title')} />
      <div style={{ flex: 'none', padding: '12px 20px 0' }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'overview', label: t('admin.tabOverview') },
            { id: 'questions', label: t('admin.tabQuestions') },
            { id: 'import', label: t('admin.tabImport') },
          ]}
        />
      </div>

      {tab === 'overview' && <div style={{ flex: 1, overflowY: 'auto' }}><Overview /></div>}
      {tab === 'questions' && <Questions />}
      {tab === 'import' && <ImportTab />}
    </Screen>
  );
}
