import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, put, post, uploadFile } from '../../api';
import { useLang, useL } from '../../i18n';
import { Card, Field, Spinner, StatusChip, useToast, Progress, ConfirmModal } from '../../ui';

export default function SupQualForm() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const L = useL();
  const { toast } = useToast();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [sec, setSec] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [errs, setErrs] = useState<any[]>([]);
  const dirty = useRef(false);

  useEffect(() => {
    get(`/qualification/my/submission/${id}`).then(d => {
      setData(d);
      const map: Record<number, any> = {};
      d.answers.forEach((a: any) => map[a.question_id] = a);
      setAnswers(map);
    });
  }, [id]);

  // autosave every 4s when dirty
  useEffect(() => {
    const iv = setInterval(() => {
      if (!dirty.current || !data) return;
      dirty.current = false;
      saveAll(false);
    }, 4000);
    return () => clearInterval(iv);
  });

  if (!data) return <Spinner />;
  const editable = ['draft', 'needs_improvement'].includes(data.submission.status);
  const sections = data.sections;
  const section = sections[sec];

  const setAns = (qid: number, patch: any) => {
    if (!editable) return;
    setAnswers(a => ({ ...a, [qid]: { ...a[qid], question_id: qid, ...patch } }));
    dirty.current = true;
  };

  const saveAll = async (loud = true) => {
    const list = Object.values(answers);
    await put(`/qualification/my/submission/${id}/answers`, { answers: list }).catch(() => {});
    if (loud) toast(t('autosaved'), 'ok');
  };

  const submit = async () => {
    setConfirm(false);
    await saveAll(false);
    try {
      await post(`/qualification/my/submission/${id}/submit`);
      toast(t('submit') + ' ✓', 'ok');
      nav('/supplier/qualification');
    } catch (e: any) {
      if (e.code === 'required_missing') { setErrs(e.payload.questions); toast(t('required_missing'), 'err'); }
      else if (e.code === 'evidence_missing') { setErrs(e.payload.questions); toast(t('evidence_missing'), 'err'); }
      else toast(t('error'), 'err');
    }
  };

  const answered = (qq: any) => {
    const a = answers[qq.id];
    return a && (a.value_text != null && a.value_text !== '' || a.value_number != null || a.value_bool != null || a.value_date || a.attachment_id);
  };
  const totalQ = sections.reduce((n: number, s: any) => n + s.questions.length, 0);
  const doneQ = sections.reduce((n: number, s: any) => n + s.questions.filter(answered).length, 0);
  const review = (qid: number) => data.reviews?.find((r: any) => r.question_id === qid);

  return (
    <>
      <div className="row between mb16">
        <div>
          <h1>{L(data.program, 'name')}</h1>
          <div className="row"><StatusChip s={data.submission.status} /><span className="mut">v{data.submission.version_no}</span></div>
        </div>
        <div style={{ width: 240 }}>
          <div className="mut">{doneQ}/{totalQ}</div>
          <Progress pct={totalQ ? doneQ / totalQ * 100 : 0} />
        </div>
      </div>
      {errs.length > 0 && (
        <div className="banner">⚠ {t('required_missing')}: {errs.map((e: any) => e.code).join(', ')}</div>
      )}
      {data.submission.decision_comment && <div className="banner">💬 {data.submission.decision_comment}</div>}

      <div className="wizard-steps">
        {sections.map((s: any, i: number) => (
          <div key={s.id} className={`wstep ${i === sec ? 'active' : s.questions.every(answered) ? 'done' : ''}`} onClick={() => setSec(i)}>
            {L(s, 'title')} ({s.questions.filter(answered).length}/{s.questions.length})
          </div>
        ))}
      </div>

      <Card title={L(section, 'title')}>
        {section.questions.map((qq: any) => {
          const a = answers[qq.id] || {};
          const rv = review(qq.id);
          return (
            <div key={qq.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 12 }}>
              <Field label={<>{L(qq, 'label')} {qq.required && <span className="req">*</span>} {qq.evidence_required && <span className="chip amber">📎 {lang === 'mn' ? 'нотолгоо' : 'evidence'}</span>}</>}
                hint={qq.guidance_mn && lang === 'mn' ? qq.guidance_mn : undefined}>
                {qq.qtype === 'text' && <textarea disabled={!editable} value={a.value_text || ''} onChange={e => setAns(qq.id, { value_text: e.target.value })} />}
                {(qq.qtype === 'number' || qq.qtype === 'money') && (
                  <input type="number" disabled={!editable} value={a.value_number ?? ''} onChange={e => setAns(qq.id, { value_number: e.target.value === '' ? null : Number(e.target.value) })} />
                )}
                {qq.qtype === 'date' && <input type="date" disabled={!editable} value={a.value_date?.slice(0, 10) || ''} onChange={e => setAns(qq.id, { value_date: e.target.value })} />}
                {qq.qtype === 'yesno' && (
                  <div className="row">
                    <button type="button" className={`btn sm ${a.value_bool === true ? '' : 'sec'}`} disabled={!editable} onClick={() => setAns(qq.id, { value_bool: true })}>{t('yes')}</button>
                    <button type="button" className={`btn sm ${a.value_bool === false ? 'danger' : 'sec'}`} disabled={!editable} onClick={() => setAns(qq.id, { value_bool: false })}>{t('no')}</button>
                  </div>
                )}
                {qq.qtype === 'single' && qq.options_json && (
                  <select disabled={!editable} value={a.value_text || ''} onChange={e => setAns(qq.id, { value_text: e.target.value })}>
                    <option value="">—</option>
                    {qq.options_json.map((o: any) => <option key={o.v} value={o.v}>{lang === 'en' ? o.en : o.mn}</option>)}
                  </select>
                )}
                {(qq.evidence_required || qq.qtype === 'attachment') && editable && (
                  <div style={{ marginTop: 6 }}>
                    <input type="file" onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const att = await uploadFile(file, 'qualification', data.submission.id);
                        setAns(qq.id, { attachment_id: att.id });
                        toast(`📎 ${file.name}`, 'ok');
                      } catch (err: any) { toast(err.code === 'file_too_large' ? 'Max 10MB' : err.code, 'err'); }
                    }} />
                    {a.attachment_id && <span className="chip green">📎 {lang === 'mn' ? 'хавсаргасан' : 'attached'}</span>}
                  </div>
                )}
              </Field>
              {rv && rv.result && (
                <div className={`chip ${rv.result === 'pass' ? 'green' : rv.result === 'fail' ? 'red' : 'amber'}`}>
                  {rv.result}{rv.comment ? `: ${rv.comment}` : ''}
                </div>
              )}
            </div>
          );
        })}
        <div className="row between">
          <div className="row">
            <button className="btn sec" disabled={sec === 0} onClick={() => setSec(s => s - 1)}>← {t('back')}</button>
            <button className="btn sec" disabled={sec === sections.length - 1} onClick={() => setSec(s => s + 1)}>{t('next')} →</button>
          </div>
          {editable && (
            <div className="row">
              <button className="btn sec" onClick={() => saveAll(true)}>{t('save')}</button>
              <button className="btn" onClick={() => setConfirm(true)}>{t('submit')}</button>
            </div>
          )}
        </div>
      </Card>

      {confirm && <ConfirmModal title={t('submit')} text={t('qual_submit_confirm')} onYes={submit} onNo={() => setConfirm(false)} />}
    </>
  );
}
