import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, post, put, uploadFile } from '../../api';
import { useLang } from '../../i18n';
import { Card, Field, Spinner, useToast } from '../../ui';

const STEPS = ['wizard_type', 'wizard_main', 'wizard_email', 'wizard_items', 'wizard_recipients', 'wizard_review'];

export default function AdmTenderWizard() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const nav = useNavigate();
  const [step, setStep] = useState(id ? 1 : 0);
  const [tenderId, setTenderId] = useState<number | null>(id ? Number(id) : null);
  const [types, setTypes] = useState<any[]>([]);
  const [md, setMd] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [f, setF] = useState<any>({ type_code: 'RFQ', currency_policy: 'any', partial_allowed: true, alternative_allowed: true });
  const [items, setItems] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<number>>(new Set());
  const [externalEmails, setExternalEmails] = useState('');
  const [rf, setRf] = useState<any>({});
  const [validation, setValidation] = useState<any>(null);
  const [auctionCfg, setAuctionCfg] = useState<any>({ min_decrement: 1000000, extension_minutes: 5 });

  useEffect(() => {
    get('/tenders/types').then(setTypes);
    get('/admin/masterdata').then(setMd);
    get('/admin/users?type=internal').then(setUsers);
    if (id) loadTender(Number(id));
  }, []);

  const loadTender = async (tid: number) => {
    const d = await get(`/tenders/${tid}`);
    const T = d.tender;
    setF({
      type_code: T.type_code, title_mn: T.title_mn, title_en: T.title_en, description_mn: T.description_mn,
      description_en: T.description_en, department: T.department, category_id: T.category_id,
      end_user_id: T.end_user_id, publish_at: T.publish_at?.slice(0, 16), close_at: T.close_at?.slice(0, 16),
      currency_policy: T.currency_policy, partial_allowed: T.partial_allowed, alternative_allowed: T.alternative_allowed,
      qualification_required: T.qualification_required, dd_required: T.dd_required, is_public: T.is_public,
      email_subject: T.email_subject, email_body: T.email_body, status: T.status,
    });
    setItems(T.items.map((it: any) => ({ ...it, quantity: Number(it.quantity) })));
    setReqs(T.requirements);
    setSelectedOrgs(new Set(d.invitations.filter((i: any) => i.organization_id).map((i: any) => i.organization_id)));
    setExternalEmails(d.invitations.filter((i: any) => i.external_email).map((i: any) => i.external_email).join(', '));
  };

  if (!md) return <Spinner />;
  const isEditable = !f.status || ['draft', 'pending_approval'].includes(f.status);
  const typeHasItems = types.find(tt => tt.code === f.type_code)?.has_items;
  const isAuction = f.type_code === 'AUCTION';
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  const ensureTender = async (): Promise<number> => {
    if (tenderId) { await saveMain(tenderId); return tenderId; }
    const tender = await post('/tenders', f);
    setTenderId(tender.id);
    return tender.id;
  };
  const saveMain = async (tid: number) => {
    await put(`/tenders/${tid}`, {
      ...f,
      publish_at: f.publish_at || null, close_at: f.close_at || null,
    });
  };
  const saveItems = async (tid: number) => {
    if (typeHasItems) await put(`/tenders/${tid}/items`, { items });
    await put(`/tenders/${tid}/requirements`, { requirements: reqs });
  };
  const saveRecipients = async (tid: number) => {
    const emails = externalEmails.split(/[,;\s]+/).filter(Boolean);
    await put(`/tenders/${tid}/recipients`, { orgIds: [...selectedOrgs], externalEmails: emails });
  };

  const goNext = async () => {
    try {
      if (step === 0) { const tid = await ensureTender(); setStep(1); return; }
      if (!tenderId) return;
      if (step === 1 || step === 2) await saveMain(tenderId);
      if (step === 3) { await saveItems(tenderId); if (isAuction && auctionCfg.start_price) await post(`/auction/${tenderId}/configure`, { ...auctionCfg, starts_at: f.publish_at || new Date().toISOString(), ends_at: f.close_at }); }
      if (step === 4) await saveRecipients(tenderId);
      if (step === 4) setValidation(await get(`/tenders/${tenderId}/validate`));
      setStep(s => Math.min(s + 1, STEPS.length - 1));
    } catch (e: any) {
      toast(e.payload?.rows ? JSON.stringify(e.payload.rows.slice(0, 3)) : (e.code || t('error')), 'err');
    }
  };

  const requestPublish = async () => {
    try {
      await saveMain(tenderId!); await saveItems(tenderId!); await saveRecipients(tenderId!);
      const r = await post(`/tenders/${tenderId}/request-publish`);
      toast(lang === 'mn' ? 'Нийтлэх зөвшөөрөл илгээгдлээ' : 'Publish approval requested', 'ok');
      nav(`/admin/tenders/${tenderId}`);
    } catch (e: any) {
      if (e.payload?.errors) setValidation(e.payload);
      toast(e.code === 'validation_failed' ? (lang === 'mn' ? 'Алдаануудыг засна уу' : 'Fix validation errors') : e.code, 'err');
    }
  };

  const previewRecipients = async () => {
    const tid = tenderId || await ensureTender();
    const r = await post(`/tenders/${tid}/recipients/preview`, rf);
    setRecipients(r);
  };

  return (
    <>
      <button className="btn ghost" onClick={() => nav(tenderId ? `/admin/tenders/${tenderId}` : '/admin/tenders')}>← {t('back')}</button>
      <h1>{tenderId ? `${t('edit')} #${tenderId}` : t('create_tender')}</h1>
      {!isEditable && <div className="banner">{lang === 'mn' ? 'Нийтлэгдсэн тендер засварлагдахгүй' : 'Published tenders are immutable'}</div>}
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`wstep ${i === step ? 'active' : i < step ? 'done' : ''}`} onClick={() => tenderId && setStep(i)}>{i + 1}. {t(s)}</div>
        ))}
      </div>

      {step === 0 && (
        <Card title={t('wizard_type')}>
          <div className="grid g4">
            {types.map(tt => (
              <div key={tt.code} className="card mb0" style={{ cursor: 'pointer', borderColor: f.type_code === tt.code ? 'var(--orange)' : undefined, borderWidth: 2 }}
                onClick={() => set('type_code', tt.code)}>
                <div className="bold">{tt.code}</div>
                <div className="mut">{lang === 'en' ? (tt.name_en || tt.name_mn) : tt.name_mn}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title={t('wizard_main')}>
          <div className="grid g2">
            <Field label={`${t('title')} (МН)`} required><input value={f.title_mn || ''} onChange={e => set('title_mn', e.target.value)} disabled={!isEditable} /></Field>
            <Field label={`${t('title')} (EN)`}><input value={f.title_en || ''} onChange={e => set('title_en', e.target.value)} disabled={!isEditable} /></Field>
          </div>
          <Field label={`${t('comment')} (МН)`}><textarea value={f.description_mn || ''} onChange={e => set('description_mn', e.target.value)} disabled={!isEditable} /></Field>
          <div className="grid g3">
            <Field label={lang === 'mn' ? 'Хэлтэс' : 'Department'}><input value={f.department || ''} onChange={e => set('department', e.target.value)} disabled={!isEditable} /></Field>
            <Field label={t('categories')}>
              <select value={f.category_id || ''} onChange={e => set('category_id', e.target.value ? Number(e.target.value) : null)} disabled={!isEditable}>
                <option value="">—</option>
                {md.categories.map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.name_mn}</option>)}
              </select>
            </Field>
            <Field label="End user">
              <select value={f.end_user_id || ''} onChange={e => set('end_user_id', e.target.value ? Number(e.target.value) : null)} disabled={!isEditable}>
                <option value="">—</option>
                {users.filter(u => ['EndUser', 'Buyer'].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid g3">
            <Field label={t('published') + ' (UTC)'}><input type="datetime-local" value={f.publish_at || ''} onChange={e => set('publish_at', e.target.value)} disabled={!isEditable} /></Field>
            <Field label={t('closes') + ' (UTC)'} required><input type="datetime-local" value={f.close_at || ''} onChange={e => set('close_at', e.target.value)} disabled={!isEditable} /></Field>
            <Field label={t('currency')}>
              <select value={f.currency_policy} onChange={e => set('currency_policy', e.target.value)} disabled={!isEditable}>
                <option value="any">{lang === 'mn' ? 'Чөлөөт' : 'Any'}</option><option value="MNT">MNT only</option><option value="USD">USD only</option>
              </select>
            </Field>
          </div>
          <div className="row">
            {[['partial_allowed', lang === 'mn' ? 'Хэсэгчилсэн санал' : 'Partial bids'],
              ['alternative_allowed', 'Alternative'],
              ['qualification_required', lang === 'mn' ? 'Урьдчилсан үнэлгээ шаардах' : 'Require pre-qualification'],
              ['dd_required', 'DD/COI gate'],
              ['is_public', lang === 'mn' ? 'Нээлттэй (public)' : 'Public']].map(([k, lb]) => (
              <label key={k} className="checkbox"><input type="checkbox" checked={!!f[k]} onChange={e => set(k as string, e.target.checked)} disabled={!isEditable} /> {lb}</label>
            ))}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title={t('wizard_email')}>
          <Field label={t('subject')}><input value={f.email_subject || ''} onChange={e => set('email_subject', e.target.value)} disabled={!isEditable} placeholder={`OASIS: ${f.type_code} урилга — ${f.title_mn || ''}`} /></Field>
          <Field label={lang === 'mn' ? 'Имэйлийн агуулга' : 'Email body'} hint={lang === 'mn' ? 'Урилгын имэйлд илгээгдэнэ' : 'Sent with the invitation email'}>
            <textarea style={{ minHeight: 160 }} value={f.email_body || ''} onChange={e => set('email_body', e.target.value)} disabled={!isEditable} />
          </Field>
          <div className="card" style={{ background: 'var(--bg)' }}>
            <div className="mut">{lang === 'mn' ? 'Урьдчилсан харагдац' : 'Preview'}:</div>
            <div className="bold">{f.email_subject || '—'}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{f.email_body || '—'}</div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <>
          {typeHasItems && (
            <Card title={t('items')} right={isEditable && <button className="btn sm" onClick={() => setItems(x => [...x, { quantity: 1, uom: 'EA' }])}>+ {t('add')}</button>}>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>#</th><th>PR</th><th>Material</th><th>{lang === 'mn' ? 'Тайлбар' : 'Description'}*</th><th>{t('qty')}*</th><th>UOM</th><th>{t('manufacturer')}</th><th>Part</th><th>DS</th><th>Lic</th><th></th></tr></thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td><input style={{ width: 90 }} value={it.pr_no || ''} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, pr_no: e.target.value } : y))} disabled={!isEditable} /></td>
                        <td><input style={{ width: 100 }} value={it.material_no || ''} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, material_no: e.target.value } : y))} disabled={!isEditable} /></td>
                        <td><input style={{ minWidth: 200 }} value={it.description || ''} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, description: e.target.value } : y))} disabled={!isEditable} /></td>
                        <td><input type="number" style={{ width: 76 }} value={it.quantity ?? ''} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, quantity: e.target.value } : y))} disabled={!isEditable} /></td>
                        <td>
                          <select style={{ width: 72 }} value={it.uom || 'EA'} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, uom: e.target.value } : y))} disabled={!isEditable}>
                            {md.uoms.map((u: any) => <option key={u.code}>{u.code}</option>)}
                          </select>
                        </td>
                        <td><input style={{ width: 110 }} value={it.manufacturer || ''} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, manufacturer: e.target.value } : y))} disabled={!isEditable} /></td>
                        <td><input style={{ width: 90 }} value={it.part_no || ''} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, part_no: e.target.value } : y))} disabled={!isEditable} /></td>
                        <td><input type="checkbox" checked={!!it.datasheet_required} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, datasheet_required: e.target.checked } : y))} disabled={!isEditable} /></td>
                        <td><input type="checkbox" checked={!!it.license_required} onChange={e => setItems(x => x.map((y, j) => j === i ? { ...y, license_required: e.target.checked } : y))} disabled={!isEditable} /></td>
                        <td>{isEditable && <button className="btn ghost sm" onClick={() => setItems(x => x.filter((_, j) => j !== i))}>🗑</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card title={t('requirements') + ' (EOI)'} right={isEditable && <button className="btn sm" onClick={() => setReqs(x => [...x, { required: true }])}>+ {t('add')}</button>}>
            {reqs.map((rq, i) => (
              <div key={i} className="row" style={{ marginBottom: 8 }}>
                <input style={{ flex: 2 }} placeholder={`${t('requirements')} (МН)`} value={rq.label_mn || ''} onChange={e => setReqs(x => x.map((y, j) => j === i ? { ...y, label_mn: e.target.value } : y))} disabled={!isEditable} />
                <input style={{ flex: 2 }} placeholder="(EN)" value={rq.label_en || ''} onChange={e => setReqs(x => x.map((y, j) => j === i ? { ...y, label_en: e.target.value } : y))} disabled={!isEditable} />
                <label className="checkbox"><input type="checkbox" checked={rq.required ?? true} onChange={e => setReqs(x => x.map((y, j) => j === i ? { ...y, required: e.target.checked } : y))} disabled={!isEditable} /> {t('required_field')}</label>
                <label className="checkbox"><input type="checkbox" checked={!!rq.attachment_required} onChange={e => setReqs(x => x.map((y, j) => j === i ? { ...y, attachment_required: e.target.checked } : y))} disabled={!isEditable} /> 📎</label>
                {isEditable && <button className="btn ghost sm" onClick={() => setReqs(x => x.filter((_, j) => j !== i))}>🗑</button>}
              </div>
            ))}
          </Card>
          {isAuction && (
            <Card title="🔨 Auction config">
              <div className="grid g3">
                <Field label={lang === 'mn' ? 'Эхлэх үнэ' : 'Start price'} required>
                  <input type="number" value={auctionCfg.start_price || ''} onChange={e => setAuctionCfg({ ...auctionCfg, start_price: e.target.value })} />
                </Field>
                <Field label={t('min_decrement')}>
                  <input type="number" value={auctionCfg.min_decrement} onChange={e => setAuctionCfg({ ...auctionCfg, min_decrement: e.target.value })} />
                </Field>
                <Field label={lang === 'mn' ? 'Сунгалт (мин)' : 'Extension (min)'}>
                  <input type="number" value={auctionCfg.extension_minutes} onChange={e => setAuctionCfg({ ...auctionCfg, extension_minutes: Number(e.target.value) })} />
                </Field>
              </div>
            </Card>
          )}
          {tenderId && (
            <Card title={t('attachments')}>
              <label className="btn sec sm" style={{ cursor: 'pointer' }}>📎 {t('upload')}
                <input type="file" style={{ display: 'none' }} onChange={async e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  await uploadFile(file, 'tender', tenderId);
                  toast(`📎 ${file.name}`, 'ok');
                }} />
              </label>
            </Card>
          )}
        </>
      )}

      {step === 4 && (
        <Card title={t('wizard_recipients')}>
          <div className="row mb16">
            <select style={{ maxWidth: 220 }} value={rf.category_id || ''} onChange={e => setRf({ ...rf, category_id: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">{t('categories')}: {t('all')}</option>
              {md.categories.map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.name_mn}</option>)}
            </select>
            <select style={{ maxWidth: 160 }} value={rf.residency || ''} onChange={e => setRf({ ...rf, residency: e.target.value || undefined })}>
              <option value="">{t('all')}</option><option value="national">{t('res_national')}</option><option value="international">{t('res_international')}</option>
            </select>
            <label className="checkbox"><input type="checkbox" checked={!!rf.approved_only} onChange={e => setRf({ ...rf, approved_only: e.target.checked })} /> {lang === 'mn' ? 'Зөвхөн батлагдсан' : 'Approved only'}</label>
            <label className="checkbox"><input type="checkbox" checked={!!rf.qualified_only} onChange={e => setRf({ ...rf, qualified_only: e.target.checked })} /> {lang === 'mn' ? 'Үнэлгээтэй' : 'Qualified only'}</label>
            <button className="btn teal sm" onClick={previewRecipients}>{t('recipients_preview')}</button>
          </div>
          {recipients.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  <th><input type="checkbox" checked={recipients.every(r => selectedOrgs.has(r.id))}
                    onChange={e => setSelectedOrgs(e.target.checked ? new Set([...selectedOrgs, ...recipients.map(r => r.id)]) : new Set([...selectedOrgs].filter(x => !recipients.some(r => r.id === x))))} /></th>
                  <th>{t('name')}</th><th>{t('registry_no')}</th><th>{t('status')}</th><th>{t('email')}</th>
                </tr></thead>
                <tbody>
                  {recipients.map(r => (
                    <tr key={r.id}>
                      <td><input type="checkbox" checked={selectedOrgs.has(r.id)}
                        onChange={e => { const s = new Set(selectedOrgs); e.target.checked ? s.add(r.id) : s.delete(r.id); setSelectedOrgs(s); }} /></td>
                      <td className="bold">{r.name_mn}</td><td>{r.registry_no}</td>
                      <td><span className={`chip ${r.status === 'approved' ? 'green' : 'gray'}`}>{r.status}</span></td>
                      <td className="mut">{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Field label={lang === 'mn' ? 'Гадны имэйл урилга (таслалаар)' : 'External email invitations (comma-separated)'} hint={lang === 'mn' ? 'Бүртгэлгүй нийлүүлэгчид имэйлээр урилга илгээнэ' : 'Unregistered suppliers get an email invite'}>
            <input value={externalEmails} onChange={e => setExternalEmails(e.target.value)} placeholder="a@b.mn, c@d.com" />
          </Field>
          <div className="banner">✉ {lang === 'mn' ? 'Сонгогдсон' : 'Selected'}: {selectedOrgs.size} + {externalEmails.split(/[,;\s]+/).filter(Boolean).length} external</div>
        </Card>
      )}

      {step === 5 && (
        <Card title={t('wizard_review')}>
          {validation && (
            <>
              {validation.errors?.length > 0 && (
                <div className="banner" style={{ background: 'var(--red-light)', borderColor: '#f3b4b4', color: 'var(--red)' }}>
                  {validation.errors.map((e: any, i: number) => <div key={i}>❌ [{e.loc}] {e.error}</div>)}
                </div>
              )}
              {validation.warnings?.length > 0 && (
                <div className="banner">{validation.warnings.map((w: any, i: number) => <div key={i}>⚠ [{w.loc}] {w.warning}</div>)}</div>
              )}
              {!validation.errors?.length && <div className="banner" style={{ background: 'var(--green-light)', borderColor: '#bfe3c9', color: 'var(--green)' }}>✓ {t('validation_ok')}</div>}
            </>
          )}
          <table className="tbl"><tbody>
            {[[t('type'), f.type_code], [t('title'), f.title_mn], [t('closes'), f.close_at],
              [t('wizard_recipients'), `${selectedOrgs.size} org + external`],
              [t('items'), typeHasItems ? items.length : `${reqs.length} requirements`],
              [lang === 'mn' ? 'Урьдчилсан үнэлгээ' : 'Qualification', f.qualification_required ? t('yes') : t('no')],
              ['DD gate', f.dd_required ? t('yes') : t('no')]].map(([k, v], i) => (
              <tr key={i}><td className="mut" style={{ width: 200 }}>{k}</td><td className="bold">{String(v ?? '—')}</td></tr>
            ))}
          </tbody></table>
          <p className="mut mt16">{lang === 'mn'
            ? 'Нийтлэх хүсэлт илгээснээр Approver батална. Батлагдмагц урилгууд автоматаар илгээгдэж, тендер нээгдэнэ. SoD: та өөрөө батлах боломжгүй.'
            : 'Requesting publish sends this to an Approver. Once approved, invitations are sent automatically. SoD: you cannot approve your own request.'}</p>
          {isEditable && f.status !== 'pending_approval' && (
            <button className="btn" onClick={requestPublish}>🚀 {t('request_publish')}</button>
          )}
          {f.status === 'pending_approval' && <div className="chip blue">{lang === 'mn' ? 'Зөвшөөрөл хүлээгдэж байна' : 'Approval pending'}</div>}
        </Card>
      )}

      <div className="row between mt16">
        <button className="btn sec" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← {t('back')}</button>
        {step < STEPS.length - 1 && <button className="btn" onClick={goNext}>{t('next')} →</button>}
      </div>
    </>
  );
}
