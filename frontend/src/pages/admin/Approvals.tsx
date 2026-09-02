import React, { useEffect, useState } from 'react';
import { get, post, fmtDate, fmtMoney } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Tabs, StatusChip, Spinner, useToast, Empty, Modal, Field } from '../../ui';

export default function AdmApprovals() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('mine');
  const [rows, setRows] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [decision, setDecision] = useState<any>(null); // {type, reason}
  const [users, setUsers] = useState<any[]>([]);
  const [delegateTo, setDelegateTo] = useState('');

  const load = () => {
    get(`/approvals/queue?mine=${tab === 'mine'}`).then(setRows);
    get('/approvals/history').then(setHistory);
  };
  useEffect(() => { setRows(null); load(); get('/admin/users?type=internal').then(setUsers); }, [tab]);

  const openDetail = async (r: any) => setDetail(await get(`/approvals/${r.id}`));

  const decide = async (dtype: string, reason: string) => {
    try {
      const r = await post(`/approvals/${detail.approval.id}/decide`, { decision: dtype, reason });
      toast(r.completed ? '✓ ' + (lang === 'mn' ? 'Бүрэн батлагдлаа — үйлдэл гүйцэтгэгдлээ' : 'Fully approved — action executed') : '✓', 'ok');
      setDecision(null); setDetail(null); load();
    } catch (e: any) {
      toast(e.code === 'sod_violation' ? e.payload?.message : e.code === 'not_your_stage' ? (lang === 'mn' ? 'Энэ шат таных биш' : 'Not your stage') : e.code, 'err');
    }
  };

  return (
    <>
      <h1>{t('nav_approvals')}</h1>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'mine', label: t('my_actions'), count: tab === 'mine' ? rows?.length || 0 : undefined },
        { key: 'all', label: t('all') },
        { key: 'history', label: t('timeline') },
      ]} />

      {tab !== 'history' && (!rows ? <Spinner /> : !rows.length ? <Empty icon="✅" text={lang === 'mn' ? 'Хүлээгдэж буй зөвшөөрөл алга' : 'No pending approvals'} /> : (
        <Card tight>
          <table className="tbl">
            <thead><tr>
              <th>{t('details')}</th><th>{t('amount')}</th><th>{t('stage')}</th><th>{t('current_approver')}</th>
              <th>{t('age')}</th><th>{lang === 'mn' ? 'Дуусах' : 'Due'}</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.stage_id} className="click" onClick={() => openDetail(r)}>
                  <td><span className="chip purple">{r.entity_type}</span> <span className="bold">{r.entity_label}</span></td>
                  <td className="num">{r.amount ? fmtMoney(r.amount, r.currency) : '—'}
                    {r.converted_amount && <div className="mut">≈ {fmtMoney(r.converted_amount)} USD @{Number(r.rate).toFixed(2)}</div>}</td>
                  <td>{r.stage_no}/{r.total_stages} {r.stage_name}</td>
                  <td>{r.assignee_name}</td>
                  <td className="num">{r.age_hours}h</td>
                  <td>{r.overdue ? <span className="chip red">{t('overdue')}</span> : fmtDate(r.due_at, true)}</td>
                  <td><button className="btn sm">{t('view')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      {tab === 'history' && (
        <Card tight>
          {history.map(h => (
            <div key={h.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
              <div className="row between">
                <span><span className="chip purple">{h.entity_type}</span> <b>{h.entity_label}</b> {h.amount ? `· ${fmtMoney(h.amount, h.currency)}` : ''}</span>
                <StatusChip s={h.status} />
              </div>
              <div className="row" style={{ marginTop: 5, gap: 5 }}>
                {(h.stages || []).map((s: any) => (
                  <span key={s.stage_no} className={`chip ${s.status === 'approved' ? 'green' : s.status === 'rejected' ? 'red' : 'gray'}`}>
                    {s.stage_no}. {s.assignee}: {s.status}{s.decision_reason ? ` (${s.decision_reason})` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {detail && (
        <Modal title={`${detail.approval.entity_type} #${detail.approval.id}`} onClose={() => setDetail(null)} wide>
          {detail.detail && (
            <>
              <h3>{detail.detail.tender_no} — {detail.detail.title_mn}</h3>
              {detail.approval.amount && (
                <p><b>{t('amount')}:</b> {fmtMoney(detail.approval.amount, detail.approval.currency)}
                  {detail.approval.converted_amount && <span className="mut"> ≈ {fmtMoney(detail.approval.converted_amount)} USD (@{Number(detail.approval.rate).toFixed(2)}, {detail.approval.rate_date?.slice(0, 10)})</span>}
                </p>
              )}
              {detail.detail.end_user_recommendation && <p><b>{t('eu_evaluation')}:</b> {detail.detail.end_user_recommendation}</p>}
              {detail.detail.buyer_recommendation && <p><b>{t('buyer_evaluation')}:</b> {detail.detail.buyer_recommendation}</p>}
              {detail.detail.selections?.length > 0 && (
                <table className="tbl mb16">
                  <thead><tr><th>#</th><th>{t('items')}</th><th>{t('nav_suppliers')}</th><th className="num">{t('amount')}</th></tr></thead>
                  <tbody>
                    {detail.detail.selections.map((s: any) => (
                      <tr key={s.id}><td>{s.line_no}</td><td>{s.description}</td><td className="bold">{s.org_name}</td><td className="num">{fmtMoney(s.amount, s.currency)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          <h3>{t('stage')}</h3>
          {detail.stages.map((s: any) => (
            <div key={s.id} className="row between" style={{ marginBottom: 6 }}>
              <span>{s.stage_no}. {s.stage_name} — {s.assignee_name}</span>
              <span className="row">
                <StatusChip s={s.status} />
                {s.decision_reason && <span className="mut">{s.decision_reason}</span>}
              </span>
            </div>
          ))}
          {(() => {
            const cur = (detail.stages || []).find((s: any) => s.status === 'pending');
            const isMine = !!cur && (cur.assignee_id === user.id || user.role === 'SystemAdmin');
            if (detail.approval.status === 'pending' && !isMine) return (
              <div className="banner mt16">
                {lang === 'mn'
                  ? `Энэ шат ${cur?.assignee_name || '—'}-д хуваарилагдсан тул та шийдвэрлэх боломжгүй.`
                  : `This stage is assigned to ${cur?.assignee_name || '—'}, so you cannot decide on it.`}
              </div>
            );
            return null;
          })()}
          {detail.approval.status === 'pending' && ((detail.stages || []).find((s: any) => s.status === 'pending')?.assignee_id === user.id || user.role === 'SystemAdmin') && (
            <div className="actions">
              <select style={{ maxWidth: 200 }} value={delegateTo} onChange={e => setDelegateTo(e.target.value)}>
                <option value="">{t('delegate')}...</option>
                {users.filter(u => u.id !== user.id && ['Approver', 'Buyer', 'SystemAdmin'].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
              {delegateTo && <button className="btn sec" onClick={async () => {
                const reason = prompt(t('reason')) || 'delegation';
                await post(`/approvals/${detail.approval.id}/delegate`, { toUserId: Number(delegateTo), reason });
                toast('✓', 'ok'); setDetail(null); load();
              }}>{t('delegate')}</button>}
              <button className="btn sec" onClick={() => setDecision({ type: 'return' })}>{t('return_stage')}</button>
              <button className="btn danger" onClick={() => setDecision({ type: 'reject' })}>{t('reject_stage')}</button>
              <button className="btn" onClick={() => decide('approve', '')}>{t('approve_stage')}</button>
            </div>
          )}
        </Modal>
      )}

      {decision && (
        <Modal title={t(decision.type === 'reject' ? 'reject_stage' : 'return_stage')} onClose={() => setDecision(null)}>
          <Field label={t('reason')} required><textarea value={decision.reason || ''} onChange={e => setDecision({ ...decision, reason: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setDecision(null)}>{t('cancel')}</button>
            <button className="btn danger" disabled={!decision.reason} onClick={() => decide(decision.type, decision.reason)}>{t('confirm')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
