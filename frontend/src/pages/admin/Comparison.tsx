import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, post, fmtMoney } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Spinner, useToast, Tabs, Field, StatusChip, Empty } from '../../ui';

export default function AdmComparison() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState('grid');
  const [flt, setFlt] = useState({ excludeAlt: false, hasDatasheet: false });
  // selection: itemId -> { orgId, quoteId, justification }
  const [sel, setSel] = useState<Record<number, any>>({});
  const [recommendation, setRecommendation] = useState('');
  const [euRec, setEuRec] = useState('');

  const load = () => get(`/evaluation/${id}/comparison`).then((x: any) => {
    setD(x);
    // preload buyer evaluation selections if present
    const buyerEval = x.evaluations.find((e: any) => e.etype === 'buyer');
    const euEval = x.evaluations.find((e: any) => e.etype === 'end_user');
    if (buyerEval) {
      setRecommendation(buyerEval.recommendation || '');
      const s: Record<number, any> = {};
      (buyerEval.selections || []).forEach((x2: any) => s[x2.tender_item_id] = { orgId: x2.organization_id, quoteId: x2.quote_id, justification: x2.justification });
      setSel(s);
    }
    if (euEval) setEuRec(euEval.recommendation || '');
  }).catch((e: any) => { toast(e.payload?.message || e.code, 'err'); nav(`/admin/tenders/${id}`); });
  useEffect(() => { load(); }, [id]);
  if (!d) return <Spinner />;

  const quoteFor = (g: any, itemId: number) => g.quotes.filter((qt: any) =>
    qt.tender_item_id === itemId &&
    (!flt.excludeAlt || !qt.is_alternative) &&
    (!flt.hasDatasheet || qt.datasheet_attachment_id));

  const lowestByItem: Record<number, number> = (() => {
    const m: Record<number, number> = {};
    d.items.forEach((it: any) => {
      let best = Infinity;
      d.grid.forEach((g: any) => quoteFor(g, it.id).forEach((qt: any) => {
        if (qt.total_mnt !== null && qt.total_mnt < best) best = qt.total_mnt;
      }));
      m[it.id] = best;
    });
    return m;
  })();

  const selTotal = Object.values(sel).reduce((s: number, x: any) => {
    if (!x?.quoteId) return s;
    for (const g of d.grid) { const qt = g.quotes.find((q2: any) => q2.id === x.quoteId); if (qt) return s + (qt.total_mnt || 0); }
    return s;
  }, 0);

  const selectQuote = (itemId: number, g: any, qt: any) => {
    setSel(s => {
      if (s[itemId]?.quoteId === qt.id) { const n = { ...s }; delete n[itemId]; return n; }
      return { ...s, [itemId]: { orgId: g.response.organization_id, quoteId: qt.id, justification: s[itemId]?.justification || '' } };
    });
  };

  const selectAllLowest = () => {
    const s: Record<number, any> = { ...sel };
    d.items.forEach((it: any) => {
      let best: any = null; let bestG: any = null;
      d.grid.forEach((g: any) => quoteFor(g, it.id).forEach((qt: any) => {
        if (qt.total_mnt !== null && (!best || qt.total_mnt < best.total_mnt)) { best = qt; bestG = g; }
      }));
      if (best) s[it.id] = { orgId: bestG.response.organization_id, quoteId: best.id, justification: s[it.id]?.justification || (lang === 'mn' ? 'Хамгийн бага үнэлэгдсэн үнэ' : 'Lowest evaluated price') };
    });
    setSel(s);
  };

  const submitEval = async (etype: 'buyer' | 'end_user', submit: boolean) => {
    const selections = Object.entries(sel).map(([itemId, x]: any) => ({
      tender_item_id: Number(itemId), organization_id: x.orgId, quote_id: x.quoteId, justification: x.justification,
    }));
    try {
      await post(`/evaluation/${id}/evaluations/${etype}`, {
        selections, recommendation: etype === 'buyer' ? recommendation : euRec, submit,
      });
      toast(submit ? '✓ ' + t('submit') : t('draft_saved'), 'ok');
      load();
    } catch (e: any) {
      toast(e.code === 'recommendation_required' ? e.detail : e.code === 'justification_required' ? e.detail : e.code, 'err');
    }
  };

  const requestAward = async () => {
    try {
      const r = await post(`/evaluation/${id}/request-award`);
      toast(`✓ Award approval: ${fmtMoney(r.totalMnt)} MNT, ${r.stages} ${t('stage')}`, 'ok');
      nav(`/admin/tenders/${id}`);
    } catch (e: any) {
      toast(e.detail || e.code, 'err');
    }
  };

  const buyerEval = d.evaluations.find((e: any) => e.etype === 'buyer');
  const euEval = d.evaluations.find((e: any) => e.etype === 'end_user');
  const isEndUser = d.tender.end_user_id === user.id || user.role === 'SystemAdmin';
  const isBuyer = ['Buyer', 'SystemAdmin'].includes(user.role);

  return (
    <>
      <button className="btn ghost" onClick={() => nav(`/admin/tenders/${id}`)}>← {d.tender.tender_no}</button>
      <h1>{t('comparison')}</h1>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'grid', label: t('comparison') },
        { key: 'eu', label: t('eu_evaluation') },
        { key: 'buyer', label: t('buyer_evaluation') },
      ]} />

      {tab === 'grid' && (
        <>
          <div className="row mb16">
            <label className="checkbox"><input type="checkbox" checked={flt.excludeAlt} onChange={e => setFlt({ ...flt, excludeAlt: e.target.checked })} /> {lang === 'mn' ? 'Alternative хасах' : 'Exclude alternatives'}</label>
            <label className="checkbox"><input type="checkbox" checked={flt.hasDatasheet} onChange={e => setFlt({ ...flt, hasDatasheet: e.target.checked })} /> {lang === 'mn' ? 'Datasheet-тэй' : 'Has datasheet'}</label>
            <button className="btn teal sm" onClick={selectAllLowest}>⚡ {t('lowest_price')} {lang === 'mn' ? 'бүгдийг сонгох' : 'select all'}</button>
            <button className="btn sec sm" onClick={() => setSel({})}>{lang === 'mn' ? 'Цэвэрлэх' : 'Clear'}</button>
          </div>
          {!d.grid.length ? <Empty text={lang === 'mn' ? 'Санал ирээгүй' : 'No bids'} /> : (
            <Card tight>
              <div className="table-wrap" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 200 }}>{t('items')}</th>
                      {d.grid.map((g: any) => (
                        <th key={g.response.id} style={{ minWidth: 170 }}>
                          {g.response.org_name}
                          <div className="mut" style={{ textTransform: 'none' }}>v{g.response.revision_no} · <StatusChip s={g.response.status} /></div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((it: any) => (
                      <tr key={it.id}>
                        <td>
                          <div className="bold">{it.line_no}. {it.description}</div>
                          <div className="mut">{Number(it.quantity)} {it.uom} {it.datasheet_required && '· DS📎'}</div>
                        </td>
                        {d.grid.map((g: any) => {
                          const qts = quoteFor(g, it.id);
                          if (!qts.length) return <td key={g.response.id} className="mut">—</td>;
                          return (
                            <td key={g.response.id}>
                              {qts.map((qt: any) => {
                                const isLowest = qt.total_mnt !== null && Math.abs(qt.total_mnt - lowestByItem[it.id]) < 0.01;
                                const isSel = sel[it.id]?.quoteId === qt.id;
                                return (
                                  <div key={qt.id} className={isLowest ? 'hl-best' : ''}
                                    style={{ padding: 6, borderRadius: 8, marginBottom: 4, cursor: 'pointer', outline: isSel ? '2px solid var(--orange)' : '1px solid var(--line)' }}
                                    onClick={() => selectQuote(it.id, g, qt)}>
                                    <div className="row between">
                                      <span className="bold">{fmtMoney(qt.unit_price, qt.currency)}</span>
                                      {isSel && <span className="chip orange">✓</span>}
                                    </div>
                                    <div className="mut">{t('total')}: {fmtMoney(qt.total_mnt)} MNT{qt.is_alternative ? ' · ALT' : ''}</div>
                                    <div className="mut">
                                      {qt.lead_time_value ? `${qt.lead_time_value}d` : ''} {qt.incoterm || ''}
                                      {Number(qt.negotiated_delta) !== 0 && <span style={{ color: 'var(--green)' }}> Δ{fmtMoney(qt.negotiated_delta)}</span>}
                                      {qt.datasheet_attachment_id && ' 📎'}
                                    </div>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <div className="sel-summary">
            <span>✓ {t('selected')}: {Object.keys(sel).length}/{d.items.length} items</span>
            <span className="bold" style={{ fontSize: 16 }}>{fmtMoney(selTotal)} MNT</span>
            <span className="mut" style={{ color: '#cbd5e1' }}>{lang === 'mn' ? 'Мөр дээр дарж сонгоно' : 'Click a quote to select'}</span>
          </div>
        </>
      )}

      {tab === 'eu' && (
        <Card title={t('eu_evaluation')} right={euEval && <StatusChip s={euEval.status} />}>
          {!isEndUser && <div className="banner">{lang === 'mn' ? 'Та энэ тендерийн end-user биш байна' : 'You are not the assigned end user'}</div>}
          <p className="mut">{lang === 'mn' ? 'Grid дээр сонголтоо хийж, техникийн зөвлөмжөө бичээд илгээнэ.' : 'Make selections on the grid, write your technical recommendation, and submit.'}</p>
          <Field label={t('recommendation')} required hint={lang === 'mn' ? 'Доод тал нь 20 тэмдэгт — хоосон зөвлөмж хүлээн авахгүй (DEF-13)' : 'Min 20 chars — blank recommendations are rejected (DEF-13)'}>
            <textarea value={euRec} onChange={e => setEuRec(e.target.value)} disabled={euEval?.status === 'submitted'} />
          </Field>
          {Object.entries(sel).map(([itemId, x]: any) => {
            const it = d.items.find((i: any) => i.id === Number(itemId));
            return (
              <Field key={itemId} label={`${t('justification')}: ${it?.line_no}. ${it?.description}`} required>
                <input value={x.justification || ''} disabled={euEval?.status === 'submitted'}
                  onChange={e => setSel(s => ({ ...s, [itemId]: { ...x, justification: e.target.value } }))} />
              </Field>
            );
          })}
          {euEval?.status !== 'submitted' && isEndUser && (
            <div className="row">
              <button className="btn sec" onClick={() => submitEval('end_user', false)}>{t('save')}</button>
              <button className="btn" onClick={() => submitEval('end_user', true)}>{t('submit')}</button>
            </div>
          )}
          {euEval?.status === 'submitted' && <div className="chip green">✓ {euEval.evaluator_name}</div>}
        </Card>
      )}

      {tab === 'buyer' && (
        <Card title={t('buyer_evaluation')} right={buyerEval && <StatusChip s={buyerEval.status} />}>
          {euEval?.recommendation && (
            <div className="banner" style={{ background: 'var(--teal-light)', borderColor: '#bfe6ec', color: '#0e7d8c' }}>
              <b>{t('eu_evaluation')} ({euEval.evaluator_name}):</b> {euEval.recommendation}
            </div>
          )}
          <Field label={t('recommendation')} required hint={lang === 'mn' ? 'Худалдааны дүн шинжилгээ, сонголтын үндэслэл (мин 20 тэмдэгт)' : 'Commercial analysis and selection rationale (min 20 chars)'}>
            <textarea style={{ minHeight: 120 }} value={recommendation} onChange={e => setRecommendation(e.target.value)} disabled={buyerEval?.status === 'submitted'} />
          </Field>
          {Object.entries(sel).map(([itemId, x]: any) => {
            const it = d.items.find((i: any) => i.id === Number(itemId));
            const g = d.grid.find((g2: any) => g2.response.organization_id === x.orgId);
            return (
              <div key={itemId} className="row" style={{ marginBottom: 8 }}>
                <span style={{ flex: 1 }}>{it?.line_no}. {it?.description} → <b>{g?.response.org_name}</b></span>
                <input style={{ flex: 2 }} placeholder={t('justification')} value={x.justification || ''} disabled={buyerEval?.status === 'submitted'}
                  onChange={e => setSel(s => ({ ...s, [itemId]: { ...x, justification: e.target.value } }))} />
              </div>
            );
          })}
          <div className="row between mt16">
            <div className="bold" style={{ fontSize: 16 }}>{t('total')}: {fmtMoney(selTotal)} MNT</div>
            <div className="row">
              {buyerEval?.status !== 'submitted' && isBuyer && (<>
                <button className="btn sec" onClick={() => submitEval('buyer', false)}>{t('save')}</button>
                <button className="btn" onClick={() => submitEval('buyer', true)}>{t('submit')}</button>
              </>)}
              {buyerEval?.status === 'submitted' && isBuyer && (
                <button className="btn" onClick={requestAward}>🏆 {t('request_award')}</button>
              )}
            </div>
          </div>
          <p className="mut mt16">
            {lang === 'mn'
              ? 'DFA: >500 сая ₮ бол 3 шат, >100 сая ₮ бол 2 шат, бусад 1 шат. DD gate шаардлагатай бол шалгагдана.'
              : 'DFA: >500M MNT = 3 stages, >100M = 2 stages, else 1. DD gates are checked if required.'}
          </p>
        </Card>
      )}
    </>
  );
}
