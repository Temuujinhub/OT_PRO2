import React, { useEffect, useState } from 'react';
import { get, post, del, fmtMoney, uploadFile } from '../../api';
import { useLang } from '../../i18n';
import { Card, Field, Modal, DataTable, Spinner, useToast, AuthImg, FileDrop, Empty } from '../../ui';
import { Icon } from '../../icons';

export default function Catalogue() {
  const { t, lang } = useLang();
  const mn = lang === 'mn';
  const { toast } = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [view, setView] = useState<'grid' | 'table'>(() => (localStorage.getItem('oasis_cat_view') as any) || 'grid');
  const [qs, setQs] = useState('');
  const [modal, setModal] = useState(false);
  const [f, setF] = useState<any>({});
  const [img, setImg] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => get('/support/catalogue').then(setRows);
  useEffect(() => { load(); }, []);
  const setViewP = (v: 'grid' | 'table') => { setView(v); localStorage.setItem('oasis_cat_view', v); };

  const remove = async (id: number) => { await del(`/support/catalogue/${id}`); load(); };

  const save = async () => {
    setSaving(true);
    try {
      let image_attachment_id: number | undefined;
      if (img) image_attachment_id = (await uploadFile(img, 'catalogue')).id;
      await post('/support/catalogue', { ...f, image_attachment_id });
      setModal(false); setImg(null); load(); toast(t('saved'), 'ok');
    } catch (e: any) { toast(e.code || 'error', 'err'); }
    finally { setSaving(false); }
  };

  if (!rows) return <Spinner />;
  const q = qs.trim().toLowerCase();
  const list = q ? rows.filter(r => [r.name, r.manufacturer, r.part_no].some((x: any) => (x || '').toLowerCase().includes(q))) : rows;

  return (
    <>
      <div className="row between mb16">
        <div>
          <h1>{t('nav_catalogue')}</h1>
          <div className="mut">{mn ? 'Бүтээгдэхүүн, үйлчилгээний жагсаалт — Оюу Толгойн худалдан авагчид харна' : 'Your products and services — visible to Oyu Tolgoi buyers'}</div>
        </div>
        <button className="btn" onClick={() => { setF({ currency: 'MNT', uom: 'EA' }); setImg(null); setModal(true); }}>
          <Icon name="box" size={15} /> {t('add')}
        </button>
      </div>

      <div className="filters mb16">
        <input value={qs} onChange={e => setQs(e.target.value)} placeholder={`${t('search')} — ${mn ? 'нэр, үйлдвэрлэгч, парт №' : 'name, manufacturer, part no'}`} />
        <span className="spacer" />
        <span className="mut">{list.length} {mn ? 'бүтээгдэхүүн' : 'items'}</span>
        <div className="viewtoggle" role="group" aria-label={mn ? 'Харагдац' : 'View'}>
          <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setViewP('grid')} aria-pressed={view === 'grid'}>
            <Icon name="dashboard" size={14} /> {mn ? 'Карт' : 'Cards'}
          </button>
          <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setViewP('table')} aria-pressed={view === 'table'}>
            <Icon name="survey" size={14} /> {mn ? 'Хүснэгт' : 'Table'}
          </button>
        </div>
      </div>

      {!list.length ? <Card><Empty text={mn ? 'Бүтээгдэхүүн бүртгэгдээгүй байна' : 'No catalogue items yet'} /></Card> : view === 'grid' ? (
        <div className="prod-grid">
          {list.map(r => (
            <article key={r.id} className="prod">
              <AuthImg attachmentId={r.image_attachment_id} alt={r.name} />
              <div className="prod-body">
                <h3 className="prod-name" title={r.name}>{r.name}</h3>
                <div className="prod-meta">
                  {r.manufacturer && <span>{r.manufacturer}</span>}
                  {r.part_no && <span className="pn">{r.part_no}</span>}
                </div>
                {r.certifications && (
                  <div className="prod-certs">
                    {String(r.certifications).split(',').map((c: string) => c.trim()).filter(Boolean).slice(0, 4)
                      .map((c: string) => <span key={c} className="cert">{c}</span>)}
                  </div>
                )}
                <div className="prod-foot">
                  <span className="prod-price">{r.unit_price ? fmtMoney(r.unit_price, r.currency) : <span className="mut">{mn ? 'Үнэ тохиролцоно' : 'Price on request'}</span>}</span>
                  <span className="mut">/ {r.uom || 'EA'}</span>
                </div>
              </div>
              <button className="prod-del" onClick={() => remove(r.id)} aria-label={t('delete')}>✕</button>
            </article>
          ))}
        </div>
      ) : (
        <Card tight>
          <DataTable rows={list} cols={[
            { key: 'image', label: '', w: 72, render: r => <div className="prod-thumb"><AuthImg attachmentId={r.image_attachment_id} alt={r.name} /></div> },
            { key: 'name', label: t('name'), w: 280, wrap: true, render: r => <span className="bold">{r.name}</span> },
            { key: 'manufacturer', label: t('manufacturer') },
            { key: 'part_no', label: t('part_no') },
            { key: 'origin_country', label: mn ? 'Гарал үүсэл' : 'Origin' },
            { key: 'certifications', label: mn ? 'Сертификат' : 'Certificates', w: 180, wrap: true },
            { key: 'unit_price', label: t('unit_price'), num: true, render: r => r.unit_price ? fmtMoney(r.unit_price, r.currency) : '—' },
            { key: 'uom', label: 'UOM' },
            { key: 'x', label: '', w: 56, render: r => <button className="btn ghost sm" onClick={async e => { e.stopPropagation(); await remove(r.id); }} aria-label={t('delete')}>✕</button> },
          ]} />
        </Card>
      )}

      {modal && (
        <Modal title={mn ? 'Бүтээгдэхүүн нэмэх' : 'Add product'} onClose={() => setModal(false)}>
          <Field label={mn ? 'Бүтээгдэхүүний зураг' : 'Product image'}
            hint={mn ? '1:1 квадрат зураг хамгийн зөв харагдана. PNG эсвэл JPG, 10MB хүртэл.' : 'Square (1:1) images render best. PNG or JPG, up to 10MB.'}>
            <FileDrop accept=".png,.jpg,.jpeg" maxMb={10}
              value={img ? { name: img.name, size: img.size } : null}
              onClear={() => setImg(null)}
              onFile={(file) => setImg(file)} />
          </Field>
          <Field label={t('name')} required hint={mn ? 'Худалдан авагч хайлтад ашиглана' : 'Used by buyers when searching'}>
            <input value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} placeholder={mn ? 'Жишээ нь: Хамгаалалтын дуулга MSA V-Gard' : 'e.g. MSA V-Gard safety helmet'} />
          </Field>
          <div className="grid g2">
            <Field label={t('manufacturer')}><input value={f.manufacturer || ''} onChange={e => setF({ ...f, manufacturer: e.target.value })} placeholder="MSA" /></Field>
            <Field label={t('part_no')}><input value={f.part_no || ''} onChange={e => setF({ ...f, part_no: e.target.value })} placeholder="10034020" /></Field>
          </div>
          <div className="grid g3">
            <Field label={t('unit_price')} hint={mn ? 'НӨАТ багтсан' : 'VAT included'}>
              <input type="number" value={f.unit_price || ''} onChange={e => setF({ ...f, unit_price: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label={t('currency')}>
              <select value={f.currency || 'MNT'} onChange={e => setF({ ...f, currency: e.target.value })}>
                {['MNT', 'USD', 'EUR', 'CNY'].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="UOM" hint={mn ? 'Хэмжих нэгж' : 'Unit of measure'}>
              <input value={f.uom || 'EA'} onChange={e => setF({ ...f, uom: e.target.value })} />
            </Field>
          </div>
          <div className="grid g2">
            <Field label={mn ? 'Гарал үүсэл' : 'Origin'}><input value={f.origin_country || ''} onChange={e => setF({ ...f, origin_country: e.target.value })} placeholder={mn ? 'Герман' : 'Germany'} /></Field>
            <Field label={mn ? 'Сертификат' : 'Certificates'} hint={mn ? 'Таслалаар тусгаарлана: ISO 9001, CE' : 'Comma separated: ISO 9001, CE'}>
              <input value={f.certifications || ''} onChange={e => setF({ ...f, certifications: e.target.value })} placeholder="ISO 9001, CE" />
            </Field>
          </div>
          <Field label={t('comment')}><textarea value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!f.name || saving} onClick={save}>{saving ? '…' : t('save')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
