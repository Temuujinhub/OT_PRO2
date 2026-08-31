import React, { useEffect, useState } from 'react';
import { get, post, put, del } from '../../api';
import { useLang } from '../../i18n';
import { Card, Tabs, DataTable, Spinner, useToast, Field } from '../../ui';

export default function AdmMasterData() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [tab, setTab] = useState('categories');
  const [md, setMd] = useState<any>(null);
  const [settings, setSettings] = useState<any[]>([]);
  const [f, setF] = useState<any>({});

  const load = () => { get('/admin/masterdata').then(setMd); get('/admin/settings').then(setSettings); };
  useEffect(() => { load(); }, []);
  if (!md) return <Spinner />;

  const save = async (path: string, body: any) => {
    try { await post(path, body); toast(t('saved'), 'ok'); setF({}); load(); }
    catch (e: any) { toast(e.code, 'err'); }
  };

  return (
    <>
      <h1>{t('nav_masterdata')}</h1>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'categories', label: 'SECT / ' + t('categories') },
        { key: 'uom', label: 'UOM' },
        { key: 'manufacturers', label: t('manufacturer') },
        { key: 'rates', label: lang === 'mn' ? 'Ханш' : 'FX rates' },
        { key: 'settings', label: lang === 'mn' ? 'Тохиргоо' : 'Settings' },
        { key: 'khur', label: 'ХУР registry' },
      ]} />

      {tab === 'categories' && (
        <Card right={
          <div className="row">
            <input placeholder="SECT-11" style={{ width: 100 }} value={f.code || ''} onChange={e => setF({ ...f, code: e.target.value })} />
            <input placeholder={t('name') + ' МН'} value={f.name_mn || ''} onChange={e => setF({ ...f, name_mn: e.target.value })} />
            <input placeholder="EN" value={f.name_en || ''} onChange={e => setF({ ...f, name_en: e.target.value })} />
            <button className="btn sm" onClick={() => save('/admin/masterdata/categories', f)}>+</button>
          </div>}>
          <DataTable rows={md.categories} cols={[
            { key: 'code', label: 'Code' }, { key: 'name_mn', label: 'МН' }, { key: 'name_en', label: 'EN' },
            { key: 'x', label: '', render: r => <button className="btn ghost sm" onClick={async () => { await del(`/admin/masterdata/categories/${r.id}`); load(); }}>🗑</button> },
          ]} />
        </Card>
      )}

      {tab === 'uom' && (
        <Card right={
          <div className="row">
            <input placeholder="PCS" style={{ width: 80 }} value={f.code || ''} onChange={e => setF({ ...f, code: e.target.value })} />
            <input placeholder="МН" value={f.name_mn || ''} onChange={e => setF({ ...f, name_mn: e.target.value })} />
            <button className="btn sm" onClick={() => save('/admin/masterdata/uoms', f)}>+</button>
          </div>}>
          <DataTable rows={md.uoms.map((u: any, i: number) => ({ ...u, id: i }))} cols={[
            { key: 'code', label: 'Code' }, { key: 'name_mn', label: 'МН' }, { key: 'name_en', label: 'EN' },
          ]} />
        </Card>
      )}

      {tab === 'manufacturers' && (
        <Card right={
          <div className="row">
            <input placeholder={t('name')} value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} />
            <input placeholder="Country" style={{ width: 90 }} value={f.country || ''} onChange={e => setF({ ...f, country: e.target.value })} />
            <button className="btn sm" onClick={() => save('/admin/masterdata/manufacturers', f)}>+</button>
          </div>}>
          <DataTable rows={md.manufacturers} cols={[
            { key: 'name', label: t('name') }, { key: 'country', label: 'Country' },
          ]} />
        </Card>
      )}

      {tab === 'rates' && (
        <Card right={
          <div className="row">
            <input placeholder="USD" style={{ width: 70 }} value={f.base_currency || ''} onChange={e => setF({ ...f, base_currency: e.target.value })} />
            <span>→</span>
            <input placeholder="MNT" style={{ width: 70 }} value={f.quote_currency || 'MNT'} onChange={e => setF({ ...f, quote_currency: e.target.value })} />
            <input placeholder="3450.5" type="number" style={{ width: 110 }} value={f.rate || ''} onChange={e => setF({ ...f, rate: e.target.value })} />
            <button className="btn sm" onClick={() => save('/admin/masterdata/rates', f)}>+</button>
          </div>}>
          <p className="mut">{lang === 'mn' ? 'Ханшийн snapshot — тооцоололд ашигласан ханш огноогоор хадгалагдана (DEF-01 хяналт).' : 'FX snapshots — conversions store the rate and date used (DEF-01 control).'}</p>
          <DataTable rows={md.rates} cols={[
            { key: 'base_currency', label: 'Base' }, { key: 'quote_currency', label: 'Quote' },
            { key: 'rate', label: lang === 'mn' ? 'Ханш' : 'Rate', num: true, render: r => Number(r.rate).toLocaleString() },
            { key: 'rate_date', label: t('date'), render: r => String(r.rate_date).slice(0, 10) },
            { key: 'source', label: 'Source' },
          ]} />
        </Card>
      )}

      {tab === 'settings' && (
        <Card>
          {settings.map(s => (
            <div key={s.key} className="row" style={{ marginBottom: 8 }}>
              <span style={{ width: 280 }} className="bold">{s.key}</span>
              <input style={{ maxWidth: 240 }} defaultValue={s.value} onBlur={async e => {
                if (e.target.value !== s.value) { await put(`/admin/settings/${s.key}`, { value: e.target.value }); toast(t('saved'), 'ok'); }
              }} />
              <span className="mut">{s.description}</span>
            </div>
          ))}
        </Card>
      )}

      {tab === 'khur' && <KhurTab t={t} toast={toast} />}
    </>
  );
}

function KhurTab({ t, toast }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState<any>({});
  const load = () => get('/admin/khur').then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <Card title="ХУР/ДАН mock registry" right={
      <div className="row">
        <input placeholder={t('registry_no')} style={{ width: 110 }} value={f.registry_no || ''} onChange={e => setF({ ...f, registry_no: e.target.value })} />
        <input placeholder={t('name') + ' МН'} value={f.name_mn || ''} onChange={e => setF({ ...f, name_mn: e.target.value })} />
        <button className="btn sm" onClick={async () => { await post('/admin/khur', f); toast(t('saved'), 'ok'); setF({}); load(); }}>+</button>
      </div>}>
      <DataTable rows={rows.map((r, i) => ({ ...r, id: i }))} cols={[
        { key: 'registry_no', label: t('registry_no') }, { key: 'name_mn', label: 'МН' },
        { key: 'name_en', label: 'EN' }, { key: 'legal_form', label: 'Хэлбэр' },
        { key: 'director', label: 'Захирал' }, { key: 'address', label: t('address') },
      ]} />
    </Card>
  );
}
