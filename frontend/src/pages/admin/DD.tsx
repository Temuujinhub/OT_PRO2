import React, { useEffect, useState } from 'react';
import { get, post, download, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Card, Tabs, StatusChip, Spinner, useToast, Empty, Modal, Field, DataTable } from '../../ui';

export default function AdmDD() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [tab, setTab] = useState('cases');
  const [cases, setCases] = useState<any[] | null>(null);
  const [cois, setCois] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [openCase, setOpenCase] = useState<any>(null);
  const [newModal, setNewModal] = useState(false);
  const [coiModal, setCoiModal] = useState(false);
  const [nf, setNf] = useState<any>({ risk_tier: 'medium', source: 'supplier' });
  const [cf, setCf] = useState<any>({});
  const [decideF, setDecideF] = useState<any>(null);

  const load = () => {
    get('/dd/cases').then(setCases);
    get('/dd/coi').then(setCois);
    get('/suppliers').then(setOrgs);
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="row between mb16">
        <h1>Due Diligence & COI</h1>
        <div className="row">
          <button className="btn sec sm" onClick={() => download('/dd/report.xlsx', 'dd-coi-report.xlsx')}>⬇ {t('export_excel')}</button>
          <button className="btn teal sm" onClick={() => { setCf({}); setCoiModal(true); }}>+ {t('coi_decl')}</button>
          <button className="btn sm" onClick={() => { setNf({ risk_tier: 'medium', source: 'supplier' }); setNewModal(true); }}>+ {t('open_case')}</button>
        </div>
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'cases', label: 'DD ' + t('dd_case'), count: cases?.filter(c => c.status !== 'decided').length || 0 },
        { key: 'coi', label: t('coi_decl'), count: cois.filter(c => c.has_conflict && c.status === 'submitted').length },
      ]} />

      {tab === 'cases' && (!cases ? <Spinner /> : (
        <Card tight>
          <DataTable rows={cases} onRow={async r => setOpenCase(await get(`/dd/cases/${r.id}`))} cols={[
            { key: 'id', label: 'ID', render: r => `DD-${r.id}` },
            { key: 'org_name', label: t('nav_suppliers'), render: r => <><div className="bold">{r.org_name}</div><div className="mut">{r.registry_no}</div></> },
            { key: 'source', label: lang === 'mn' ? 'Эх үүсвэр' : 'Source' },
            { key: 'risk_tier', label: t('risk'), render: r => <span className={`chip ${r.risk_tier === 'high' ? 'red' : r.risk_tier === 'medium' ? 'amber' : 'green'}`}>{r.risk_tier}</span> },
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'decision', label: t('decision'), render: r => r.decision ? <StatusChip s={r.decision} /> : '—' },
            { key: 'analyst_name', label: 'Analyst' },
            { key: 'opened_at', label: t('date'), render: r => fmtDate(r.opened_at) },
          ]} />
        </Card>
      ))}

      {tab === 'coi' && (
        <Card tight>
          <DataTable rows={cois} cols={[
            { key: 'declarer', label: lang === 'mn' ? 'Мэдүүлэгч' : 'Declarer' },
            { key: 'tender_no', label: t('tender_no') },
            { key: 'org_name', label: t('nav_suppliers') },
            { key: 'has_conflict', label: 'COI', render: r => r.has_conflict ? <span className="chip red">⚠ {r.conflict_type}</span> : <span className="chip green">{lang === 'mn' ? 'Зөрчилгүй' : 'None'}</span> },
            { key: 'details', label: t('details') },
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'act', label: '', render: r => r.has_conflict && r.status === 'submitted' && (
              <div className="row">
                <button className="btn sm" onClick={async e => { e.stopPropagation(); await post(`/dd/coi/${r.id}/review`, { decision: 'cleared' }); load(); }}>{t('cleared')}</button>
                <button className="btn danger sm" onClick={async e => { e.stopPropagation(); await post(`/dd/coi/${r.id}/review`, { decision: 'blocked' }); load(); }}>{t('blocked')}</button>
              </div>
            ) },
          ]} />
        </Card>
      )}

      {openCase && (
        <Modal title={`DD-${openCase.case.id} — ${openCase.case.org_name}`} onClose={() => setOpenCase(null)} wide>
          <div className="row mb16">
            <StatusChip s={openCase.case.status} />
            <span className={`chip ${openCase.case.risk_tier === 'high' ? 'red' : 'amber'}`}>{openCase.case.risk_tier}</span>
            {openCase.case.khur_verified && <span className="chip teal">✓ ХУР</span>}
          </div>
          <h3>{t('shareholders')} / Beneficial owners</h3>
          {openCase.shareholders.length ? openCase.shareholders.map((s: any) => (
            <div key={s.id} className="row between" style={{ marginBottom: 4 }}>
              <span>{s.name} {s.beneficial_owner && '🔑'}</span><span>{Number(s.ownership_percent)}%</span>
            </div>
          )) : <p className="mut">—</p>}
          {openCase.cois.length > 0 && (<><h3 className="mt16">COI</h3>
            {openCase.cois.map((c: any) => (
              <div key={c.id} className="mut">{c.declarer}: {c.has_conflict ? `⚠ ${c.conflict_type} — ${c.details}` : '—'}</div>
            ))}</>)}
          {openCase.case.screening_notes && <p><b>{t('screening')}:</b> {openCase.case.screening_notes}</p>}
          {openCase.case.decision && <div className="banner">{t('decision')}: {openCase.case.decision} — {openCase.case.decision_reason}</div>}
          {openCase.case.status !== 'decided' && (
            <div className="actions">
              {openCase.case.status === 'open' && (
                <button className="btn teal" onClick={async () => {
                  const notes = prompt(t('screening') + ' notes') || '';
                  await post(`/dd/cases/${openCase.case.id}/screen`, { notes });
                  setOpenCase(null); load();
                }}>{t('screening')}</button>
              )}
              <button className="btn" onClick={() => setDecideF({ id: openCase.case.id, decision: 'cleared' })}>{t('cleared')}</button>
              <button className="btn sec" onClick={() => setDecideF({ id: openCase.case.id, decision: 'conditional' })}>Conditional</button>
              <button className="btn danger" onClick={() => setDecideF({ id: openCase.case.id, decision: 'blocked' })}>{t('blocked')}</button>
            </div>
          )}
        </Modal>
      )}

      {decideF && (
        <Modal title={`${t('decision')}: ${decideF.decision}`} onClose={() => setDecideF(null)}>
          <Field label={t('reason')} required><textarea value={decideF.reason || ''} onChange={e => setDecideF({ ...decideF, reason: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setDecideF(null)}>{t('cancel')}</button>
            <button className="btn" disabled={!decideF.reason} onClick={async () => {
              await post(`/dd/cases/${decideF.id}/decide`, decideF);
              toast('✓', 'ok'); setDecideF(null); setOpenCase(null); load();
            }}>{t('confirm')}</button>
          </div>
        </Modal>
      )}

      {newModal && (
        <Modal title={t('open_case')} onClose={() => setNewModal(false)}>
          <Field label={t('nav_suppliers')} required>
            <select value={nf.organization_id || ''} onChange={e => setNf({ ...nf, organization_id: Number(e.target.value) })}>
              <option value="">—</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name_mn}</option>)}
            </select>
          </Field>
          <div className="grid g2">
            <Field label={lang === 'mn' ? 'Эх үүсвэр' : 'Source'}>
              <select value={nf.source} onChange={e => setNf({ ...nf, source: e.target.value })}>
                <option value="supplier">supplier</option><option value="tender">tender</option><option value="award">award</option>
              </select>
            </Field>
            <Field label={t('risk')}>
              <select value={nf.risk_tier} onChange={e => setNf({ ...nf, risk_tier: e.target.value })}>
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
              </select>
            </Field>
          </div>
          <div className="actions">
            <button className="btn sec" onClick={() => setNewModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!nf.organization_id} onClick={async () => {
              await post('/dd/cases', nf); toast('✓', 'ok'); setNewModal(false); load();
            }}>{t('confirm')}</button>
          </div>
        </Modal>
      )}

      {coiModal && (
        <Modal title={t('coi_decl')} onClose={() => setCoiModal(false)}>
          <p className="mut">{lang === 'mn' ? 'Тендер/нийлүүлэгчтэй холбоотой ашиг сонирхлын зөрчлөө мэдүүлнэ үү.' : 'Declare any conflict of interest regarding a tender/supplier.'}</p>
          <Field label={t('nav_suppliers')}>
            <select value={cf.organization_id || ''} onChange={e => setCf({ ...cf, organization_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name_mn}</option>)}
            </select>
          </Field>
          <label className="checkbox field"><input type="checkbox" checked={!!cf.has_conflict} onChange={e => setCf({ ...cf, has_conflict: e.target.checked })} /> {lang === 'mn' ? 'Надад ашиг сонирхлын зөрчил БАЙНА' : 'I HAVE a conflict of interest'}</label>
          {cf.has_conflict && (<>
            <Field label={t('type')} required>
              <select value={cf.conflict_type || ''} onChange={e => setCf({ ...cf, conflict_type: e.target.value })}>
                <option value="">—</option>
                <option value="family">{lang === 'mn' ? 'Гэр бүлийн холбоо' : 'Family relation'}</option>
                <option value="financial">{lang === 'mn' ? 'Санхүүгийн сонирхол' : 'Financial interest'}</option>
                <option value="employment">{lang === 'mn' ? 'Өмнөх ажил' : 'Prior employment'}</option>
                <option value="other">{lang === 'mn' ? 'Бусад' : 'Other'}</option>
              </select>
            </Field>
            <Field label={t('details')} required><textarea value={cf.details || ''} onChange={e => setCf({ ...cf, details: e.target.value })} /></Field>
            <Field label="Mitigation"><textarea value={cf.mitigation || ''} onChange={e => setCf({ ...cf, mitigation: e.target.value })} /></Field>
          </>)}
          <div className="actions">
            <button className="btn sec" onClick={() => setCoiModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={cf.has_conflict && (!cf.conflict_type || !cf.details)} onClick={async () => {
              await post('/dd/coi', cf); toast('✓', 'ok'); setCoiModal(false); load();
            }}>{t('submit')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
