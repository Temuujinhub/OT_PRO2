import React, { useEffect, useState } from 'react';
import { get, post, del, fmtMoney } from '../../api';
import { useLang } from '../../i18n';
import { Card, Field, Modal, DataTable, Spinner, useToast } from '../../ui';

export default function Catalogue() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [modal, setModal] = useState(false);
  const [f, setF] = useState<any>({});
  const load = () => get('/support/catalogue').then(setRows);
  useEffect(() => { load(); }, []);
  if (!rows) return <Spinner />;
  return (
    <>
      <div className="row between mb16">
        <h1>{t('nav_catalogue')}</h1>
        <button className="btn" onClick={() => { setF({}); setModal(true); }}>+ {t('add')}</button>
      </div>
      <Card tight>
        <DataTable rows={rows} cols={[
          { key: 'name', label: t('name'), render: r => <span className="bold">{r.name}</span> },
          { key: 'manufacturer', label: t('manufacturer') },
          { key: 'part_no', label: t('part_no') },
          { key: 'origin_country', label: lang === 'mn' ? 'Гарал үүсэл' : 'Origin' },
          { key: 'unit_price', label: t('unit_price'), num: true, render: r => r.unit_price ? fmtMoney(r.unit_price, r.currency) : '—' },
          { key: 'uom', label: 'UOM' },
          { key: 'x', label: '', render: r => <button className="btn ghost sm" onClick={async e => { e.stopPropagation(); await del(`/support/catalogue/${r.id}`); load(); }}>🗑</button> },
        ]} />
      </Card>
      {modal && (
        <Modal title={t('add')} onClose={() => setModal(false)}>
          <Field label={t('name')} required><input value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid g2">
            <Field label={t('manufacturer')}><input value={f.manufacturer || ''} onChange={e => setF({ ...f, manufacturer: e.target.value })} /></Field>
            <Field label={t('part_no')}><input value={f.part_no || ''} onChange={e => setF({ ...f, part_no: e.target.value })} /></Field>
          </div>
          <div className="grid g3">
            <Field label={t('unit_price')}><input type="number" value={f.unit_price || ''} onChange={e => setF({ ...f, unit_price: e.target.value })} /></Field>
            <Field label={t('currency')}>
              <select value={f.currency || 'MNT'} onChange={e => setF({ ...f, currency: e.target.value })}>
                {['MNT', 'USD', 'EUR', 'CNY'].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="UOM"><input value={f.uom || 'EA'} onChange={e => setF({ ...f, uom: e.target.value })} /></Field>
          </div>
          <Field label={t('comment')}><textarea value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!f.name} onClick={async () => { await post('/support/catalogue', f); setModal(false); load(); toast(t('saved'), 'ok'); }}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
