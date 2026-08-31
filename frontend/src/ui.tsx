import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useLang } from './i18n';

// ---------------- Toasts ----------------
const ToastCtx = createContext<{ toast: (msg: string, kind?: 'ok' | 'err' | 'info') => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const toast = useCallback((msg: string, kind: 'ok' | 'err' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setItems(x => [...x, { id, msg, kind }]);
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toast-wrap">
        {items.map(i => <div key={i.id} className={`toast ${i.kind}`}>{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- primitives ----------------
export function Card({ children, title, right, className, tight }: any) {
  return (
    <div className={`card ${tight ? 'tight' : ''} ${className || ''}`}>
      {(title || right) && (
        <div className="row between" style={{ marginBottom: 12, padding: tight ? '14px 16px 0' : 0 }}>
          {title && <h2 className="mb0">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ icon, color, value, label, sub }: any) {
  return (
    <div className="card mb0">
      <div className="stat">
        <div className="ic" style={{ background: color }}>{icon}</div>
        <div>
          <div className="v">{value ?? '—'}</div>
          <div className="l">{label}</div>
          {sub && <div className="l">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'gray', pending_email: 'gray', no_response: 'gray', scheduled: 'gray', new: 'blue',
  submitted: 'blue', under_review: 'blue', screening: 'blue', pending_approval: 'blue', pending: 'blue',
  triaged: 'blue', assigned: 'blue', in_progress: 'blue', waiting: 'amber', validated: 'teal',
  published: 'green', open: 'green', approved: 'green', awarded: 'green', active: 'green', live: 'green',
  resolved: 'green', cleared: 'green', issued: 'green', done: 'green', sent: 'teal', delivered: 'teal',
  opened: 'teal', participated: 'teal', in_evaluation: 'purple', negotiation: 'purple', evaluated: 'purple',
  award_pending: 'purple', cancel_pending: 'amber', needs_correction: 'amber', needs_improvement: 'amber',
  reopened: 'amber', returned: 'amber', conditional: 'amber', expiring: 'amber', paused: 'amber',
  closed: 'gray', ended: 'gray', archived: 'gray', expired: 'gray',
  rejected: 'red', cancelled: 'red', suspended: 'red', blacklisted: 'red', withdrawn: 'red',
  regret: 'red', declined: 'red', locked: 'red', disabled: 'red', blocked: 'red', bounced: 'red',
};
const STATUS_MN: Record<string, string> = {
  draft: 'Ноорог', submitted: 'Илгээсэн', under_review: 'Хянагдаж буй', needs_correction: 'Засвар шаардлагатай',
  approved: 'Батлагдсан', rejected: 'Татгалзсан', suspended: 'Түдгэлзсэн', blacklisted: 'Хар жагсаалт',
  published: 'Нээлттэй', closed: 'Хаагдсан', in_evaluation: 'Үнэлгээнд', negotiation: 'Тохиролцоо',
  award_pending: 'Award хүлээгдэж буй', awarded: 'Awarded', cancelled: 'Цуцлагдсан', pending_approval: 'Зөвшөөрөл хүлээж буй',
  screening: 'Шалгалтад', needs_improvement: 'Сайжруулах', expired: 'Хугацаа дууссан', no_response: 'Хариу өгөөгүй',
  evaluated: 'Үнэлэгдсэн', regret: 'Шалгараагүй', withdrawn: 'Татсан', pending: 'Хүлээгдэж буй',
  live: 'Явагдаж буй', ended: 'Дууссан', open: 'Нээлттэй', resolved: 'Шийдэгдсэн', in_progress: 'Хийгдэж буй',
  new: 'Шинэ', cleared: 'Цэвэр', blocked: 'Хориглосон', decided: 'Шийдвэрлэсэн', active: 'Идэвхтэй',
  sent: 'Илгээсэн', opened: 'Нээсэн', participated: 'Оролцсон', declined: 'Татгалзсан', returned: 'Буцаагдсан',
  issued: 'Олгогдсон', locked: 'Түгжигдсэн', waiting: 'Хүлээж буй', reopened: 'Дахин нээгдсэн',
};

export function StatusChip({ s }: { s: string }) {
  const { lang } = useLang();
  if (!s) return <span className="chip gray">—</span>;
  const color = STATUS_COLORS[s] || 'gray';
  const label = lang === 'mn' ? (STATUS_MN[s] || s) : s.replace(/_/g, ' ');
  return <span className={`chip ${color}`}>{label}</span>;
}

export function Field({ label, required, hint, children }: any) {
  return (
    <div className="field">
      {label && <label>{label} {required && <span className="req">*</span>}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: any) {
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={wide ? { width: 900 } : undefined}>
        <div className="row between"><h3 className="mb0">{title}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon = '📭', text }: any) {
  const { t } = useLang();
  return <div className="empty"><div className="big">{icon}</div>{text || t('none_yet')}</div>;
}

export function Spinner() { return <div className="spinner" />; }

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map(tb => (
        <div key={tb.key} className={`tab ${active === tb.key ? 'active' : ''}`} onClick={() => onChange(tb.key)}>
          {tb.label}{tb.count !== undefined && tb.count > 0 && <span className="cnt">{tb.count}</span>}
        </div>
      ))}
    </div>
  );
}

// sortable data table
export function DataTable({ cols, rows, onRow, empty }: {
  cols: { key: string; label: string; render?: (r: any) => any; num?: boolean; sortVal?: (r: any) => any }[];
  rows: any[]; onRow?: (r: any) => void; empty?: string;
}) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find(c => c.key === sort.k);
    const val = (r: any) => col?.sortVal ? col.sortVal(r) : r[sort.k];
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    });
  }, [rows, sort, cols]);
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr>
          {cols.map(c => (
            <th key={c.key} className={c.num ? 'num' : ''}
              onClick={() => setSort(s => s?.k === c.key ? { k: c.key, dir: s.dir === 1 ? -1 : 1 } : { k: c.key, dir: 1 })}>
              {c.label}{sort?.k === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id ?? i} className={onRow ? 'click' : ''} onClick={() => onRow?.(r)}>
              {cols.map(c => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// SVG donut chart (per Figma dashboard)
export function Donut({ value, total, color = 'var(--orange)', color2 = 'var(--teal)', label, size = 150, segments }: any) {
  const segs = segments || [{ v: value, c: color }, { v: Math.max(0, total - value), c: color2 }];
  const sum = segs.reduce((a: number, s: any) => a + s.v, 0) || 1;
  const R = 42; const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="11" />
        {segs.map((s: any, i: number) => {
          const frac = s.v / sum;
          const el = (
            <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={s.c} strokeWidth="11"
              strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-offset * C}
              transform="rotate(-90 50 50)" strokeLinecap="butt" />
          );
          offset += frac;
          return el;
        })}
        <text x="50" y="48" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--ink)">{value}</text>
        <text x="50" y="62" textAnchor="middle" fontSize="8" fill="var(--ink-soft)">{label}</text>
      </svg>
    </div>
  );
}

export function Progress({ pct }: { pct: number }) {
  return <div className="progress"><div style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}

export function Countdown({ until }: { until: any }) {
  const [, force] = useState(0);
  React.useEffect(() => { const iv = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(iv); }, []);
  if (!until) return <span>—</span>;
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return <span className="chip gray">Хаагдсан / Closed</span>;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  return <span className="countdown">{d > 0 ? `${d}d ` : ''}{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>;
}

export function ConfirmModal({ title, text, onYes, onNo, reasonRequired, danger }: any) {
  const { t } = useLang();
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onNo}>
      <p>{text}</p>
      {reasonRequired && (
        <Field label={t('reason')} required>
          <textarea value={reason} onChange={e => setReason(e.target.value)} />
        </Field>
      )}
      <div className="actions">
        <button className="btn sec" onClick={onNo}>{t('cancel')}</button>
        <button className={`btn ${danger ? 'danger' : ''}`} disabled={reasonRequired && !reason.trim()}
          onClick={() => onYes(reason)}>{t('confirm')}</button>
      </div>
    </Modal>
  );
}
