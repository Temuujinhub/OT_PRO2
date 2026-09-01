import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, post, put, api, download, uploadFile, fmtMoney, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Field, Spinner, StatusChip, useToast, Countdown, Modal, Tabs, Empty, ConfirmModal } from '../../ui';

export default function SupTenderDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState('info');
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [reqAnswers, setReqAnswers] = useState<Record<number, any>>({});
  const [validity, setValidity] = useState<number | ''>('');
  const [errors, setErrors] = useState<any[]>([]);
  const [myBid, setMyBid] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [askModal, setAskModal] = useState(false);
  const [question, setQuestion] = useState({ subject: '', body: '' });
  const dirty = useRef(false);

  const load = async () => {
    const data = await get(`/tenders/supplier/${id}`).catch((e: any) => { toast(e.code, 'err'); nav('/supplier/tenders'); return null; });
    if (!data) return;
    setD(data);
    const bid = await get(`/bids/my/${id}`);
    setMyBid(bid);
    const draft = await get(`/bids/my/${id}/draft`);
    if (draft?.payload?.quotes) setQuotes(draft.payload.quotes);
    if (draft?.payload?.reqAnswers) setReqAnswers(draft.payload.reqAnswers);
    if (draft?.payload?.validity) setValidity(draft.payload.validity);
    get(`/comms/threads?context_type=tender&context_id=${id}`).then(setThreads);
  };
  useEffect(() => { load(); }, [id]);

  // draft autosave
  useEffect(() => {
    const iv = setInterval(() => {
      if (!dirty.current || !d) return;
      dirty.current = false;
      put(`/bids/my/${id}/draft`, { payload: { quotes, reqAnswers, validity } }).catch(() => {});
    }, 4000);
    return () => clearInterval(iv);
  });

  if (!d) return <Spinner />;
  const T = d.tender;
  const isOpen = T.status === 'published' && new Date(T.close_at) > new Date();
  const canBid = isOpen && d.disclaimerAccepted;
  const title = lang === 'en' && T.title_en ? T.title_en : T.title_mn;

  // ---------- disclaimer gate ----------
  if (!d.disclaimerAccepted && isOpen) {
    return (
      <Card title={`${T.tender_no} — ${title}`}>
        <h2>⚠️ {t('disclaimer_title')}</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{t('disclaimer_body')}</p>
        <p className="mut">Version {T.disclaimer_version}</p>
        <div className="row">
          <button className="btn" onClick={async () => { await post(`/tenders/supplier/${id}/consent`); load(); }}>{t('accept_continue')}</button>
          <button className="btn sec" onClick={async () => { await post(`/tenders/supplier/${id}/decline`); nav('/supplier/tenders'); }}>{t('decline_invite')}</button>
        </div>
      </Card>
    );
  }

  const setQuote = (itemId: number, patch: any) => {
    setQuotes(qs => {
      const cur = qs[itemId] || {};
      return { ...qs, [itemId]: { ...cur, ...patch } };
    });
    dirty.current = true;
  };

  const buildQuotes = () => T.items
    .filter((it: any) => quotes[it.id]?.unit_price !== undefined && quotes[it.id]?.unit_price !== '')
    .map((it: any) => ({
      tender_item_id: it.id, option_no: 1,
      currency: quotes[it.id].currency || 'MNT',
      unit_price: Number(quotes[it.id].unit_price),
      quantity: Number(it.quantity),
      total_price: Number(quotes[it.id].unit_price) * Number(it.quantity),
      lead_time_value: quotes[it.id].lead_time_value ? Number(quotes[it.id].lead_time_value) : null,
      incoterm: quotes[it.id].incoterm || null,
      is_alternative: !!quotes[it.id].is_alternative,
      manufacturer: quotes[it.id].manufacturer || null,
      part_no: quotes[it.id].part_no || null,
      comment: quotes[it.id].comment || null,
      datasheet_attachment_id: quotes[it.id].datasheet_attachment_id || null,
      license_attachment_id: quotes[it.id].license_attachment_id || null,
      certificate_attachment_id: quotes[it.id].certificate_attachment_id || null,
    }));

  const buildReqAnswers = () => T.requirements
    .filter((rq: any) => reqAnswers[rq.id])
    .map((rq: any) => ({ requirement_id: rq.id, comment: reqAnswers[rq.id].comment || null, attachment_id: reqAnswers[rq.id].attachment_id || null }));

  const validate = async () => {
    const r = await post(`/bids/my/${id}/validate`, { quotes: buildQuotes() });
    setErrors(r.errors);
    toast(r.valid ? t('validation_ok') : `${r.errors.length} ${t('error')}`, r.valid ? 'ok' : 'err');
    return r.valid;
  };

  const submitBid = async () => {
    setConfirmSubmit(false);
    try {
      const r = await post(`/bids/my/${id}/submit`, {
        quotes: buildQuotes(), requirementAnswers: buildReqAnswers(),
        validity_days: validity || null,
      });
      toast(`${t('bid_submitted')} — ${t('receipt_no')}: ${r.receipt}`, 'ok');
      load();
    } catch (e: any) {
      if (e.payload?.errors) setErrors(e.payload.errors);
      const map: any = {
        disclaimer_not_accepted: t('disclaimer_title'), tender_closed: t('closed'),
        qualification_required: lang === 'mn' ? 'Урьдчилсан үнэлгээ батлагдсан байх шаардлагатай' : 'Approved pre-qualification required',
        requirements_missing: t('required_missing'), attachments_missing: t('evidence_missing'),
      };
      toast(map[e.code] || `${t('error')}: ${e.code}`, 'err');
    }
  };

  const importExcel = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api(`/bids/my/${id}/import`, { method: 'POST', body: fd });
      const next = { ...quotes };
      r.rows.forEach((row: any) => {
        next[row.tender_item_id] = {
          ...next[row.tender_item_id], currency: row.currency, unit_price: row.unit_price,
          lead_time_value: row.lead_time_value, incoterm: row.incoterm, manufacturer: row.manufacturer,
          part_no: row.part_no, is_alternative: row.is_alternative, comment: row.comment,
        };
      });
      setQuotes(next); dirty.current = true;
      toast(`${r.imported} ${lang === 'mn' ? 'мөр импортлогдлоо' : 'rows imported'}${r.errors.length ? `, ${r.errors.length} ${t('error')}` : ''}`, r.errors.length ? 'err' : 'ok');
      if (r.errors.length) setErrors(r.errors);
    } catch (e: any) { toast(e.code || t('error'), 'err'); }
  };

  const attach = async (itemId: number, cat: 'datasheet' | 'license' | 'certificate', file: File) => {
    try {
      const a = await uploadFile(file, 'bid', Number(id), cat);
      setQuote(itemId, { [`${cat}_attachment_id`]: a.id });
      toast(`📎 ${file.name}`, 'ok');
    } catch (e: any) { toast(e.code, 'err'); }
  };

  const grandTotal = buildQuotes().filter(qt => !qt.is_alternative).reduce((s, qt) => s + qt.total_price, 0);
  const submittedRev = myBid?.revisions?.[0];

  const tabs = [
    { key: 'info', label: t('details') },
    ...(T.type_code === 'AUCTION' ? [{ key: 'auction', label: '🔨 Auction' }] : []),
    ...(T.has_items ? [{ key: 'bid', label: t('bid_editor') }] : []),
    ...(T.requirements.length ? [{ key: 'eoi', label: t('requirements'), count: T.requirements.length }] : []),
    { key: 'clarification', label: t('clarification'), count: threads.length },
    ...(myBid?.response ? [{ key: 'mybid', label: t('my_bid') }] : []),
  ];

  return (
    <>
      <div className="row between mb16">
        <div>
          <h1>{T.tender_no}</h1>
          <div className="row"><span className="chip blue">{T.type_code}</span><StatusChip s={T.status === 'published' ? 'open' : T.status} />
            {myBid?.response && <span>{t('my_bid')}: <StatusChip s={myBid.response.status} /></span>}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mut">{t('closes')}: {fmtDate(T.close_at, true)} (UTC)</div>
          {isOpen && <Countdown until={T.close_at} />}
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'info' && (
        <Card title={title}>
          <p style={{ whiteSpace: 'pre-wrap' }}>{(lang === 'en' && T.description_en) || T.description_mn || '—'}</p>
          <div className="grid g3">
            <div><div className="mut">{t('published')}</div>{fmtDate(T.publish_at, true)}</div>
            <div><div className="mut">{lang === 'mn' ? 'Хэсэгчилсэн санал' : 'Partial bids'}</div>{T.partial_allowed ? t('yes') : t('no')}</div>
            <div><div className="mut">Alternative</div>{T.alternative_allowed ? t('yes') : t('no')}</div>
            <div><div className="mut">{t('currency')}</div>{T.currency_policy === 'any' ? (lang === 'mn' ? 'Чөлөөт' : 'Any') : T.currency_policy}</div>
            <div><div className="mut">Qualification</div>{T.qualification_required ? (lang === 'mn' ? 'Шаардлагатай' : 'Required') : '—'}</div>
            <div><div className="mut">Buyer</div>{T.buyer_name || '—'}</div>
          </div>
          {T.attachments.length > 0 && (
            <>
              <h3 className="mt16">{t('attachments')}</h3>
              {T.attachments.map((a: any) => (
                <div key={a.id} className="row between" style={{ marginBottom: 6 }}>
                  <span>📎 {a.original_name} <span className="mut">({Math.round(a.size_bytes / 1024)}KB)</span></span>
                  <button className="btn sec sm" onClick={() => download(`/files/${a.id}/download`, a.original_name)}>{t('download')}</button>
                </div>
              ))}
            </>
          )}
          {T.deadlineChanges.length > 0 && (
            <>
              <h3 className="mt16">{t('deadline_history')}</h3>
              {T.deadlineChanges.map((dc: any) => (
                <div key={dc.id} className="mut" style={{ marginBottom: 4 }}>
                  {fmtDate(dc.created_at, true)}: {fmtDate(dc.old_close_at, true)} → <b>{fmtDate(dc.new_close_at, true)}</b> — {dc.reason}
                </div>
              ))}
            </>
          )}
        </Card>
      )}

      {tab === 'auction' && d.auction && <AuctionPanel tenderId={id!} t={t} lang={lang} toast={toast} />}

      {tab === 'bid' && (
        <>
          {!canBid && <div className="banner">{isOpen ? t('disclaimer_title') : (lang === 'mn' ? 'Тендер хаагдсан тул санал илгээх боломжгүй' : 'Tender is closed')}</div>}
          <Card title={t('bid_editor')} right={
            <div className="row">
              <button className="btn sec sm" onClick={() => download(`/bids/my/${id}/template.xlsx`, `${T.tender_no}-template.xlsx`)}>⬇ {t('download_template')}</button>
              <label className="btn teal sm" style={{ cursor: 'pointer' }}>
                ⬆ {t('import_excel')}
                <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && importExcel(e.target.files[0])} />
              </label>
            </div>
          }>
            {errors.length > 0 && (
              <div className="banner">⚠ {errors.slice(0, 6).map((e: any, i) => <div key={i}>{e.line || e.row || ''} {e.field || ''}: {e.error} {e.expected ? `(${JSON.stringify(e.expected)})` : ''}</div>)}</div>
            )}
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr>
                  <th>#</th><th>{lang === 'mn' ? 'Тайлбар' : 'Description'}</th><th className="num">{t('qty')}</th>
                  <th>{t('currency')}</th><th className="num">{t('unit_price')}</th><th className="num">{t('line_total')}</th>
                  <th>{t('lead_time')}</th><th>Incoterm</th><th>{t('manufacturer')}</th><th>Alt</th><th>📎</th>
                </tr></thead>
                <tbody>
                  {T.items.map((it: any) => {
                    const qt = quotes[it.id] || {};
                    const lineTotal = qt.unit_price ? Number(qt.unit_price) * Number(it.quantity) : 0;
                    return (
                      <tr key={it.id}>
                        <td>{it.line_no}</td>
                        <td style={{ minWidth: 220 }}>
                          <div className="bold">{it.description}</div>
                          <div className="mut">{it.material_no} {it.manufacturer ? `· ${it.manufacturer}` : ''} {it.part_no || ''}</div>
                          <div className="row" style={{ gap: 4 }}>
                            {it.datasheet_required && <span className="chip amber">datasheet</span>}
                            {it.license_required && <span className="chip amber">license</span>}
                            {it.certificate_required && <span className="chip amber">certificate</span>}
                          </div>
                        </td>
                        <td className="num">{Number(it.quantity)} {it.uom}</td>
                        <td>
                          <select style={{ width: 76 }} disabled={!canBid} value={qt.currency || 'MNT'} onChange={e => setQuote(it.id, { currency: e.target.value })}>
                            {['MNT', 'USD', 'EUR', 'CNY'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td><input type="number" min={0} step="0.01" style={{ width: 110, textAlign: 'right' }} disabled={!canBid}
                          value={qt.unit_price ?? ''} onChange={e => setQuote(it.id, { unit_price: e.target.value })} /></td>
                        <td className="num bold">{lineTotal ? fmtMoney(lineTotal) : '—'}</td>
                        <td><input type="number" min={0} style={{ width: 70 }} disabled={!canBid}
                          value={qt.lead_time_value ?? ''} onChange={e => setQuote(it.id, { lead_time_value: e.target.value })} /></td>
                        <td>
                          <select style={{ width: 76 }} disabled={!canBid} value={qt.incoterm || ''} onChange={e => setQuote(it.id, { incoterm: e.target.value })}>
                            <option value="">—</option>
                            {['EXW', 'FCA', 'DAP', 'DDP', 'CIF', 'FOB'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td><input style={{ width: 110 }} disabled={!canBid} value={qt.manufacturer ?? ''} onChange={e => setQuote(it.id, { manufacturer: e.target.value })} /></td>
                        <td><input type="checkbox" disabled={!canBid || !T.alternative_allowed} checked={!!qt.is_alternative} onChange={e => setQuote(it.id, { is_alternative: e.target.checked })} /></td>
                        <td style={{ minWidth: 120 }}>
                          {(['datasheet', 'license', 'certificate'] as const).map(cat =>
                            it[`${cat}_required`] && (
                              <div key={cat}>
                                {qt[`${cat}_attachment_id`]
                                  ? <span className="chip green">✓ {cat}</span>
                                  : <label className="btn ghost sm" style={{ cursor: 'pointer' }}>📎 {cat}
                                      <input type="file" style={{ display: 'none' }} disabled={!canBid}
                                        onChange={e => e.target.files?.[0] && attach(it.id, cat, e.target.files[0])} />
                                    </label>}
                              </div>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row between mt16">
              <Field label={t('validity_days')}>
                <input type="number" style={{ width: 120 }} disabled={!canBid} value={validity} onChange={e => { setValidity(e.target.value === '' ? '' : Number(e.target.value)); dirty.current = true; }} />
              </Field>
              <div style={{ textAlign: 'right' }}>
                <div className="mut">{t('total')} ({lang === 'mn' ? 'үндсэн саналууд' : 'main options'})</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtMoney(grandTotal)}</div>
              </div>
            </div>
            <div className="row end">
              <button className="btn sec" disabled={!canBid} onClick={() => { put(`/bids/my/${id}/draft`, { payload: { quotes, reqAnswers, validity } }); toast(t('draft_saved'), 'ok'); }}>{t('save')}</button>
              <button className="btn teal" disabled={!canBid} onClick={validate}>{t('validate')}</button>
              <button className="btn" disabled={!canBid} onClick={async () => { if (await validate()) setConfirmSubmit(true); }}>{t('submit_bid')}</button>
            </div>
          </Card>
        </>
      )}

      {tab === 'eoi' && (
        <Card title={t('requirements')}>
          {T.requirements.map((rq: any) => {
            const a = reqAnswers[rq.id] || {};
            return (
              <div key={rq.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10, marginBottom: 10 }}>
                <div className="bold">{rq.line_no}. {lang === 'en' && rq.label_en ? rq.label_en : rq.label_mn}
                  {rq.required && <span className="req"> *</span>}
                  {rq.attachment_required && <span className="chip amber" style={{ marginLeft: 6 }}>📎 {lang === 'mn' ? 'хавсралт заавал' : 'attachment required'}</span>}
                </div>
                <textarea style={{ marginTop: 6 }} placeholder={t('comment')} disabled={!canBid}
                  value={a.comment || ''} onChange={e => { setReqAnswers(x => ({ ...x, [rq.id]: { ...a, comment: e.target.value } })); dirty.current = true; }} />
                <div className="row" style={{ marginTop: 4 }}>
                  <label className="btn sec sm" style={{ cursor: 'pointer' }}>📎 {t('upload')}
                    <input type="file" style={{ display: 'none' }} disabled={!canBid} onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      try {
                        const att = await uploadFile(file, 'bid', Number(id), 'requirement');
                        setReqAnswers(x => ({ ...x, [rq.id]: { ...a, attachment_id: att.id, fileName: file.name } }));
                        dirty.current = true;
                        toast(`📎 ${file.name}`, 'ok');
                      } catch (err: any) { toast(err.code, 'err'); }
                    }} />
                  </label>
                  {a.attachment_id && <span className="chip green">✓ {a.fileName || (lang === 'mn' ? 'хавсаргасан' : 'attached')}</span>}
                </div>
              </div>
            );
          })}
          <div className="row end">
            <button className="btn" disabled={!canBid} onClick={() => setConfirmSubmit(true)}>{t('submit')}</button>
          </div>
        </Card>
      )}

      {tab === 'clarification' && (
        <Card title={t('clarification')} right={isOpen && <button className="btn sm" onClick={() => setAskModal(true)}>+ {t('ask_question')}</button>}>
          {threads.length ? threads.map(th => (
            <div key={th.id} className="row between" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => nav(`/supplier/messages/${th.id}`)}>
              <div><div className="bold">{th.subject}</div><div className="mut">{fmtDate(th.last_at || th.created_at, true)} · 💬 {th.message_count}</div></div>
              <StatusChip s={th.status} />
            </div>
          )) : <Empty icon="💬" />}
        </Card>
      )}

      {tab === 'mybid' && myBid?.response && (
        <>
          <Card title={`${t('my_bid')} — ${t('revision')} v${myBid.response.current_revision}`}
            right={myBid.response.status === 'submitted' && isOpen &&
              <button className="btn danger sm" onClick={async () => { await post(`/bids/my/${id}/withdraw`, { reason: 'supplier request' }); toast('✓', 'ok'); load(); }}>{t('withdraw')}</button>}>
            <div className="row mb16"><StatusChip s={myBid.response.status} />
              <span className="mut">{t('receipt_no')}: BID-{myBid.response.id}-{myBid.response.current_revision} · {fmtDate(myBid.response.submitted_at, true)}</span></div>
            {myBid.revisions.map((rev: any) => (
              <div key={rev.id} className="mb16">
                <h3>v{rev.revision_no} <span className="mut">({rev.source_type}, {fmtDate(rev.submitted_at, true)})</span></h3>
                {rev.quotes.length > 0 && (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th>#</th><th>{lang === 'mn' ? 'Бараа' : 'Item'}</th><th className="num">{t('unit_price')}</th><th className="num">{t('line_total')}</th><th>Alt</th></tr></thead>
                      <tbody>
                        {rev.quotes.map((qt: any) => (
                          <tr key={qt.id}>
                            <td>{qt.line_no}</td><td>{qt.description}</td>
                            <td className="num">{fmtMoney(qt.unit_price, qt.currency)}</td>
                            <td className="num bold">{fmtMoney(qt.total_price, qt.currency)}</td>
                            <td>{qt.is_alternative ? '✓' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </Card>
        </>
      )}

      {confirmSubmit && (
        <ConfirmModal title={t('submit_bid')}
          text={`${t('total')}: ${fmtMoney(grandTotal)} — ${lang === 'mn' ? 'Илгээсэн санал өөрчлөгдөхгүй (шинэ хувилбар үүсгэж болно). Илгээх үү?' : 'Submitted revisions are immutable (you can submit a new revision). Continue?'}`}
          onYes={() => T.has_items ? submitBid() : (async () => { setConfirmSubmit(false);
            try {
              const r = await post(`/bids/my/${id}/submit`, { quotes: [], requirementAnswers: buildReqAnswers(), validity_days: validity || null });
              toast(`${t('bid_submitted')} — ${r.receipt}`, 'ok'); load();
            } catch (e: any) { toast(e.code === 'requirements_missing' ? t('required_missing') : e.code === 'attachments_missing' ? t('evidence_missing') : e.code, 'err'); }
          })()}
          onNo={() => setConfirmSubmit(false)} />
      )}

      {askModal && (
        <Modal title={t('ask_question')} onClose={() => setAskModal(false)}>
          <Field label={t('subject')} required><input value={question.subject} onChange={e => setQuestion({ ...question, subject: e.target.value })} /></Field>
          <Field label={t('comment')} required><textarea value={question.body} onChange={e => setQuestion({ ...question, body: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setAskModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!question.subject || !question.body} onClick={async () => {
              await post('/comms/threads', { context_type: 'tender', context_id: Number(id), ...question });
              setAskModal(false); setQuestion({ subject: '', body: '' });
              toast('✓', 'ok');
              get(`/comms/threads?context_type=tender&context_id=${id}`).then(setThreads);
            }}>{t('send')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------- Reverse auction panel (polls every 3s) ----------
function AuctionPanel({ tenderId, t, lang, toast }: any) {
  const [st, setSt] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const load = () => get(`/auction/${tenderId}/state`).then(setSt).catch(() => {});
  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, [tenderId]);
  if (!st) return <Spinner />;
  const a = st.auction;
  return (
    <Card title={`🔨 ${a.status === 'live' ? t('auction_live') : a.status === 'ended' ? t('auction_ended') : a.status}`}>
      <div className="grid g4 mb16">
        <div><div className="mut">{lang === 'mn' ? 'Эхлэх үнэ' : 'Start price'}</div><div className="bold" style={{ fontSize: 18 }}>{fmtMoney(a.start_price, a.currency)}</div></div>
        <div><div className="mut">{t('current_best')}</div><div className="bold" style={{ fontSize: 18, color: 'var(--green)' }}>{fmtMoney(st.currentBest, a.currency)}</div></div>
        <div><div className="mut">{t('min_decrement')}</div><div className="bold">{fmtMoney(a.min_decrement, a.currency)}</div></div>
        <div><div className="mut">{lang === 'mn' ? 'Дуусах' : 'Ends'}</div><Countdown until={a.ends_at} /></div>
      </div>
      {a.i_won && <div className="banner" style={{ background: 'var(--green-light)', color: 'var(--green)', borderColor: '#bfe3c9' }}>{t('you_won')}</div>}
      {a.status === 'live' && (
        <div className="filters mb16">
          <input type="number" placeholder={`≤ ${fmtMoney(st.nextMaxBid)}`} style={{ maxWidth: 220 }} value={amount} onChange={e => setAmount(e.target.value)} />
          <button className="btn" onClick={async () => {
            try {
              const r = await post(`/auction/${tenderId}/bid`, { amount: Number(amount) });
              toast(r.extended ? (lang === 'mn' ? 'Санал орлоо — хугацаа сунгагдлаа' : 'Bid placed — time extended') : '✓', 'ok');
              setAmount(''); load();
            } catch (e: any) {
              toast(e.code === 'bid_too_high' ? `${t('bid_too_high')} (max ${fmtMoney(e.payload?.maxAllowed)})` : e.code, 'err');
            }
          }}>{t('place_bid')}</button>
          <span className="mut">{t('your_bid_max')}: {fmtMoney(st.nextMaxBid, a.currency)}</span>
        </div>
      )}
      <h3>{lang === 'mn' ? 'Саналын жагсаалт (нэрс нууцлагдсан)' : 'Bid ladder (anonymised)'}</h3>
      <table className="tbl">
        <thead><tr><th>#</th><th>{lang === 'mn' ? 'Оролцогч' : 'Bidder'}</th><th className="num">{t('amount')}</th><th>{t('date')}</th></tr></thead>
        <tbody>
          {st.bids.map((b: any) => (
            <tr key={b.rank} style={b.mine ? { background: 'var(--orange-light)' } : undefined}>
              <td>{b.rank}</td><td>{b.bidder}</td>
              <td className="num bold">{fmtMoney(b.amount, a.currency)}</td>
              <td className="mut">{fmtDate(b.placed_at, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
