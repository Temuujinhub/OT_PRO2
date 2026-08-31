import React, { useEffect, useState } from 'react';
import { get, put, post, fmtDate } from '../../api';
import { useLang, useL } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Spinner, useToast, Field, DataTable, Modal } from '../../ui';

const CAT_META: Record<string, { icon: string; color: string; mn: string; en: string }> = {
  government: { icon: '🏛', color: 'var(--blue)', mn: 'Төрийн систем', en: 'Government' },
  erp: { icon: '🏭', color: 'var(--purple)', mn: 'ERP / Худалдан авалт', en: 'ERP / Procurement' },
  messaging: { icon: '✉️', color: 'var(--teal)', mn: 'Мэдэгдэл, илгээмж', en: 'Messaging' },
  ai: { icon: '🤖', color: 'var(--orange)', mn: 'Хиймэл оюун', en: 'AI' },
  data: { icon: '🗄', color: 'var(--ink-soft)', mn: 'Өгөгдөл sync', en: 'Data sync' },
};

export default function AdmIntegrations() {
  const { t, lang } = useLang();
  const L = useL();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const isAdmin = user.role === 'SystemAdmin';

  const load = () => {
    get('/admin/integrations').then(setRows);
    get(`/admin/integrations/logs${logFilter ? `?code=${logFilter}` : ''}`).then(setLogs);
  };
  useEffect(() => { load(); }, [logFilter]);
  if (!rows) return <Spinner />;

  const toggle = async (r: any) => {
    if (!isAdmin) return toast('SystemAdmin эрх шаардлагатай / SystemAdmin required', 'err');
    await put(`/admin/integrations/${r.code}`, { enabled: !r.enabled });
    toast(t('saved'), 'ok'); load();
  };

  const test = async (code: string) => {
    setTesting(code);
    try {
      const r = await post(`/admin/integrations/${code}/test`);
      toast(`${r.status === 'success' ? '✅' : '❌'} ${r.message}`, r.status === 'success' ? 'ok' : 'err');
    } catch (e: any) { toast(e.code || t('error'), 'err'); }
    finally { setTesting(null); load(); }
  };

  const saveEdit = async () => {
    const body: any = {
      endpoint: edit.endpoint, username: edit.username,
      sync_interval_min: edit.sync_interval_min ? Number(edit.sync_interval_min) : null,
    };
    if (edit.newApiKey) body.api_key = edit.newApiKey;
    await put(`/admin/integrations/${edit.code}`, body);
    toast(t('saved'), 'ok'); setEdit(null); load();
  };

  const cats = [...new Set(rows.map(r => r.category))];

  return (
    <>
      <h1>{t('nav_integrations')}</h1>
      <p className="mut mb16">{lang === 'mn'
        ? 'ХУР/ДАН, SAP/PNow, MSSQL sync, имэйл, AI зэрэг гадаад системүүдийн холболтын тохиргоо. Түлхүүр утгууд далдлагдаж хадгалагдана, өөрчлөлт бүр аудит логт бүртгэгдэнэ.'
        : 'External system connections: KHUR/DAN, SAP/PNow, MSSQL sync, email, AI. Keys are stored masked; every change is audited.'}</p>

      {cats.map(cat => (
        <div key={cat}>
          <h2 style={{ margin: '18px 0 10px' }}>{CAT_META[cat]?.icon} {lang === 'mn' ? CAT_META[cat]?.mn : CAT_META[cat]?.en}</h2>
          <div className="grid g2">
            {rows.filter(r => r.category === cat).map(r => (
              <Card key={r.code} className="mb0">
                <div className="row between">
                  <div className="row">
                    <div className="ic" style={{ background: CAT_META[cat]?.color, width: 38, height: 38, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, color: '#fff' }}>
                      {CAT_META[cat]?.icon}
                    </div>
                    <div>
                      <div className="bold">{L(r, 'name')}</div>
                      <div className="mut">{r.code}</div>
                    </div>
                  </div>
                  <label className="checkbox" style={{ cursor: isAdmin ? 'pointer' : 'default' }}>
                    <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} disabled={!isAdmin} />
                    <span className={`chip ${r.enabled ? 'green' : 'gray'}`}>{r.enabled ? t('enabled') : t('disabled_st')}</span>
                  </label>
                </div>
                <table className="tbl" style={{ marginTop: 10 }}><tbody>
                  <tr><td className="mut" style={{ width: 120 }}>{t('endpoint')}</td><td style={{ wordBreak: 'break-all' }}>{r.endpoint || '—'}</td></tr>
                  <tr><td className="mut">{lang === 'mn' ? 'Хэрэглэгч' : 'Username'}</td><td>{r.username || '—'}</td></tr>
                  <tr><td className="mut">{t('api_key')}</td><td>{r.api_key_masked || (r.code === 'ANTHROPIC' ? '(env: ANTHROPIC_API_KEY ✓)' : '—')}</td></tr>
                  {r.sync_interval_min && <tr><td className="mut">{t('sync_interval')}</td><td>{r.sync_interval_min}</td></tr>}
                  <tr><td className="mut">{t('last_test')}</td><td>
                    {r.last_test_at ? (
                      <span className={`chip ${r.last_test_status === 'success' ? 'green' : 'red'}`}>
                        {r.last_test_status === 'success' ? '✓' : '✗'} {fmtDate(r.last_test_at, true)}
                      </span>
                    ) : '—'}
                  </td></tr>
                </tbody></table>
                {r.last_test_message && <div className="mut" style={{ marginTop: 6, fontSize: 12 }}>{r.last_test_message}</div>}
                <div className="row end" style={{ marginTop: 10 }}>
                  {isAdmin && <button className="btn sec sm" onClick={() => setEdit({ ...r, newApiKey: '' })}>{t('edit')}</button>}
                  <button className="btn teal sm" disabled={testing === r.code} onClick={() => test(r.code)}>
                    {testing === r.code ? t('generating') : `⚡ ${t('test_connection')}`}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <h2 style={{ margin: '22px 0 10px' }}>📜 {t('integration_logs')}</h2>
      <div className="row mb16">
        <button className={`btn sm ${logFilter === '' ? '' : 'sec'}`} onClick={() => setLogFilter('')}>{t('all')}</button>
        {rows.map(r => (
          <button key={r.code} className={`btn sm ${logFilter === r.code ? '' : 'sec'}`} onClick={() => setLogFilter(r.code)}>{r.code}</button>
        ))}
      </div>
      <Card tight>
        <DataTable rows={logs} cols={[
          { key: 'created_at', label: t('date'), render: r => fmtDate(r.created_at, true) },
          { key: 'code', label: lang === 'mn' ? 'Систем' : 'System', render: r => <span className="chip blue">{r.code}</span> },
          { key: 'direction', label: '⇅', render: r => r.direction === 'in' ? '⬇ in' : '⬆ out' },
          { key: 'action', label: 'Action' },
          { key: 'status', label: t('status'), render: r => <span className={`chip ${r.status === 'success' ? 'green' : 'red'}`}>{r.status}</span> },
          { key: 'detail', label: t('details') },
          { key: 'duration_ms', label: 'ms', num: true },
        ]} />
      </Card>

      {edit && (
        <Modal title={`${t('edit')}: ${L(edit, 'name')}`} onClose={() => setEdit(null)}>
          <Field label={t('endpoint')}>
            <input value={edit.endpoint || ''} onChange={e => setEdit({ ...edit, endpoint: e.target.value })} />
          </Field>
          <Field label={lang === 'mn' ? 'Хэрэглэгч / Service account' : 'Username / service account'}>
            <input value={edit.username || ''} onChange={e => setEdit({ ...edit, username: e.target.value })} />
          </Field>
          <Field label={t('api_key')} hint={lang === 'mn' ? 'Хоосон үлдээвэл одоогийн түлхүүр хадгалагдана' : 'Leave empty to keep current key'}>
            <input type="password" placeholder={edit.api_key_masked || '••••••'} value={edit.newApiKey}
              onChange={e => setEdit({ ...edit, newApiKey: e.target.value })} />
          </Field>
          <Field label={t('sync_interval')}>
            <input type="number" value={edit.sync_interval_min || ''} onChange={e => setEdit({ ...edit, sync_interval_min: e.target.value })} />
          </Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setEdit(null)}>{t('cancel')}</button>
            <button className="btn" onClick={saveEdit}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
