import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../../api';
import { useLang } from '../../i18n';
import { Card, DataTable, StatusChip, Spinner } from '../../ui';

export default function AdmSuppliers() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState('');
  const [residency, setResidency] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cats, setCats] = useState<any[]>([]);

  const load = () => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (residency) p.set('residency', residency);
    if (search) p.set('search', search);
    if (category) p.set('category', category);
    get(`/suppliers?${p}`).then(setRows);
  };
  useEffect(() => { get('/admin/masterdata').then(d => setCats(d.categories)); }, []);
  useEffect(() => { load(); }, [status, residency, category]);

  return (
    <>
      <h1>{t('nav_suppliers')}</h1>
      <div className="row mb16">
        <select style={{ maxWidth: 200 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('all')} ({t('status')})</option>
          {['draft', 'submitted', 'under_review', 'needs_correction', 'approved', 'rejected', 'suspended', 'blacklisted'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ maxWidth: 160 }} value={residency} onChange={e => setResidency(e.target.value)}>
          <option value="">{t('all')}</option>
          <option value="national">{t('res_national')}</option>
          <option value="international">{t('res_international')}</option>
        </select>
        <select style={{ maxWidth: 240 }} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">{t('categories')}: {t('all')}</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.code} · {lang === 'en' ? (c.name_en || c.name_mn) : c.name_mn}</option>)}
        </select>
        <input placeholder={`${t('search')} (нэр, регистр, vendor №)`} style={{ maxWidth: 280 }} value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        <button className="btn sec sm" onClick={load}>{t('search')}</button>
      </div>
      {!rows ? <Spinner /> : (
        <Card tight>
          <DataTable rows={rows} onRow={r => nav(`/admin/suppliers/${r.id}`)} cols={[
            { key: 'id', label: 'ID' },
            { key: 'name_mn', label: t('name'), render: r => <><div className="bold">{r.name_mn}</div><div className="mut">{r.name_en}</div></> },
            { key: 'registry_no', label: t('registry_no') },
            { key: 'vendor_no', label: 'Vendor' },
            { key: 'residency', label: lang === 'mn' ? 'Харьяалал' : 'Residency', render: r => r.residency === 'national' ? t('res_national') : t('res_international') },
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'khur_verified', label: 'ХУР', render: r => r.khur_verified ? '✓' : '—' },
            { key: 'risk_level', label: t('risk'), render: r => <span className={`chip ${r.risk_level === 'high' ? 'red' : r.risk_level === 'medium' ? 'amber' : 'green'}`}>{r.risk_level}</span> },
            { key: 'category_codes', label: t('categories'), render: r => r.category_codes ? <span className="mut">{r.category_codes}</span> : '—' },
            { key: 'completion_percent', label: '%', num: true, render: r => `${r.completion_percent}%` },
            { key: 'submitted_bids', label: lang === 'mn' ? 'Саналууд' : 'Bids', num: true },
            { key: 'primary_contact', label: lang === 'mn' ? 'Холбоо барих' : 'Contact' },
          ]} />
        </Card>
      )}
    </>
  );
}
