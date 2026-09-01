import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Card, DataTable, StatusChip, Spinner } from '../../ui';

export default function AdmTenders() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [types, setTypes] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [overdue, setOverdue] = useState(false);

  const load = () => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (type) p.set('type', type);
    if (search) p.set('search', search);
    if (overdue) p.set('overdue', 'true');
    get(`/tenders?${p}`).then(setRows);
  };
  useEffect(() => { get('/tenders/types').then(setTypes); }, []);
  useEffect(() => { load(); }, [status, type, overdue]);

  return (
    <>
      <div className="row between mb16">
        <h1>{t('nav_tender_mgmt')}</h1>
        <button className="btn" onClick={() => nav('/admin/tenders/new')}>+ {t('create_tender')}</button>
      </div>
      <div className="filters mb16">
        <select style={{ maxWidth: 190 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('all')} ({t('status')})</option>
          {['draft', 'pending_approval', 'published', 'closed', 'in_evaluation', 'negotiation', 'award_pending', 'awarded', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ maxWidth: 150 }} value={type} onChange={e => setType(e.target.value)}>
          <option value="">{t('all')} ({t('type')})</option>
          {types.map(tt => <option key={tt.code} value={tt.code}>{tt.code}</option>)}
        </select>
        <label className="checkbox"><input type="checkbox" checked={overdue} onChange={e => setOverdue(e.target.checked)} /> {t('overdue')}</label>
        <input placeholder={t('search')} style={{ maxWidth: 220 }} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
      </div>
      {!rows ? <Spinner /> : (
        <Card tight>
          <DataTable rows={rows} onRow={r => nav(`/admin/tenders/${r.id}`)} cols={[
            { key: 'tender_no', label: t('tender_no'), render: r => <span className="bold">{r.tender_no}</span> },
            { key: 'title_mn', label: t('title') },
            { key: 'type_code', label: t('type'), render: r => <span className="chip blue">{r.type_code}</span> },
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'responded', label: lang === 'mn' ? 'Хариу/Урьсан' : 'Resp/Invited', render: r => `${r.responded}/${r.invited}` },
            { key: 'buyer_name', label: 'Buyer' },
            { key: 'current_approver', label: t('current_approver'), render: r => r.current_approver
              ? <span className={`chip ${r.approver_overdue_hours > 0 ? 'red' : 'blue'}`}>{r.current_approver}{r.approver_overdue_hours > 0 ? ` +${r.approver_overdue_hours}h` : ''}</span> : '—' },
            { key: 'close_at', label: t('closes'), render: r => fmtDate(r.close_at, true), sortVal: r => r.close_at },
          ]} />
        </Card>
      )}
    </>
  );
}
