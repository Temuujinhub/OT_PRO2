import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, fmtDate } from '../../api';
import { useLang, useL } from '../../i18n';
import { Card, StatCard, Donut, Spinner, StatusChip, Progress, Empty } from '../../ui';

export default function SupDashboard() {
  const { t, lang } = useLang();
  const L = useL();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  useEffect(() => { get('/dashboard/supplier').then(setD).catch(() => {}); }, []);
  if (!d) return <Spinner />;

  const sumBy = (k: string) => d.tenderStats.reduce((a: number, s: any) => a + Number(s[k] || 0), 0);
  const totalInvited = sumBy('total'), open = sumBy('open'), responded = sumBy('responded');
  const latestScore = d.scores.length ? d.scores[d.scores.length - 1] : null;

  return (
    <>
      <h1>{t('nav_dashboard')}</h1>
      <p className="mut mb16">{d.org.name_mn} · <StatusChip s={d.org.status} /></p>

      <div className="grid g4 mb16">
        <StatCard icon="📋" color="var(--orange)" value={totalInvited} label={lang === 'mn' ? 'Нийт уригдсан тендер' : 'Total invited tenders'} />
        <StatCard icon="⏳" color="var(--teal)" value={open} label={lang === 'mn' ? 'Нээлттэй тендер' : 'Open tenders'} />
        <StatCard icon="✅" color="var(--green)" value={responded} label={t('responded')} />
        <StatCard icon="🏆" color="var(--purple)" value={d.awards.filter((a: any) => a.status === 'awarded').length} label="Award" />
      </div>

      <div className="grid g3 mb16">
        <Card title={lang === 'mn' ? 'Оролцоо' : 'Participation'}>
          <Donut value={responded} total={totalInvited || 1} label={lang === 'mn' ? 'хариу өгсөн' : 'responded'} />
          <div className="donut-legend">
            <span className="k"><span className="dot" style={{ background: 'var(--orange)' }} />{t('responded')}: {responded}</span>
            <span className="k"><span className="dot" style={{ background: 'var(--teal)' }} />{t('invited')}: {totalInvited}</span>
          </div>
        </Card>
        <Card title={t('profile_completion')}>
          <Donut value={d.org.completion_percent} total={100} label="%" color="var(--teal)" color2="var(--line)" />
          <Progress pct={d.org.completion_percent} />
          {d.org.completion_percent < 100 && (
            <p className="mut" style={{ marginTop: 8 }}>
              {t('next_action')}: <Link to="/supplier/profile">{lang === 'mn' ? 'Профайлаа гүйцээх' : 'Complete your profile'} →</Link>
            </p>
          )}
        </Card>
        <Card title={t('qual_status')}>
          {d.quals.length ? d.quals.map((qq: any, i: number) => (
            <div key={i} className="row between" style={{ marginBottom: 8 }}>
              <span>{L(qq, 'name')}</span><StatusChip s={qq.status} />
            </div>
          )) : <Empty icon="🗂" text={lang === 'mn' ? 'Үнэлгээ эхлээгүй' : 'Not started'} />}
          <p className="mut"><Link to="/supplier/qualification">{t('view_all')} →</Link></p>
        </Card>
      </div>

      <div className="grid g2">
        <Card title={t('deadlines_72')}>
          {d.deadlines.length ? d.deadlines.map((x: any) => (
            <div key={x.id} className="row between" style={{ marginBottom: 9, cursor: 'pointer' }} onClick={() => nav(`/supplier/tenders/${x.id}`)}>
              <div>
                <div className="bold">{x.tender_no}</div>
                <div className="mut">{lang === 'en' && x.title_en ? x.title_en : x.title_mn}</div>
              </div>
              <span className={`chip ${x.hours_left <= 24 ? 'red' : x.hours_left <= 48 ? 'amber' : 'teal'}`}>{x.hours_left} {t('hours_short')}</span>
            </div>
          )) : <Empty icon="🌤" text={lang === 'mn' ? 'Ойрын хугацаанд хаагдах тендер алга' : 'No tenders closing soon'} />}
        </Card>
        <Card title={t('draft_bids')}>
          {d.drafts.length ? d.drafts.map((x: any) => (
            <div key={x.id} className="row between" style={{ marginBottom: 9, cursor: 'pointer' }} onClick={() => nav(`/supplier/tenders/${x.id}`)}>
              <div><div className="bold">{x.tender_no}</div><div className="mut">{x.title_mn}</div></div>
              <span className="chip amber">{t('closes')}: {fmtDate(x.close_at)}</span>
            </div>
          )) : <Empty icon="📝" text={lang === 'mn' ? 'Ноорог санал алга — нээлттэй тендерээс сонгоно уу' : 'No drafts — pick an open tender'} />}
        </Card>
      </div>

      <div className="grid g2 mt16">
        <Card title={t('recent_results')}>
          {d.awards.length ? d.awards.map((x: any) => (
            <div key={x.id} className="row between" style={{ marginBottom: 9, cursor: 'pointer' }} onClick={() => nav(`/supplier/tenders/${x.id}`)}>
              <div><div className="bold">{x.tender_no}</div><div className="mut">{x.title_mn}</div></div>
              <StatusChip s={x.status} />
            </div>
          )) : <Empty icon="🏁" />}
        </Card>
        <Card title="KPI / DIFOT">
          {latestScore ? (
            <>
              <div className="grid g2">
                <Donut value={Number(latestScore.difot)} total={100} label="DIFOT %" size={120} />
                <Donut value={Number(latestScore.overall)} total={100} label={lang === 'mn' ? 'Ерөнхий' : 'Overall'} size={120} color="var(--teal)" color2="var(--line)" />
              </div>
              <p className="mut" style={{ textAlign: 'center' }}>{latestScore.period} · <Link to="/supplier/kpi">{t('view_all')} →</Link></p>
            </>
          ) : <Empty icon="📈" text={lang === 'mn' ? 'KPI оноо хараахан алга' : 'No KPI scores yet'} />}
        </Card>
      </div>
    </>
  );
}
