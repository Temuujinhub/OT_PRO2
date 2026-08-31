import React, { useEffect, useState } from 'react';
import { get, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Card, Spinner, DataTable } from '../../ui';

export default function AdmAudit() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState<any>({});

  const load = () => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && p.set(k, String(v)));
    get(`/reports/audit?${p}`).then(setRows);
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <h1>{t('nav_audit')}</h1>
      <p className="mut mb16">{lang === 'mn' ? 'Append-only аудит лог — устгах эрх ямар ч role-д байхгүй.' : 'Append-only audit log — no role can delete entries.'}</p>
      <div className="row mb16">
        <select style={{ maxWidth: 180 }} value={f.entity_type || ''} onChange={e => setF({ ...f, entity_type: e.target.value })}>
          <option value="">{t('all')} (entity)</option>
          {['user', 'organization', 'tender', 'bid', 'approval', 'award', 'qualification', 'dd_case', 'attachment', 'report', 'setting'].map(x => <option key={x}>{x}</option>)}
        </select>
        <input placeholder="action" style={{ maxWidth: 160 }} value={f.action || ''} onChange={e => setF({ ...f, action: e.target.value })} />
        <input placeholder="actor" style={{ maxWidth: 160 }} value={f.actor || ''} onChange={e => setF({ ...f, actor: e.target.value })} />
        <input type="date" style={{ maxWidth: 150 }} value={f.from || ''} onChange={e => setF({ ...f, from: e.target.value })} />
        <input type="date" style={{ maxWidth: 150 }} value={f.to || ''} onChange={e => setF({ ...f, to: e.target.value })} />
        <button className="btn sm" onClick={load}>{t('search')}</button>
      </div>
      {!rows ? <Spinner /> : (
        <Card tight>
          <DataTable rows={rows} cols={[
            { key: 'occurred_at', label: t('date'), render: r => fmtDate(r.occurred_at, true) },
            { key: 'actor_name', label: 'Actor' },
            { key: 'action', label: 'Action', render: r => <span className="chip gray">{r.action}</span> },
            { key: 'entity_type', label: 'Entity', render: r => `${r.entity_type} #${r.entity_id || ''}` },
            { key: 'reason', label: t('reason') },
            { key: 'before_summary', label: 'Before' },
            { key: 'after_summary', label: 'After' },
            { key: 'ip', label: 'IP' },
          ]} />
        </Card>
      )}
    </>
  );
}
