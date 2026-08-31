import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, fmtDate, fmtMoney } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Tabs, StatusChip, Spinner, useToast, Empty, Modal, Field, ConfirmModal, Countdown } from '../../ui';

export default function AdmTenderOverview() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [dlModal, setDlModal] = useState(false);
  const [dl, setDl] = useState<any>({});
  const [cancelModal, setCancelModal] = useState(false);
  const [negModal, setNegModal] = useState(false);
  const [negF, setNegF] = useState<any>({ orgIds: [] });
  const [rounds, setRounds] = useState<any[]>([]);
  const [aucState, setAucState] = useState<any>(null);

  const load = () => {
    get(`/tenders/${id}`).then(setD);
    get(`/bids/negotiation/${id}/rounds`).then(setRounds).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (d?.auction) {
      const iv = setInterval(() => get(`/auction/${id}/state`).then(setAucState).catch(() => {}), 4000);
      get(`/auction/${id}/state`).then(setAucState).catch(() => {});
      return () => clearInterval(iv);
    }
  }, [d?.auction?.id]);
  if (!d) return <Spinner />;
  const T = d.tender;
  const canManage = ['Buyer', 'SystemAdmin'].includes(user.role);

  const act = async (path: string, body: any = {}, ok?: string) => {
    try { await post(path, body); toast(ok || '✓', 'ok'); load(); }
    catch (e: any) { toast(e.detail || e.code, 'err'); }
  };

  return (
    <>
      <button className="btn ghost" onClick={() => nav('/admin/tenders')}>← {t('back')}</button>
      <div className="row between mb16">
        <div>
          <h1>{T.tender_no} <span className="chip blue">{T.type_code}</span></h1>
          <div className="row"><StatusChip s={T.status} /><span className="mut">{T.title_mn}</span></div>
        </div>
        <div className="row">
          {['draft', 'pending_approval'].includes(T.status) && <Link to={`/admin/tenders/${id}/edit`} className="btn sec">{t('edit')}</Link>}
          {T.status === 'draft' && canManage && <Link to={`/admin/tenders/${id}/edit`} className="btn">{t('request_publish')}</Link>}
          {T.status === 'published' && canManage && (<>
            <button className="btn sec" onClick={() => setDlModal(true)}>{t('deadline_change')}</button>
            <button className="btn" onClick={() => act(`/tenders/${id}/close`)}>{t('close_tender')}</button>
          </>)}
          {T.status === 'closed' && canManage && <button className="btn" onClick={() => act(`/tenders/${id}/start-evaluation`)}>{t('start_evaluation')}</button>}
          {['in_evaluation', 'negotiation'].includes(T.status) && (<>
            <Link to={`/admin/tenders/${id}/comparison`} className="btn">{t('comparison')} →</Link>
            {canManage && <button className="btn teal" onClick={() => { setNegF({ orgIds: [] }); setNegModal(true); }}>{t('new_round')}</button>}
          </>)}
          {!['awarded', 'cancelled'].includes(T.status) && canManage && <button className="btn danger" onClick={() => setCancelModal(true)}>{t('cancel_tender')}</button>}
        </div>
      </div>

      <div className="grid g4 mb16">
        <Card className="mb0"><div className="mut">{t('invited')}</div><div style={{ fontSize: 24, fontWeight: 700 }}>{d.stats.invited}</div></Card>
        <Card className="mb0"><div className="mut">{lang === 'mn' ? 'Нээсэн' : 'Opened'}</div><div style={{ fontSize: 24, fontWeight: 700 }}>{d.stats.opened}</div></Card>
        <Card className="mb0"><div className="mut">{t('responded')}</div><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>{d.stats.submitted}</div></Card>
        <Card className="mb0"><div className="mut">{t('closes')}</div><div>{fmtDate(T.close_at, true)}</div>{T.status === 'published' && <Countdown until={T.close_at} />}</Card>
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'overview', label: t('details') },
        { key: 'suppliers', label: t('nav_suppliers'), count: d.invitations.length },
        { key: 'approvals', label: t('nav_approvals'), count: d.approvals.length },
        ...(rounds.length ? [{ key: 'negotiation', label: t('negotiation'), count: rounds.length }] : []),
        ...(d.auction ? [{ key: 'auction', label: '🔨 Auction' }] : []),
        ...(d.award ? [{ key: 'award', label: 'Award' }] : []),
        { key: 'log', label: t('timeline') },
      ]} />

      {tab === 'overview' && (
        <div className="grid g2">
          <Card title={t('wizard_main')}>
            <table className="tbl"><tbody>
              {[[t('title'), T.title_mn], ['EN', T.title_en], ['Buyer', T.buyer_name], ['End user', T.end_user_name],
                [lang === 'mn' ? 'Хэлтэс' : 'Dept', T.department], [t('categories'), T.category_name],
                [t('published'), fmtDate(T.publish_at, true)], [t('closes'), fmtDate(T.close_at, true)],
                [t('currency'), T.currency_policy], ['Partial / Alt', `${T.partial_allowed ? '✓' : '—'} / ${T.alternative_allowed ? '✓' : '—'}`],
                ['Qual / DD', `${T.qualification_required ? '✓' : '—'} / ${T.dd_required ? '✓' : '—'}`],
              ].map(([k, v], i) => <tr key={i}><td className="mut" style={{ width: 140 }}>{k}</td><td className="bold">{v || '—'}</td></tr>)}
            </tbody></table>
          </Card>
          <Card title={`${t('items')} (${T.items.length}) / ${t('requirements')} (${T.requirements.length})`}>
            {T.items.slice(0, 8).map((it: any) => (
              <div key={it.id} className="row between" style={{ marginBottom: 5 }}>
                <span>{it.line_no}. {it.description}</span><span className="mut">{Number(it.quantity)} {it.uom}</span>
              </div>
            ))}
            {T.items.length > 8 && <div className="mut">... +{T.items.length - 8}</div>}
            {T.requirements.map((rq: any) => (
              <div key={rq.id} className="mut" style={{ marginBottom: 4 }}>{rq.line_no}. {rq.label_mn} {rq.attachment_required && '📎'}</div>
            ))}
            {T.deadlineChanges.length > 0 && (<>
              <h3 className="mt16">{t('deadline_history')}</h3>
              {T.deadlineChanges.map((dc: any) => (
                <div key={dc.id} className="mut">{fmtDate(dc.created_at)}: → {fmtDate(dc.new_close_at, true)} ({dc.reason}) · ✉ {dc.notified_count}</div>
              ))}
            </>)}
          </Card>
        </div>
      )}

      {tab === 'suppliers' && (
        <Card tight>
          <table className="tbl">
            <thead><tr><th>{t('name')}</th><th>{lang === 'mn' ? 'Урилга' : 'Invitation'}</th><th>{t('my_bid')}</th><th>{t('risk')}</th></tr></thead>
            <tbody>
              {d.invitations.map((i: any) => (
                <tr key={i.id}>
                  <td className="bold">{i.org_name || `✉ ${i.external_email}`}<div className="mut">{i.registry_no}</div></td>
                  <td><StatusChip s={i.status} /></td>
                  <td>{i.bid_status ? <StatusChip s={i.bid_status} /> : '—'}</td>
                  <td>{i.risk_level ? <span className={`chip ${i.risk_level === 'high' ? 'red' : i.risk_level === 'medium' ? 'amber' : 'green'}`}>{i.risk_level}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'approvals' && (
        <Card>
          {d.approvals.length ? d.approvals.map((a: any) => (
            <div key={a.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10, marginBottom: 10 }}>
              <div className="row between">
                <span className="bold">{a.entity_type} #{a.id} {a.amount ? `· ${fmtMoney(a.amount, 'MNT')}` : ''}</span>
                <StatusChip s={a.status} />
              </div>
              <div className="row" style={{ marginTop: 6, gap: 6 }}>
                {(a.stages || []).map((s: any) => (
                  <span key={s.stage_no} className={`chip ${s.status === 'approved' ? 'green' : s.status === 'pending' ? 'blue' : s.status === 'rejected' ? 'red' : 'gray'}`}>
                    {s.stage_no}. {s.assignee || s.stage_name}: {s.status}
                  </span>
                ))}
              </div>
            </div>
          )) : <Empty icon="✍️" />}
        </Card>
      )}

      {tab === 'negotiation' && (
        <Card title={t('negotiation')}>
          {rounds.map(r => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10, marginBottom: 10 }}>
              <div className="row between">
                <span className="bold">Round {r.round_no} <StatusChip s={r.status} /></span>
                <div className="row">
                  <span className="mut">{fmtDate(r.opens_at, true)} → {fmtDate(r.closes_at, true)}</span>
                  {r.status === 'open' && canManage && (
                    <button className="btn sm danger" onClick={() => act(`/bids/negotiation/round/${r.id}/close`)}>{t('close')}</button>
                  )}
                </div>
              </div>
              <div className="mut">
                {lang === 'mn' ? 'Үнэ өсгөх' : 'Price increase'}: {r.price_increase_allowed ? `⚠ allowed (${r.scope_change_reason})` : '🚫 blocked'} ·
                {(r.participants || []).map((p: any) => ` org${p.organization_id}${p.submitted ? '✓' : '…'}`).join(', ')}
              </div>
            </div>
          ))}
        </Card>
      )}

      {tab === 'auction' && aucState && (
        <Card title={`🔨 ${aucState.auction.status}`}>
          <div className="grid g4 mb16">
            <div><div className="mut">Start</div><div className="bold">{fmtMoney(aucState.auction.start_price, aucState.auction.currency)}</div></div>
            <div><div className="mut">{t('current_best')}</div><div className="bold" style={{ color: 'var(--green)', fontSize: 18 }}>{fmtMoney(aucState.currentBest, aucState.auction.currency)}</div></div>
            <div><div className="mut">{t('min_decrement')}</div>{fmtMoney(aucState.auction.min_decrement)}</div>
            <div><div className="mut">{lang === 'mn' ? 'Дуусах' : 'Ends'}</div><Countdown until={aucState.auction.ends_at} /></div>
          </div>
          {canManage && (
            <div className="row mb16">
              {aucState.auction.status === 'live' && <button className="btn sec sm" onClick={() => act(`/auction/${id}/control`, { action: 'pause' })}>⏸ Pause</button>}
              {aucState.auction.status === 'paused' && <button className="btn sm" onClick={() => act(`/auction/${id}/control`, { action: 'resume' })}>▶ Resume</button>}
              {['live', 'paused'].includes(aucState.auction.status) && <button className="btn danger sm" onClick={() => act(`/auction/${id}/control`, { action: 'end' })}>⏹ End</button>}
            </div>
          )}
          <table className="tbl">
            <thead><tr><th>#</th><th>{lang === 'mn' ? 'Оролцогч' : 'Bidder'}</th><th className="num">{t('amount')}</th><th>{t('date')}</th></tr></thead>
            <tbody>{aucState.bids.map((b: any) => (
              <tr key={b.rank} className={b.rank === 1 ? 'hl-best' : ''}>
                <td>{b.rank}</td><td>{b.bidder}</td><td className="num">{fmtMoney(b.amount)}</td><td className="mut">{fmtDate(b.placed_at, true)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      {tab === 'award' && d.award && (
        <Card title={`Award v${d.award.version_no}`} right={<StatusChip s={d.award.status} />}>
          <div className="grid g3 mb16">
            <div><div className="mut">{t('total')}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoney(d.award.total_amount, d.award.currency)}</div></div>
            <div><div className="mut">{t('date')}</div>{fmtDate(d.award.issued_at, true)}</div>
            <div><div className="mut">{t('status')}</div><StatusChip s={d.award.status} /></div>
          </div>
          <pre style={{ background: 'var(--bg)', padding: 14, borderRadius: 10, whiteSpace: 'pre-wrap' }}>{d.award.letter_text}</pre>
          {d.award.status === 'issued' && canManage && (
            <button className="btn danger" onClick={async () => {
              const reason = prompt(`${t('reason')} (${t('cancel_award')})`);
              if (!reason) return;
              await act(`/approvals/award/${d.award.id}/request-cancel`, { reason_code: 'SUP_WITHDRAW', reason },
                lang === 'mn' ? 'Цуцлах хүсэлт илгээгдлээ (dual approval)' : 'Cancellation requested (dual approval)');
            }}>{t('cancel_award')}</button>
          )}
          {d.award.cancel_reason && <div className="banner">🚫 {d.award.cancel_reason}</div>}
        </Card>
      )}

      {tab === 'log' && (
        <Card>
          {d.events.map((e: any) => (
            <div key={e.id} className="row" style={{ marginBottom: 7 }}>
              <span className="mut" style={{ width: 135, flexShrink: 0 }}>{fmtDate(e.occurred_at, true)}</span>
              <span className="chip gray">{e.action}</span>
              <span className="mut">{e.actor_name} {e.reason ? `— ${e.reason}` : ''} {e.after_summary || ''}</span>
            </div>
          ))}
        </Card>
      )}

      {dlModal && (
        <Modal title={t('deadline_change')} onClose={() => setDlModal(false)}>
          <Field label={t('new_deadline')} required><input type="datetime-local" value={dl.new_close_at || ''} onChange={e => setDl({ ...dl, new_close_at: e.target.value })} /></Field>
          <Field label={t('reason')} required><textarea value={dl.reason || ''} onChange={e => setDl({ ...dl, reason: e.target.value })} /></Field>
          <p className="mut">✉ {lang === 'mn' ? 'Бүх уригдсан нийлүүлэгчид автоматаар мэдэгдэнэ (DEF-08 хяналт)' : 'All invited suppliers are notified automatically (DEF-08 control)'}</p>
          <div className="actions">
            <button className="btn sec" onClick={() => setDlModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!dl.new_close_at || !dl.reason} onClick={async () => {
              await act(`/tenders/${id}/deadline`, dl); setDlModal(false);
            }}>{t('confirm')}</button>
          </div>
        </Modal>
      )}

      {cancelModal && (
        <ConfirmModal title={t('cancel_tender')} text={T.tender_no} reasonRequired danger
          onYes={(reason: string) => { setCancelModal(false); act(`/tenders/${id}/cancel`, { reason }); }}
          onNo={() => setCancelModal(false)} />
      )}

      {negModal && (
        <Modal title={t('new_round')} onClose={() => setNegModal(false)}>
          <Field label={t('nav_suppliers')} required>
            {d.invitations.filter((i: any) => i.bid_status && !['draft', 'no_response'].includes(i.bid_status)).map((i: any) => (
              <label key={i.id} className="checkbox" style={{ marginBottom: 5 }}>
                <input type="checkbox" checked={negF.orgIds.includes(i.organization_id)}
                  onChange={e => setNegF({ ...negF, orgIds: e.target.checked ? [...negF.orgIds, i.organization_id] : negF.orgIds.filter((x: number) => x !== i.organization_id) })} />
                {i.org_name}
              </label>
            ))}
          </Field>
          <Field label={lang === 'mn' ? 'Хаагдах хугацаа' : 'Closes at'}><input type="datetime-local" value={negF.closes_at || ''} onChange={e => setNegF({ ...negF, closes_at: e.target.value })} /></Field>
          <label className="checkbox"><input type="checkbox" checked={!!negF.price_increase_allowed} onChange={e => setNegF({ ...negF, price_increase_allowed: e.target.checked })} /> {lang === 'mn' ? 'Үнэ өсгөхийг зөвшөөрөх (scope өөрчлөгдсөн үед л)' : 'Allow price increase (scope change only)'}</label>
          {negF.price_increase_allowed && (
            <Field label={lang === 'mn' ? 'Scope өөрчлөлтийн шалтгаан' : 'Scope change reason'} required>
              <textarea value={negF.scope_change_reason || ''} onChange={e => setNegF({ ...negF, scope_change_reason: e.target.value })} />
            </Field>
          )}
          <div className="actions">
            <button className="btn sec" onClick={() => setNegModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!negF.orgIds.length} onClick={async () => {
              await act(`/bids/negotiation/${id}/rounds`, negF); setNegModal(false);
            }}>{t('confirm')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
