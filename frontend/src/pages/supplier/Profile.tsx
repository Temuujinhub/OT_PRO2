import React, { useEffect, useState } from 'react';
import { get, put, post, del, uploadFile } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Field, Tabs, useToast, StatusChip, Progress, DataTable, Modal, Spinner, Empty } from '../../ui';

export default function SupProfile() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { refreshOrg } = useAuth();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState<any>({});
  const [md, setMd] = useState<any>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [mf, setMf] = useState<any>({});

  const load = () => get('/suppliers/my/profile').then(d => {
    setData(d);
    setForm({ name_mn: d.org.name_mn, name_en: d.org.name_en, ...d.profile });
  });
  useEffect(() => { load(); get('/admin/masterdata').then(setMd); }, []);
  if (!data || !md) return <Spinner />;

  const readonly = ['submitted', 'under_review'].includes(data.org.status);
  const saveGeneral = async () => {
    try {
      const r = await put('/suppliers/my/profile/general', form);
      toast(r.changeRequest ? t('change_request_note') : t('saved'), 'ok');
      load();
    } catch (e: any) { toast(e.detail || t('error'), 'err'); }
  };

  const submitProfile = async () => {
    try {
      await post('/suppliers/my/profile/submit');
      toast(t('profile_submitted'), 'ok');
      load(); refreshOrg();
    } catch (e: any) {
      toast(e.code === 'profile_incomplete' ? `${t('profile_completion')}: ${e.detail?.completion}% (min 60%)` : t('error'), 'err');
    }
  };

  const addItem = async () => {
    try {
      if (modal === 'contact') await post('/suppliers/my/contacts', mf);
      if (modal === 'shareholder') await post('/suppliers/my/shareholders', mf);
      if (modal === 'permit') {
        let attachment_id = null;
        if (mf.file) { const a = await uploadFile(mf.file, 'permit'); attachment_id = a.id; }
        await post('/suppliers/my/permits', { ...mf, attachment_id });
      }
      setModal(null); setMf({}); load(); toast(t('saved'), 'ok');
    } catch (e: any) { toast(e.code === 'percent_sum_exceeds_100' ? `${e.code}: ${e.detail}` : (e.code || t('error')), 'err'); }
  };

  const toggleCat = async (cid: number) => {
    const ids = data.categories.map((c: any) => c.id);
    const next = ids.includes(cid) ? ids.filter((x: number) => x !== cid) : [...ids, cid];
    if (next.length > 20) return toast('Max 20', 'err');
    await put('/suppliers/my/categories', { categoryIds: next });
    load();
  };

  const F = (k: string, label: string, type = 'text', props: any = {}) => (
    <Field label={label} {...props}>
      <input type={type} value={form[k] ?? ''} disabled={readonly}
        onChange={e => setForm((f: any) => ({ ...f, [k]: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value }))} />
    </Field>
  );

  return (
    <>
      <div className="row between mb16">
        <div>
          <h1>{t('nav_profile')}</h1>
          <div className="row"><StatusChip s={data.org.status} />
            {data.org.khur_verified && <span className="chip teal">✓ ХУР verified</span>}
            <span className="mut">v{data.org.profile_version}</span></div>
        </div>
        <div style={{ width: 220 }}>
          <div className="mut">{t('profile_completion')}: {data.org.completion_percent}%</div>
          <Progress pct={data.org.completion_percent} />
          {['draft', 'needs_correction', 'rejected'].includes(data.org.status) && (
            <button className="btn mt16" onClick={submitProfile} style={{ width: '100%', justifyContent: 'center' }}>{t('submit_profile')}</button>
          )}
        </div>
      </div>
      {data.org.status === 'needs_correction' && data.org.review_comment && (
        <div className="banner">✏️ {t('needs_correction')}: {data.org.review_comment}</div>
      )}
      {data.org.status === 'approved' && <div className="banner" style={{ background: 'var(--green-light)', borderColor: '#bfe3c9', color: 'var(--green)' }}>{t('change_request_note')}</div>}

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'general', label: t('general_info') },
        { key: 'team', label: t('team'), count: data.contacts.length },
        { key: 'shareholders', label: t('shareholders'), count: data.shareholders.length },
        { key: 'permits', label: t('permits'), count: data.permits.length },
        { key: 'categories', label: t('categories'), count: data.categories.length },
      ]} />

      {tab === 'general' && (
        <Card>
          <div className="grid g2">
            {F('name_mn', t('company_name_mn'))}
            {F('name_en', t('company_name_en'))}
          </div>
          <div className="grid g3">
            <Field label={t('registry_no')}><input value={data.org.registry_no || '—'} disabled /></Field>
            <Field label="Vendor №"><input value={data.org.vendor_no || '—'} disabled /></Field>
            {F('established_year', lang === 'mn' ? 'Байгуулагдсан он' : 'Established', 'number')}
          </div>
          <h3 className="mt16">{t('address')}</h3>
          <div className="grid g3">
            {F('address_province', lang === 'mn' ? 'Аймаг/Хот' : 'Province/City')}
            {F('address_district', lang === 'mn' ? 'Сум/Дүүрэг' : 'District/Soum')}
            {F('address_postcode', lang === 'mn' ? 'Шуудангийн код' : 'Postcode')}
          </div>
          {F('address_line1', lang === 'mn' ? 'Дэлгэрэнгүй хаяг' : 'Address line')}
          <div className="grid g2">
            {F('phone', t('phone'))}
            {F('website', 'Website')}
          </div>
          <h3 className="mt16">{t('workforce')}</h3>
          <div className="grid g3">
            {F('total_employees', t('total_employees'), 'number')}
            {F('mongolian_employees', t('mongolian_employees'), 'number')}
            {F('umnugovi_employees', t('umnugovi_employees'), 'number')}
          </div>
          <div className="grid g2">
            {F('bank_name', lang === 'mn' ? 'Банк' : 'Bank')}
            {F('tax_number', lang === 'mn' ? 'Татвар төлөгчийн дугаар' : 'Tax number')}
          </div>
          <Field label={lang === 'mn' ? 'Танилцуулга' : 'Introduction'}>
            <textarea value={form.intro_mn || ''} disabled={readonly} onChange={e => setForm((f: any) => ({ ...f, intro_mn: e.target.value }))} />
          </Field>
          {!readonly && <button className="btn" onClick={saveGeneral}>{t('save')}</button>}
        </Card>
      )}

      {tab === 'team' && (
        <Card right={!readonly && <button className="btn sm" onClick={() => { setMf({}); setModal('contact'); }}>+ {t('add')}</button>}>
          <DataTable rows={data.contacts} cols={[
            { key: 'full_name', label: t('name'), render: r => <span className="bold">{r.full_name} {r.contact_type === 'primary' && <span className="chip orange">Primary</span>}</span> },
            { key: 'position', label: t('position') },
            { key: 'email', label: t('email') },
            { key: 'phone1', label: t('phone') },
            { key: 'receives_email', label: 'Имэйл авах', render: r => r.receives_email ? '✓' : '—' },
            { key: 'x', label: '', render: r => r.contact_type !== 'primary' && !readonly && <button className="btn ghost sm" onClick={async e => { e.stopPropagation(); await del(`/suppliers/my/contacts/${r.id}`); load(); }}>🗑</button> },
          ]} />
        </Card>
      )}

      {tab === 'shareholders' && (
        <Card right={!readonly && <button className="btn sm" onClick={() => { setMf({}); setModal('shareholder'); }}>+ {t('add')}</button>}>
          <DataTable rows={data.shareholders} cols={[
            { key: 'name', label: t('name') },
            { key: 'owner_type', label: t('type') },
            { key: 'ownership_percent', label: t('ownership_percent'), num: true, render: r => `${Number(r.ownership_percent)}%` },
            { key: 'beneficial_owner', label: 'Beneficial', render: r => r.beneficial_owner ? '✓' : '—' },
            { key: 'x', label: '', render: r => !readonly && <button className="btn ghost sm" onClick={async e => { e.stopPropagation(); await del(`/suppliers/my/shareholders/${r.id}`); load(); }}>🗑</button> },
          ]} />
        </Card>
      )}

      {tab === 'permits' && (
        <Card right={!readonly && <button className="btn sm" onClick={() => { setMf({}); setModal('permit'); }}>+ {t('add')}</button>}>
          <DataTable rows={data.permits} cols={[
            { key: 'permit_type', label: t('type') },
            { key: 'number', label: '№' },
            { key: 'issuer', label: t('issuer') },
            { key: 'issued_on', label: t('issued_on'), render: r => r.issued_on?.slice(0, 10) || '—' },
            { key: 'expires_on', label: t('expires_on'), render: r => {
              const exp = r.expires_on?.slice(0, 10);
              const soon = exp && new Date(exp) < new Date(Date.now() + 60 * 864e5);
              return exp ? <span className={`chip ${soon ? 'amber' : 'green'}`}>{exp}</span> : '—';
            } },
            { key: 'x', label: '', render: r => !readonly && <button className="btn ghost sm" onClick={async e => { e.stopPropagation(); await del(`/suppliers/my/permits/${r.id}`); load(); }}>🗑</button> },
          ]} />
        </Card>
      )}

      {tab === 'categories' && (
        <Card>
          <p className="mut">{lang === 'mn' ? 'Хамгийн ихдээ 20 ангилал сонгоно' : 'Select up to 20 categories'} ({data.categories.length}/20)</p>
          <div className="row" style={{ gap: 8 }}>
            {md.categories.map((c: any) => {
              const on = data.categories.some((x: any) => x.id === c.id);
              return (
                <button key={c.id} className={`btn sm ${on ? '' : 'sec'}`} disabled={readonly} onClick={() => toggleCat(c.id)}>
                  {c.code} · {lang === 'en' ? (c.name_en || c.name_mn) : c.name_mn}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {data.changeRequests.length > 0 && (
        <Card title={lang === 'mn' ? 'Өөрчлөлтийн хүсэлтүүд' : 'Change requests'}>
          {data.changeRequests.map((cr: any) => (
            <div key={cr.id} className="row between" style={{ marginBottom: 6 }}>
              <span className="mut">#{cr.id} · {cr.created_at?.slice(0, 10)}</span>
              <StatusChip s={cr.status} />
            </div>
          ))}
        </Card>
      )}

      {modal && (
        <Modal title={t('add')} onClose={() => setModal(null)}>
          {modal === 'contact' && <>
            <Field label={t('name')} required><input value={mf.full_name || ''} onChange={e => setMf({ ...mf, full_name: e.target.value })} /></Field>
            <Field label={t('position')}><input value={mf.position || ''} onChange={e => setMf({ ...mf, position: e.target.value })} /></Field>
            <div className="grid g2">
              <Field label={t('email')}><input value={mf.email || ''} onChange={e => setMf({ ...mf, email: e.target.value })} /></Field>
              <Field label={t('phone')}><input value={mf.phone1 || ''} onChange={e => setMf({ ...mf, phone1: e.target.value })} /></Field>
            </div>
            <label className="checkbox"><input type="checkbox" checked={!!mf.receives_email} onChange={e => setMf({ ...mf, receives_email: e.target.checked })} /> {lang === 'mn' ? 'Системийн имэйл хүлээн авна' : 'Receives system emails'}</label>
          </>}
          {modal === 'shareholder' && <>
            <Field label={t('name')} required><input value={mf.name || ''} onChange={e => setMf({ ...mf, name: e.target.value })} /></Field>
            <div className="grid g2">
              <Field label={t('ownership_percent')} required><input type="number" value={mf.ownership_percent || ''} onChange={e => setMf({ ...mf, ownership_percent: e.target.value })} /></Field>
              <Field label={t('type')}>
                <select value={mf.owner_type || 'individual'} onChange={e => setMf({ ...mf, owner_type: e.target.value })}>
                  <option value="individual">{t('org_individual')}</option><option value="company">{t('org_company')}</option>
                </select>
              </Field>
            </div>
            <label className="checkbox"><input type="checkbox" checked={!!mf.beneficial_owner} onChange={e => setMf({ ...mf, beneficial_owner: e.target.checked })} /> Beneficial owner (≥25%)</label>
          </>}
          {modal === 'permit' && <>
            <Field label={t('type')} required><input value={mf.permit_type || ''} onChange={e => setMf({ ...mf, permit_type: e.target.value })} placeholder={lang === 'mn' ? 'Тусгай зөвшөөрлийн нэр' : 'Permit name'} /></Field>
            <div className="grid g2">
              <Field label="№"><input value={mf.number || ''} onChange={e => setMf({ ...mf, number: e.target.value })} /></Field>
              <Field label={t('issuer')}><input value={mf.issuer || ''} onChange={e => setMf({ ...mf, issuer: e.target.value })} /></Field>
            </div>
            <div className="grid g2">
              <Field label={t('issued_on')}><input type="date" value={mf.issued_on || ''} onChange={e => setMf({ ...mf, issued_on: e.target.value })} /></Field>
              <Field label={t('expires_on')}><input type="date" value={mf.expires_on || ''} onChange={e => setMf({ ...mf, expires_on: e.target.value })} /></Field>
            </div>
            <Field label={`${t('upload')} (PDF, max 30MB)`}><input type="file" accept=".pdf,.png,.jpg,.docx" onChange={e => setMf({ ...mf, file: e.target.files?.[0] })} /></Field>
          </>}
          <div className="actions">
            <button className="btn sec" onClick={() => setModal(null)}>{t('cancel')}</button>
            <button className="btn" onClick={addItem}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
