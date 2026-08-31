import React, { useEffect, useState } from 'react';
import { get, post, download } from '../../api';
import { useLang } from '../../i18n';
import { Card, Spinner, useToast, DataTable, Empty } from '../../ui';

export default function AdmReports() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [defs, setDefs] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => { get('/reports/definitions').then(setDefs); }, []);

  const run = async (code: string) => {
    setActive(code); setReport(null); setAi(null); setBusy(true);
    try { setReport(await get(`/reports/run/${code}`)); }
    catch { toast(t('error'), 'err'); }
    finally { setBusy(false); }
  };

  const aiSummary = async () => {
    setAiBusy(true); setAi(null);
    try { setAi(await post(`/reports/run/${active}/ai-summary`, { lang })); }
    catch { toast(t('error'), 'err'); }
    finally { setAiBusy(false); }
  };

  return (
    <>
      <h1>{t('nav_reports')}</h1>
      <p className="mut mb16">{lang === 'mn' ? 'Тайлан сонгож ажиллуулаад Excel-ээр татах эсвэл AI хураангуй гаргана уу.' : 'Run a report, export to Excel, or generate an AI summary.'}</p>
      <div className="row mb16" style={{ gap: 8 }}>
        {defs.map(d => (
          <button key={d.code} className={`btn sm ${active === d.code ? '' : 'sec'}`} onClick={() => run(d.code)}>
            {lang === 'en' ? d.name_en : d.name_mn}
          </button>
        ))}
      </div>
      {busy && <Spinner />}
      {report && (
        <>
          <Card title={lang === 'en' ? report.name_en : report.name_mn} right={
            <div className="row">
              <button className="btn teal sm" onClick={aiSummary} disabled={aiBusy}>🤖 {aiBusy ? t('generating') : t('ai_summary')}</button>
              <button className="btn sec sm" onClick={() => download(`/reports/run/${active}/export.xlsx`, `${active}.xlsx`)}>⬇ {t('export_excel')}</button>
            </div>
          }>
            <p className="mut">{report.rows.length} rows · {report.generated_by} · {report.generated_at?.slice(0, 16).replace('T', ' ')}</p>
            {ai && (
              <div className="kb-answer mb16">
                <div className="bold" style={{ marginBottom: 6 }}>🤖 {t('ai_summary')} ({ai.source === 'claude' ? 'Claude AI' : 'built-in'})</div>
                {ai.text}
              </div>
            )}
            {aiBusy && <Spinner />}
            {report.rows.length ? (
              <DataTable rows={report.rows.slice(0, 100)} cols={Object.keys(report.rows[0]).map(k => ({
                key: k, label: k, num: typeof report.rows[0][k] === 'number',
                render: (r: any) => {
                  const v = r[k];
                  if (v === null || v === undefined) return '—';
                  if (typeof v === 'boolean') return v ? '✓' : '—';
                  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 16).replace('T', ' ');
                  if (typeof v === 'number') return v.toLocaleString();
                  return String(v);
                },
              }))} />
            ) : <Empty />}
            {report.rows.length > 100 && <p className="mut">... {lang === 'mn' ? `эхний 100 мөр (бүрэн тайланг Excel-ээс)` : 'first 100 rows shown (full report in Excel)'}</p>}
          </Card>
        </>
      )}
    </>
  );
}
