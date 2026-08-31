import React, { useEffect, useState } from 'react';
import { get, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Card, Spinner, Donut, Empty, DataTable } from '../../ui';

export default function Kpi() {
  const { t, lang } = useLang();
  const [d, setD] = useState<any>(null);
  useEffect(() => { get('/suppliers/my/scores').then(setD); }, []);
  if (!d) return <Spinner />;
  const latest = d.scores[d.scores.length - 1];
  const max = 100;
  return (
    <>
      <h1>{t('nav_kpi')}</h1>
      <p className="mut mb16">{lang === 'mn'
        ? 'DIFOT = хугацаандаа, бүрэн гүйцэт нийлүүлсэн захиалгын хувь. Оноо PO/нийлүүлэлтийн өгөгдлөөс улирал тутам тооцогдоно.'
        : 'DIFOT = delivered in full, on time. Calculated quarterly from PO/delivery data.'}</p>
      {latest ? (
        <div className="grid g3 mb16">
          <Card title={`DIFOT (${latest.period})`}><Donut value={Number(latest.difot)} total={max} label="%" /></Card>
          <Card title={lang === 'mn' ? `Чанар (${latest.period})` : `Quality (${latest.period})`}><Donut value={Number(latest.quality_score)} total={max} label="%" color="var(--teal)" color2="var(--line)" /></Card>
          <Card title={lang === 'mn' ? 'Ерөнхий' : 'Overall'}><Donut value={Number(latest.overall)} total={max} label="%" color="var(--purple)" color2="var(--line)" /></Card>
        </div>
      ) : <Empty icon="📈" />}
      <Card title={lang === 'mn' ? 'Түүх' : 'History'}>
        <DataTable rows={d.scores} cols={[
          { key: 'period', label: lang === 'mn' ? 'Улирал' : 'Period' },
          { key: 'difot', label: 'DIFOT %', num: true },
          { key: 'quality_score', label: lang === 'mn' ? 'Чанар %' : 'Quality %', num: true },
          { key: 'overall', label: lang === 'mn' ? 'Ерөнхий %' : 'Overall %', num: true },
          { key: 'comment', label: t('comment') },
        ]} />
      </Card>
      <Card title={t('feedback')}>
        {d.feedback.length ? d.feedback.map((f: any) => (
          <div key={f.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 8 }}>
            <div className="row between"><span>{'⭐'.repeat(f.rating || 0)}</span><span className="mut">{fmtDate(f.created_at)}</span></div>
            <div>{f.comment}</div>
          </div>
        )) : <Empty icon="💬" />}
      </Card>
    </>
  );
}
