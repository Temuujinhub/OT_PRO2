import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Card, DataTable, StatusChip, Spinner, Tabs, useToast } from '../../ui';

export default function AdmQualQueue() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState('queue');
  const [rows, setRows] = useState<any[] | null>(null);
  const [crs, setCrs] = useState<any[]>([]);

  const load = () => {
    const p = tab === 'queue' ? '' : `?status=${tab}`;
    get(`/qualification/queue${p}`).then(setRows);
    get('/suppliers/change-requests').then(setCrs).catch(() => {});
  };
  useEffect(() => { setRows(null); load(); }, [tab]);

  return (
    <>
      <h1>{t('nav_qual_queue')}</h1>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'queue', label: t('pending_review') },
        { key: 'approved', label: t('approve') + 'd' },
        { key: 'needs_improvement', label: t('needs_improvement') || 'Needs improvement' },
        { key: 'rejected', label: t('reject') + 'ed' },
      ]} />
      {!rows ? <Spinner /> : (
        <Card tight>
          <DataTable rows={rows} onRow={r => nav(`/admin/qualification/${r.id}`)} cols={[
            { key: 'id', label: 'ID' },
            { key: 'org_name', label: t('nav_suppliers'), render: r => <><div className="bold">{r.org_name}</div><div className="mut">{r.registry_no}</div></> },
            { key: 'program_name', label: lang === 'mn' ? 'Хөтөлбөр' : 'Program' },
            { key: 'version_no', label: 'v' },
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'risk_score', label: t('risk'), num: true },
            { key: 'submitted_at', label: t('date'), render: r => fmtDate(r.submitted_at, true) },
          ]} />
        </Card>
      )}
      {crs.length > 0 && (
        <Card title={lang === 'mn' ? 'Профайлын өөрчлөлтийн хүсэлтүүд' : 'Profile change requests'}>
          {crs.map(cr => (
            <div key={cr.id} className="row between" style={{ marginBottom: 8 }}>
              <span className="bold">{cr.name_mn} <span className="mut">#{cr.id} · {fmtDate(cr.created_at)}</span></span>
              <div className="row">
                <button className="btn sm" onClick={async () => { await post(`/suppliers/change-requests/${cr.id}/decide`, { decision: 'approve' }); toast('✓', 'ok'); load(); }}>{t('approve')}</button>
                <button className="btn sec sm" onClick={async () => { await post(`/suppliers/change-requests/${cr.id}/decide`, { decision: 'reject', reason: 'declined' }); load(); }}>{t('reject')}</button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
