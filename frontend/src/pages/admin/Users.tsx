import React, { useEffect, useState } from 'react';
import { get, post, put, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Card, Tabs, DataTable, StatusChip, Spinner, useToast, Modal, Field } from '../../ui';

const ROLES = ['SystemAdmin', 'Buyer', 'EndUser', 'Compliance', 'Screening', 'DDAnalyst', 'Approver', 'AwardOfficer', 'Support', 'ContentAdmin', 'Auditor'];

export default function AdmUsers() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [tab, setTab] = useState('internal');
  const [rows, setRows] = useState<any[] | null>(null);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>({ role: 'Buyer' });

  const load = () => get(`/admin/users?type=${tab}`).then(setRows);
  useEffect(() => { setRows(null); load(); }, [tab]);

  return (
    <>
      <div className="row between mb16">
        <h1>{t('nav_users')}</h1>
        {tab === 'internal' && <button className="btn" onClick={() => { setF({ role: 'Buyer' }); setEdit(null); setModal(true); }}>+ {t('add')}</button>}
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'internal', label: lang === 'mn' ? 'Дотоод хэрэглэгч' : 'Internal users' },
        { key: 'supplier', label: lang === 'mn' ? 'Нийлүүлэгчийн хэрэглэгч' : 'Supplier users' },
      ]} />
      {!rows ? <Spinner /> : (
        <Card tight>
          <DataTable rows={rows} onRow={tab === 'internal' ? (r => { setEdit(r); setF(r); setModal(true); }) : undefined} cols={[
            { key: 'display_name', label: t('name'), render: r => <span className="bold">{r.display_name}</span> },
            { key: 'email', label: t('email') },
            { key: 'role', label: 'Role', render: r => <span className="chip purple">{r.role}</span> },
            ...(tab === 'supplier' ? [{ key: 'org_name', label: t('nav_suppliers') }] : [
              { key: 'department', label: lang === 'mn' ? 'Хэлтэс' : 'Dept' },
              { key: 'approval_limit', label: 'DFA limit', num: true, render: (r: any) => r.approval_limit ? Number(r.approval_limit).toLocaleString() : '—' },
            ]),
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'mfa_enabled', label: '2FA', render: r => r.mfa_enabled ? '✓' : '—' },
            { key: 'last_login_at', label: lang === 'mn' ? 'Сүүлд нэвтэрсэн' : 'Last login', render: r => fmtDate(r.last_login_at, true) },
            { key: 'act', label: '', render: r => r.status === 'locked' && (
              <button className="btn sm" onClick={async e => { e.stopPropagation(); await post(`/admin/users/${r.id}/unlock`); toast('✓', 'ok'); load(); }}>🔓</button>
            ) },
          ]} />
        </Card>
      )}

      {modal && (
        <Modal title={edit ? t('edit') : t('add')} onClose={() => setModal(false)}>
          <Field label={t('email')} required><input value={f.email || ''} disabled={!!edit} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={t('name')} required><input value={f.display_name || ''} onChange={e => setF({ ...f, display_name: e.target.value })} /></Field>
          <div className="grid g2">
            <Field label="Role">
              <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={lang === 'mn' ? 'Хэлтэс' : 'Department'}><input value={f.department || ''} onChange={e => setF({ ...f, department: e.target.value })} /></Field>
          </div>
          <div className="grid g2">
            <Field label={t('position')}><input value={f.position || ''} onChange={e => setF({ ...f, position: e.target.value })} /></Field>
            <Field label="DFA limit (MNT)"><input type="number" value={f.approval_limit || ''} onChange={e => setF({ ...f, approval_limit: e.target.value ? Number(e.target.value) : null })} /></Field>
          </div>
          {edit && (
            <Field label={t('status')}>
              <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
                {['active', 'locked', 'disabled'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}
          <div className="actions">
            {edit && <button className="btn sec" onClick={async () => {
              const r = await post(`/admin/users/${edit.id}/reset-password`);
              toast(`${lang === 'mn' ? 'Шинэ нууц үг' : 'New password'}: ${r.newPassword}`, 'ok');
            }}>🔑 Reset PW</button>}
            <button className="btn sec" onClick={() => setModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!f.email || !f.display_name} onClick={async () => {
              try {
                if (edit) await put(`/admin/users/${edit.id}`, f);
                else {
                  const r = await post('/admin/users', f);
                  if (r.initialPassword) toast(`${lang === 'mn' ? 'Анхны нууц үг' : 'Initial password'}: ${r.initialPassword}`, 'ok');
                }
                setModal(false); load(); toast(t('saved'), 'ok');
              } catch (e: any) { toast(e.code, 'err'); }
            }}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
