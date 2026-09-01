import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Card, StatCard, Donut, Spinner, Empty } from '../../ui';

export default function AdmDashboard() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  useEffect(() => { get('/dashboard/admin').then(setD); }, []);
  if (!d) return <Spinner />;
  const mn = lang === 'mn';

  return (
    <>
      <h1>{t('nav_dashboard')}</h1>
      <p className="mut mb16">{mn ? 'Дотоод удирдлагын самбар' : 'Internal operations dashboard'}</p>

      <div className="grid g4 mb16">
        <StatCard icon="building" color="var(--blue)" value={d.suppliers.total} label={mn ? 'Нийт нийлүүлэгч' : 'Total suppliers'}
          sub={`${mn ? 'шинэ 30 хоног' : 'new 30d'}: ${d.suppliers.new_30d}`} />
        <StatCard icon="survey" color="var(--amber)" value={d.suppliers.pending_review} label={t('pending_review')} />
        <StatCard icon="clipboard" color="var(--orange)" value={d.tenders.open} label={mn ? 'Нээлттэй тендер' : 'Open tenders'}
          sub={`${mn ? 'удахгүй хаагдах' : 'closing soon'}: ${d.tenders.closing_soon}`} />
        <StatCard icon="check" color="var(--green)" value={d.approvals.length} label={mn ? 'Хүлээгдэж буй зөвшөөрөл' : 'Pending approvals'} />
      </div>
      <div className="grid g4 mb16">
        <StatCard icon="badge" color="var(--teal)" value={d.quals.submitted + d.quals.screening} label={mn ? 'Үнэлгээ хянагдаж буй' : 'Qualifications in review'} />
        <StatCard icon="chart" color="var(--purple)" value={d.tenders.evaluating} label={mn ? 'Үнэлгээний шатанд' : 'In evaluation'} />
        <StatCard icon="lifebuoy" color="var(--pink)" value={d.support.open} label={mn ? 'Нээлттэй тасалбар' : 'Open tickets'}
          sub={d.support.breached ? `⚠ SLA: ${d.support.breached}` : undefined} />
        <StatCard icon="shield" color="var(--red)" value={d.security.failed_logins_24h} label={mn ? 'Амжилтгүй нэвтрэлт (24ц)' : 'Failed logins (24h)'}
          sub={`${mn ? 'түгжигдсэн' : 'locked'}: ${d.security.locked_accounts}`} />
      </div>

      <div className="grid g3 mb16">
        <Card title={mn ? 'Нийлүүлэгчийн төлөв' : 'Supplier status'}>
          <Donut value={d.suppliers.approved} total={d.suppliers.total || 1} label={mn ? 'батлагдсан' : 'approved'} />
          <div className="donut-legend">
            <span className="k"><span className="dot" style={{ background: 'var(--orange)' }} />{mn ? 'Батлагдсан' : 'Approved'}: {d.suppliers.approved}</span>
            <span className="k"><span className="dot" style={{ background: 'var(--teal)' }} />{mn ? 'Бусад' : 'Other'}: {d.suppliers.total - d.suppliers.approved}</span>
          </div>
        </Card>
        <Card title={mn ? 'Тендерийн pipeline' : 'Tender pipeline'}>
          <Donut segments={[
            { v: d.tenders.draft, c: 'var(--ink-soft)' }, { v: d.tenders.open, c: 'var(--green)' },
            { v: d.tenders.evaluating, c: 'var(--purple)' }, { v: d.tenders.awarded, c: 'var(--orange)' },
          ]} value={d.tenders.open + d.tenders.evaluating} total={1} label={mn ? 'идэвхтэй' : 'active'} />
          <div className="donut-legend">
            <span className="k"><span className="dot" style={{ background: 'var(--ink-soft)' }} />Draft {d.tenders.draft}</span>
            <span className="k"><span className="dot" style={{ background: 'var(--green)' }} />Open {d.tenders.open}</span>
            <span className="k"><span className="dot" style={{ background: 'var(--purple)' }} />Eval {d.tenders.evaluating}</span>
            <span className="k"><span className="dot" style={{ background: 'var(--orange)' }} />Awarded {d.tenders.awarded}</span>
          </div>
        </Card>
        <Card title={mn ? 'Сарын бүртгэл' : 'Monthly registrations'}>
          <div className="bar-chart">
            {d.monthly.map((m: any) => {
              const max = Math.max(...d.monthly.map((x: any) => x.c), 1);
              return (
                <div key={m.month} className="bar-slot">
                  <div className="bar-col" title={`${m.month}: ${m.c}`}>
                    <span className="bar-val">{m.c}</span>
                    <div className="bar" style={{ height: `${Math.max(4, m.c / max * 120)}px` }} />
                  </div>
                  <div className="bar-lbl">{m.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card title={t('my_actions')}>
          {d.myActions.length ? d.myActions.map((a: any) => (
            <div key={a.id} className="row between" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => nav('/admin/approvals')}>
              <div><div className="bold">{a.label}</div><div className="mut">{a.stage_name}</div></div>
              <span className={`chip ${a.overdue ? 'red' : 'blue'}`}>{a.overdue ? t('overdue') : fmtDate(a.due_at)}</span>
            </div>
          )) : <Empty icon="🎉" text={mn ? 'Танд хүлээгдэж буй ажил алга' : 'No pending actions'} />}
        </Card>
        <Card title={mn ? 'Зөвшөөрлийн дараалал' : 'Approval queue'}>
          {d.approvals.length ? d.approvals.map((a: any) => (
            <div key={a.id} className="row between" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => nav('/admin/approvals')}>
              <div>
                <div className="bold">{a.entity_type} #{a.entity_id}</div>
                <div className="mut">{t('current_approver')}: {a.approver || '—'} · {a.age_hours}{t('hours_short')}</div>
              </div>
              <span className={`chip ${a.overdue ? 'red' : 'gray'}`}>{a.stage_name}</span>
            </div>
          )) : <Empty icon="✅" />}
        </Card>
      </div>
    </>
  );
}
