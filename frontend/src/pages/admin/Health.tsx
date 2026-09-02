import React, { useEffect, useState } from 'react';
import { get } from '../../api';
import { useLang } from '../../i18n';
import { Spinner, useToast } from '../../ui';
import { Icon } from '../../icons';

type Status = 'ok' | 'warn' | 'fail';
type Check = { key: string; label_mn: string; label_en: string; status: Status; value?: string; detail_mn?: string; detail_en?: string };
type Group = { key: string; title_mn: string; title_en: string; checks: Check[] };
type Report = { overall: Status; counts: Record<Status, number>; total: number; generated_at: string; took_ms: number; groups: Group[] };

const GROUP_ICON: Record<string, string> = {
  database: 'box', schema: 'file', storage: 'download', application: 'settings',
  integrations: 'plug', data: 'chart', security: 'shield',
};

export default function Health() {
  const { lang } = useLang();
  const mn = lang === 'mn';
  const { toast } = useToast();
  const [d, setD] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setBusy(true); setErr('');
    try { setD(await get('/admin/health')); }
    catch (e: any) { setErr(e?.code || e?.message || 'error'); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const copyReport = async () => {
    if (!d) return;
    const lines = [
      `OASIS v2 — system health check`,
      `Generated: ${new Date(d.generated_at).toLocaleString()} (${d.took_ms} ms)`,
      `Overall: ${d.overall.toUpperCase()}  ·  ${d.counts.ok} ok / ${d.counts.warn} warn / ${d.counts.fail} fail`,
      '',
    ];
    for (const g of d.groups) {
      lines.push(`## ${g.title_en}`);
      for (const c of g.checks) {
        lines.push(`  [${c.status.toUpperCase().padEnd(4)}] ${c.label_en} — ${c.value ?? ''}`);
        if (c.detail_en) lines.push(`         ${c.detail_en}`);
      }
      lines.push('');
    }
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(mn ? 'Тайланг хууллаа' : 'Report copied', 'ok'); }
    catch { toast(mn ? 'Хуулж чадсангүй' : 'Could not copy', 'err'); }
  };

  const label = (c: Check) => (mn ? c.label_mn : c.label_en) || c.label_en;
  const detail = (c: Check) => (mn ? c.detail_mn : c.detail_en) || undefined;

  if (!d && busy) return <Spinner />;
  if (err) return (
    <>
      <h1>{mn ? 'Системийн эрүүл мэнд' : 'System health check'}</h1>
      <div className="card"><div className="hc-empty">{mn ? 'Тайлан авч чадсангүй: ' : 'Could not load the report: '}{err}</div></div>
    </>
  );
  if (!d) return <Spinner />;

  const verdict = {
    ok:   { mn: 'Систем хэвийн ажиллаж байна', en: 'All systems operational' },
    warn: { mn: 'Ажиллаж байна — анхаарах зүйл бий', en: 'Operational with warnings' },
    fail: { mn: 'Анхаарал шаардлагатай', en: 'Attention required' },
  }[d.overall];

  return (
    <>
      <div className="row between mb16">
        <div>
          <h1>{mn ? 'Системийн эрүүл мэнд' : 'System health check'}</h1>
          <div className="mut">
            {mn ? 'Зөвхөн уншина — ямар нэг өөрчлөлт хийхгүй.' : 'Read-only — this page changes nothing.'}
            {' '}{new Date(d.generated_at).toLocaleString()} · {d.took_ms} ms
          </div>
        </div>
        <div className="row">
          <button className="btn sec" onClick={copyReport}>{mn ? 'Тайланг хуулах' : 'Copy report'}</button>
          <button className="btn" onClick={load} disabled={busy}>{busy ? '…' : (mn ? 'Дахин шалгах' : 'Re-run')}</button>
        </div>
      </div>

      <div className={`hc-banner ${d.overall}`}>
        <span className={`hc-dot ${d.overall}`} />
        <div className="hc-banner-txt">
          <b>{mn ? verdict.mn : verdict.en}</b>
          <span>{d.counts.ok} {mn ? 'хэвийн' : 'passing'} · {d.counts.warn} {mn ? 'анхааруулга' : 'warnings'} · {d.counts.fail} {mn ? 'алдаа' : 'failing'} · {d.total} {mn ? 'шалгалт' : 'checks'}</span>
        </div>
        <div className="hc-bar" aria-hidden="true">
          {(['ok','warn','fail'] as Status[]).map(s => d.counts[s] > 0 && (
            <span key={s} className={`seg ${s}`} style={{ flex: d.counts[s] }} />
          ))}
        </div>
      </div>

      <div className="grid g2">
        {d.groups.map(g => {
          const worst: Status = g.checks.some(c => c.status === 'fail') ? 'fail'
            : g.checks.some(c => c.status === 'warn') ? 'warn' : 'ok';
          return (
            <div key={g.key} className="card hc-card">
              <div className="hc-head">
                <span className={`hc-ico ${worst}`}><Icon name={GROUP_ICON[g.key] || 'settings'} size={16} /></span>
                <h2 className="mb0">{mn ? g.title_mn : g.title_en}</h2>
                <span className={`chip ${worst === 'ok' ? 'green' : worst === 'warn' ? 'amber' : 'red'}`}>
                  {worst === 'ok' ? (mn ? 'Хэвийн' : 'Healthy') : worst === 'warn' ? (mn ? 'Анхаар' : 'Warning') : (mn ? 'Алдаа' : 'Failing')}
                </span>
              </div>
              {!g.checks.length && <div className="hc-empty">{mn ? 'Шалгалт байхгүй' : 'No checks'}</div>}
              <ul className="hc-list">
                {g.checks.map(c => (
                  <li key={c.key} className={c.status}>
                    <span className={`hc-dot ${c.status}`} />
                    <div className="hc-l">
                      <div className="hc-name">{label(c)}</div>
                      {detail(c) && <div className="hc-detail">{detail(c)}</div>}
                    </div>
                    <div className="hc-val">{c.value ?? '—'}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
