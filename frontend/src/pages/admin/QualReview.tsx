import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, post, put, fmtDate, fmtMoney } from '../../api';
import { useLang, useL } from '../../i18n';
import { Card, Spinner, StatusChip, useToast, ConfirmModal, Field } from '../../ui';

export default function AdmQualReview() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const L = useL();
  const { toast } = useToast();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [decideModal, setDecideModal] = useState<string | null>(null);
  const [risk, setRisk] = useState('');

  const load = () => get(`/qualification/review/${id}`).then(x => { setD(x); setRisk(x.submission.risk_score || ''); });
  useEffect(() => { load(); }, [id]);
  if (!d) return <Spinner />;
  const sub = d.submission;
  const inReview = ['submitted', 'screening'].includes(sub.status);
  const ansFor = (qid: number) => d.answers.find((a: any) => a.question_id === qid);
  const revFor = (qid: number) => d.reviews.find((r: any) => r.question_id === qid);
  const failCount = d.reviews.filter((r: any) => r.result === 'fail').length;

  const setReview = async (qid: number, result: string | null, comment?: string) => {
    await put(`/qualification/review/${id}/question/${qid}`, { result, comment });
    load();
  };

  const decide = async (decision: string, reason: string) => {
    setDecideModal(null);
    try {
      await post(`/qualification/review/${id}/decide`, { decision, comment: reason, risk_score: risk ? Number(risk) : null });
      toast('✓', 'ok'); nav('/admin/qualification');
    } catch (e: any) {
      toast(e.code === 'unresolved_failures' ? `${lang === 'mn' ? 'Fail асуултууд байна' : 'Unresolved failed questions'}: ${e.detail}` : e.code, 'err');
    }
  };

  const fmtVal = (qq: any, a: any) => {
    if (!a) return <span className="chip red">{lang === 'mn' ? 'хоосон' : 'empty'}</span>;
    if (qq.qtype === 'yesno') return a.value_bool === true ? t('yes') : a.value_bool === false ? t('no') : '—';
    if (qq.qtype === 'money') return fmtMoney(a.value_number, 'MNT');
    if (qq.qtype === 'number') return a.value_number ?? '—';
    if (qq.qtype === 'date') return a.value_date?.slice(0, 10) || '—';
    return a.value_text || '—';
  };

  return (
    <>
      <button className="btn ghost" onClick={() => nav('/admin/qualification')}>← {t('back')}</button>
      <div className="row between mb16">
        <div>
          <h1>{d.org_name || sub.org_name}</h1>
          <div className="row"><StatusChip s={sub.status} /><span className="mut">{L(d.program, 'name')} · v{sub.version_no} · {fmtDate(sub.submitted_at, true)}</span></div>
        </div>
        <div className="row">
          {sub.status === 'submitted' && <button className="btn teal" onClick={async () => { await post(`/qualification/review/${id}/start`); load(); }}>{t('screening')}</button>}
          {inReview && (<>
            <input type="number" placeholder="Risk 0-100" style={{ width: 110 }} value={risk} onChange={e => setRisk(e.target.value)} />
            <button className="btn" disabled={failCount > 0} onClick={() => setDecideModal('approve')}>{t('approve')}</button>
            <button className="btn sec" onClick={() => setDecideModal('needs_improvement')}>{t('needs_correction')}</button>
            <button className="btn danger" onClick={() => setDecideModal('reject')}>{t('reject')}</button>
          </>)}
        </div>
      </div>
      {failCount > 0 && <div className="banner">⚠ {failCount} fail — {lang === 'mn' ? 'батлахын өмнө шийдвэрлэнэ үү' : 'resolve before approving'}</div>}
      {sub.decision_comment && <div className="banner">💬 {sub.decision_comment}</div>}

      {d.sections.map((s: any) => (
        <Card key={s.id} title={L(s, 'title')}>
          {s.questions.map((qq: any) => {
            const a = ansFor(qq.id);
            const rv = revFor(qq.id);
            return (
              <div key={qq.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
                <div className="row between">
                  <div style={{ flex: 1 }}>
                    <div className="mut">{L(qq, 'label')} {qq.required && <span className="req">*</span>}</div>
                    <div className="bold" style={{ marginTop: 3 }}>{fmtVal(qq, a)}</div>
                    {a?.attachment_id && <span className="chip teal">📎 attachment #{a.attachment_id}</span>}
                  </div>
                  {inReview && (
                    <div className="row" style={{ flexShrink: 0 }}>
                      <button className={`btn sm ${rv?.result === 'pass' ? '' : 'sec'}`} onClick={() => setReview(qq.id, rv?.result === 'pass' ? null : 'pass')}>✓</button>
                      <button className={`btn sm ${rv?.result === 'fail' ? 'danger' : 'sec'}`} onClick={() => {
                        const c = rv?.result === 'fail' ? undefined : prompt(t('comment')) || '';
                        setReview(qq.id, rv?.result === 'fail' ? null : 'fail', c);
                      }}>✗</button>
                    </div>
                  )}
                  {!inReview && rv?.result && <span className={`chip ${rv.result === 'pass' ? 'green' : 'red'}`}>{rv.result}</span>}
                </div>
                {rv?.comment && <div className="mut" style={{ marginTop: 4 }}>💬 {rv.comment}</div>}
              </div>
            );
          })}
        </Card>
      ))}

      {d.previous.length > 0 && (
        <Card title={lang === 'mn' ? 'Өмнөх хувилбарууд' : 'Previous versions'}>
          {d.previous.map((p: any) => (
            <div key={p.id} className="row between" style={{ marginBottom: 6 }}>
              <span>v{p.version_no} · {fmtDate(p.submitted_at)}</span><StatusChip s={p.status} />
            </div>
          ))}
        </Card>
      )}

      {decideModal && (
        <ConfirmModal title={t(decideModal === 'approve' ? 'approve' : decideModal === 'reject' ? 'reject' : 'needs_correction')}
          text={d.org_name || ''} reasonRequired={decideModal !== 'approve'} danger={decideModal === 'reject'}
          onYes={(reason: string) => decide(decideModal, reason)} onNo={() => setDecideModal(null)} />
      )}
    </>
  );
}
