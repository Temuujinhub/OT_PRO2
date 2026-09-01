import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useLang } from './i18n';
import { blobUrl } from './api';
import { Icon } from './icons';

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
    <div className="card mb0 stat-card">
      <div className="stat">
        <div className="ic" style={color ? { color } : undefined}><Icon name={icon} size={20} /></div>
        <div style={{ minWidth: 0 }}>
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

/**
 * Field — canonical form-control anatomy.
 *   1. Label      (13px / 600, always visible — never a placeholder-only field)
 *   2. Control    (children)
 *   3. Hint       (12px muted — what the user must enter)
 *   4. Error      (12px danger — replaces the hint when validation fails)
 */
const RISK_MN: Record<string, string> = { low: 'Бага', medium: 'Дунд', high: 'Өндөр', critical: 'Онцгой' };
export function RiskChip({ r }: { r: string }) {
  const { lang } = useLang();
  if (!r) return <span className="chip gray">—</span>;
  const c = r === 'critical' || r === 'high' ? 'red' : r === 'medium' ? 'amber' : 'green';
  return <span className={`chip ${c}`}>{lang === 'mn' ? (RISK_MN[r] || r) : r[0].toUpperCase() + r.slice(1)}</span>;
}

export function Field({ label, required, hint, error, htmlFor, children }: any) {
  return (
    <div className="field">
      {label && (
        <label htmlFor={htmlFor}>
          {label}{required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? <div className="err" role="alert">{error}</div> : (hint && <div className="hint">{hint}</div>)}
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

export function Empty({ text }: any) {
  const { t } = useLang();
  return (
    <div className="empty">
      <svg className="empty-ico" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="6.5" y="9.5" width="27" height="21" rx="3" />
        <path d="M6.5 20.5h7l2 3.5h9l2-3.5h7" strokeLinejoin="round" />
      </svg>
      <div>{text || t('none_yet')}</div>
    </div>
  );
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

function SortCaret({ dir }: { dir: 1 | -1 | 0 }) {
  return (
    <svg className={`sort-caret ${dir ? 'on' : ''}`} width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
      <path d="M5 1.5 8 5H2z" fill="currentColor" opacity={dir === 1 ? 1 : dir === 0 ? .32 : .16} />
      <path d="M5 10.5 2 7h6z"  fill="currentColor" opacity={dir === -1 ? 1 : dir === 0 ? .32 : .16} />
    </svg>
  );
}

// sortable data table
export function DataTable({ cols, rows, onRow, empty }: {
  cols: { key: string; label: string; render?: (r: any) => any; num?: boolean; wrap?: boolean; w?: number; sortVal?: (r: any) => any }[];
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
        <colgroup>{cols.map(c => <col key={c.key} style={c.w ? { width: c.w, minWidth: c.w } : undefined} />)}</colgroup>
        <thead><tr>
          {cols.map(c => (
            <th key={c.key} className={c.num ? 'num' : ''} scope="col"
              aria-sort={sort?.k === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
              onClick={() => setSort(s => s?.k === c.key ? { k: c.key, dir: s.dir === 1 ? -1 : 1 } : { k: c.key, dir: 1 })}>
              <span className="th-in">{c.label}<SortCaret dir={sort?.k === c.key ? sort.dir : 0} /></span>
            </th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id ?? i} className={onRow ? 'click' : ''} onClick={() => onRow?.(r)}>
              {cols.map(c => (
                <td key={c.key} className={`${c.num ? 'num' : ''}${c.wrap ? ' wrap' : ''}`}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
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

// ---------------- File upload ----------------
const FILE_KINDS: Record<string, { label: string; cls: string }> = {
  pdf:  { label: 'PDF',  cls: 'ft-pdf' },
  xlsx: { label: 'XLS',  cls: 'ft-xls' }, xls: { label: 'XLS', cls: 'ft-xls' }, csv: { label: 'CSV', cls: 'ft-xls' },
  docx: { label: 'DOC',  cls: 'ft-doc' }, doc: { label: 'DOC', cls: 'ft-doc' },
  png:  { label: 'PNG',  cls: 'ft-img' }, jpg: { label: 'JPG', cls: 'ft-img' },
  jpeg: { label: 'JPG',  cls: 'ft-img' }, webp: { label: 'IMG', cls: 'ft-img' },
  zip:  { label: 'ZIP',  cls: 'ft-zip' },
};
export function fileKind(name: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return FILE_KINDS[ext] || { label: ext.slice(0, 4).toUpperCase() || 'FILE', cls: 'ft-any' };
}
export function fmtBytes(b: number) {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
export function FileBadge({ name }: { name: string }) {
  const k = fileKind(name);
  return <span className={`ft ${k.cls}`}>{k.label}</span>;
}

/**
 * FileDrop — drag & drop upload zone.
 *  · accept  e.g. ".pdf,.xlsx"   · maxMb  size guard (default 10)
 *  · onFile(file)  → return a Promise to get the progress/complete states
 * Shows the file type badge, size, an indeterminate progress bar while the
 * promise is pending, and a clear error line if validation or upload fails.
 */
export function FileDrop({ accept, maxMb = 10, onFile, value, onClear, disabled, hint }: {
  accept?: string; maxMb?: number; onFile: (f: File) => Promise<any> | void;
  value?: { name: string; size?: number } | null; onClear?: () => void; disabled?: boolean; hint?: string;
}) {
  const { lang } = useLang();
  const mn = lang === 'mn';
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handle = async (f?: File | null) => {
    if (!f || disabled) return;
    setErr('');
    const exts = (accept || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (exts.length) {
      const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
      if (!exts.includes(ext)) {
        setErr(mn ? `Зөвхөн ${exts.join(', ')} өргөтгөлтэй файл` : `Only ${exts.join(', ')} files`); return;
      }
    }
    if (f.size > maxMb * 1048576) {
      setErr(mn ? `Файл хэт том — дээд тал нь ${maxMb}MB` : `File too large — max ${maxMb}MB`); return;
    }
    try { setBusy(true); await onFile(f); }
    catch (e: any) { setErr(e?.code || e?.message || (mn ? 'Хуулж чадсангүй' : 'Upload failed')); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  if (value) {
    return (
      <div className="filedrop-done">
        <FileBadge name={value.name} />
        <div className="fd-info">
          <div className="fd-name" title={value.name}>{value.name}</div>
          {value.size !== undefined && <div className="fd-size">{fmtBytes(value.size)}</div>}
        </div>
        {onClear && !disabled && (
          <button type="button" className="fd-x" onClick={onClear} aria-label={mn ? 'Устгах' : 'Remove'}>✕</button>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className={`filedrop${over ? ' over' : ''}${busy ? ' busy' : ''}${disabled ? ' disabled' : ''}`}
        onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files?.[0]); }}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        role="button" tabIndex={disabled ? -1 : 0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      >
        <svg className="fd-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M12 15.5V4.5" strokeLinecap="round" />
          <path d="m7.8 8.7 4.2-4.2 4.2 4.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 15v3.2A1.8 1.8 0 0 0 5.8 20h12.4a1.8 1.8 0 0 0 1.8-1.8V15" strokeLinecap="round" />
        </svg>
        <div className="fd-text">
          <b>{mn ? 'Файлаа чирж оруулах' : 'Drag a file here'}</b>
          <span>{mn ? 'эсвэл дарж сонгоно уу' : 'or click to browse'}</span>
        </div>
        <div className="fd-rules">{(accept || (mn ? 'бүх төрөл' : 'any type')).toUpperCase()} · max {maxMb}MB</div>
        {busy && <div className="fd-bar"><div /></div>}
        <input ref={inputRef} type="file" accept={accept} disabled={disabled}
          style={{ display: 'none' }} onChange={e => handle(e.target.files?.[0])} />
      </div>
      {err ? <div className="err" role="alert">{err}</div> : (hint && <div className="hint">{hint}</div>)}
    </>
  );
}

/**
 * AuthImg — renders an attachment behind the JWT-protected download route,
 * in a fixed 1:1 frame. Falls back to a neutral placeholder mark when the
 * item has no image, so a catalogue grid never shows ragged holes.
 */
export function AuthImg({ attachmentId, alt, ratio = '1 / 1' }: { attachmentId?: number | null; alt?: string; ratio?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  React.useEffect(() => {
    let dead = false, made: string | null = null;
    if (attachmentId) {
      blobUrl(`/files/${attachmentId}/download`).then(u => {
        if (dead) { if (u) URL.revokeObjectURL(u); return; }
        if (u) { made = u; setUrl(u); } else setFailed(true);
      });
    }
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [attachmentId]);

  return (
    <div className="img-frame" style={{ aspectRatio: ratio }}>
      {url && !failed
        ? <img src={url} alt={alt || ''} onError={() => setFailed(true)} />
        : (
          <svg className="img-ph" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2" />
            <circle cx="8.6" cy="9.6" r="1.5" />
            <path d="m4 16.5 4.6-4.2 3.4 3 3-2.6 4 3.8" strokeLinejoin="round" />
          </svg>
        )}
    </div>
  );
}
