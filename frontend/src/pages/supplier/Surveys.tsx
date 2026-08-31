import React, { useEffect, useState } from 'react';
import { get, post } from '../../api';
import { useLang, useL } from '../../i18n';
import { Card, Spinner, useToast, Empty, Field } from '../../ui';

export default function Surveys() {
  const { t, lang } = useLang();
  const L = useL();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [answers, setAnswers] = useState<any>({});
  const load = () => get('/support/surveys').then(setRows);
  useEffect(() => { load(); }, []);
  if (!rows) return <Spinner />;

  if (open) {
    return (
      <Card title={L(open, 'title')}>
        {open.anonymous && <p className="mut">🔒 {lang === 'mn' ? 'Нэрээ нууцалсан судалгаа' : 'Anonymous survey'}</p>}
        {open.questions_json.map((qq: any) => (
          <Field key={qq.id} label={lang === 'en' ? (qq.label_en || qq.label_mn) : qq.label_mn}>
            {qq.type === 'rating' ? (
              <div className="row">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} className={`btn sm ${answers[qq.id] === n ? '' : 'sec'}`} onClick={() => setAnswers({ ...answers, [qq.id]: n })}>{n} ⭐</button>
                ))}
              </div>
            ) : (
              <textarea value={answers[qq.id] || ''} onChange={e => setAnswers({ ...answers, [qq.id]: e.target.value })} />
            )}
          </Field>
        ))}
        <div className="row end">
          <button className="btn sec" onClick={() => setOpen(null)}>{t('cancel')}</button>
          <button className="btn" onClick={async () => {
            try { await post(`/support/surveys/${open.id}/respond`, { answers }); toast('✓ ' + (lang === 'mn' ? 'Баярлалаа!' : 'Thank you!'), 'ok'); setOpen(null); load(); }
            catch (e: any) { toast(e.code === 'already_answered' ? (lang === 'mn' ? 'Та аль хэдийн хариулсан' : 'Already answered') : t('error'), 'err'); }
          }}>{t('submit')}</button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <h1>{t('nav_surveys')}</h1>
      {!rows.length ? <Empty icon="📝" /> : rows.map(s => (
        <Card key={s.id} title={L(s, 'title')} right={s.answered ? <span className="chip green">✓ {lang === 'mn' ? 'Хариулсан' : 'Answered'}</span> : null}>
          <div className="row between">
            <span className="mut">{s.questions_json.length} {lang === 'mn' ? 'асуулт' : 'questions'} {s.anonymous ? '· 🔒' : ''}</span>
            {!s.answered && <button className="btn" onClick={() => { setAnswers({}); setOpen(s); }}>{lang === 'mn' ? 'Оролцох' : 'Take survey'}</button>}
          </div>
        </Card>
      ))}
    </>
  );
}
