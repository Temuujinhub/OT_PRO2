import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, fmtDate } from '../../api';
import { useLang, useL } from '../../i18n';
import { Card, StatusChip, Spinner, useToast, Empty } from '../../ui';

export default function SupQualification() {
  const { t, lang } = useLang();
  const L = useL();
  const { toast } = useToast();
  const nav = useNavigate();
  const [programs, setPrograms] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = () => Promise.all([get('/qualification/programs'), get('/qualification/my')])
    .then(([p, m]) => { setPrograms(p); setMine(m); setLoaded(true); });
  useEffect(() => { load(); }, []);
  if (!loaded) return <Spinner />;

  const start = async (programId: number) => {
    try {
      const sub = await post(`/qualification/my/start/${programId}`);
      nav(`/supplier/qualification/${sub.id}`);
    } catch (e: any) {
      toast(e.code === 'already_in_review' ? (lang === 'mn' ? 'Хянагдаж байна — шинээр эхлүүлэх боломжгүй' : 'Already in review') : t('error'), 'err');
    }
  };

  return (
    <>
      <h1>{t('nav_qualification')}</h1>
      <p className="mut mb16">{lang === 'mn'
        ? 'Санхүү, Ёс зүй/ХН, Байгаль орчин, ХАБЭА гэсэн бүлгүүдээр үнэлгээ бөглөж илгээнэ. Батлагдсан үнэлгээ 1 жил хүчинтэй.'
        : 'Complete Finance, Ethics/HR, Environment and HSE sections. Approval is valid for one year.'}</p>
      <div className="grid g2">
        {programs.map(p => {
          const subs = mine.filter(m => m.program_id === p.id);
          const latest = subs[0];
          return (
            <Card key={p.id} title={L(p, 'name')}>
              <p className="mut">{p.ptype}</p>
              {latest ? (
                <>
                  <div className="row between mb16">
                    <StatusChip s={latest.status} />
                    <span className="mut">v{latest.version_no} · {fmtDate(latest.submitted_at || latest.created_at)}</span>
                  </div>
                  {latest.decision_comment && <div className="banner">{latest.decision_comment}</div>}
                  {latest.status === 'approved' && latest.expires_on && (
                    <p className="mut">{t('expires_on')}: {fmtDate(latest.expires_on)}</p>
                  )}
                  <div className="row">
                    {['draft', 'needs_improvement'].includes(latest.status) && (
                      <button className="btn" onClick={() => nav(`/supplier/qualification/${latest.id}`)}>{t('continue_qual')}</button>
                    )}
                    {['submitted', 'screening', 'approved', 'rejected'].includes(latest.status) && (
                      <button className="btn sec" onClick={() => nav(`/supplier/qualification/${latest.id}`)}>{t('view')}</button>
                    )}
                    {['approved', 'rejected', 'expired'].includes(latest.status) && (
                      <button className="btn sec" onClick={() => start(p.id)}>{lang === 'mn' ? 'Дахин үнэлгээ' : 'Re-qualify'}</button>
                    )}
                  </div>
                </>
              ) : (
                <button className="btn" onClick={() => start(p.id)}>{t('start_qual')}</button>
              )}
              {subs.length > 1 && (
                <p className="mut" style={{ marginTop: 10 }}>
                  {lang === 'mn' ? 'Өмнөх хувилбарууд' : 'Previous versions'}: {subs.slice(1).map(s => `v${s.version_no} (${s.status})`).join(', ')}
                </p>
              )}
            </Card>
          );
        })}
      </div>
      {!programs.length && <Empty />}
    </>
  );
}
