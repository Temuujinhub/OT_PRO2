import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, fmtDate } from '../../api';
import { useLang, useL } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Tabs, StatusChip, Spinner, useToast, Empty, ConfirmModal, DataTable, Field, Modal } from '../../ui';

export default function AdmSupplierDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const L = useL();
  const { toast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState('profile');
  const [action, setAction] = useState<string | null>(null);
  const [scoreModal, setScoreModal] = useState(false);
  const [sf, setSf] = useState<any>({});

  const load = () => get(`/suppliers/${id}`).then(setD);
  useEffect(() => { load(); }, [id]);
  if (!d) return <Spinner />;
  const canReview = ['Compliance', 'SystemAdmin'].includes(user.role);

  const doReview = async (decision: string, reason: string) => {
    setAction(null);
    try {
      await post(`/suppliers/${id}/review`, { decision, comment: reason });
      toast('✓', 'ok'); load();
    } catch (e: any) { toast(e.code, 'err'); }
  };
  const doRestrict = async (rtype: string, reason: string) => {
    setAction(null);
    await post(`/suppliers/${id}/restrict`, { rtype, reason });
    toast('✓', 'ok'); load();
  };

  return (
    <>
      <button className="btn ghost" onClick={() => nav('/admin/suppliers')}>← {t('back')}</button>
      <div className="row between mb16">
        <div>
          <h1>{d.org.name_mn}</h1>
          <div className="row">
            <StatusChip s={d.org.status} />
            {d.org.khur_verified && <span className="chip teal">✓ ХУР</span>}
            <span className="mut">{d.org.registry_no} · {d.org.vendor_no || 'vendor №—'} · v{d.org.profile_version}</span>
          </div>
        </div>
        <div className="row">
          {canReview && ['submitted', 'under_review'].includes(d.org.status) && (<>
            <button className="btn" onClick={() => doReview('approve', '')}>{t('approve')}</button>
            <button className="btn sec" onClick={() => setAction('needs_correction')}>{t('needs_correction')}</button>
            <button className="btn danger" onClick={() => setAction('reject')}>{t('reject')}</button>
          </>)}
          {canReview && d.org.status === 'approved' && (<>
            <button className="btn sec" onClick={() => setAction('suspend')}>{t('suspend')}</button>
            <button className="btn danger" onClick={() => setAction('blacklist')}>{t('blacklist')}</button>
          </>)}
          {canReview && ['suspended', 'blacklisted'].includes(d.org.status) && (
            <button className="btn" onClick={async () => { await post(`/suppliers/${id}/reactivate`, { reason: 'admin decision' }); toast('✓', 'ok'); load(); }}>{t('reactivate')}</button>
          )}
        </div>
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'profile', label: t('general_info') },
        { key: 'qual', label: t('nav_qualification'), count: d.quals.length },
        { key: 'bids', label: lang === 'mn' ? 'Саналууд' : 'Bids', count: d.bids.length },
        { key: 'dd', label: 'DD/COI', count: d.ddCases.length },
        { key: 'scores', label: t('scores'), count: d.scores.length },
        { key: 'timeline', label: t('timeline') },
      ]} />

      {tab === 'profile' && (
        <div className="grid g2">
          <Card title={t('general_info')}>
            <table className="tbl"><tbody>
              {[
                [t('company_name_en'), d.org.name_en], [t('registry_no'), d.org.registry_no],
                ['Vendor №', d.org.vendor_no], [lang === 'mn' ? 'Харьяалал' : 'Residency', d.org.residency],
                [t('phone'), d.profile?.phone], ['Website', d.profile?.website],
                [t('address'), [d.profile?.address_province, d.profile?.address_district, d.profile?.address_line1].filter(Boolean).join(', ')],
                [t('total_employees'), d.profile?.total_employees], [t('umnugovi_employees'), d.profile?.umnugovi_employees],
                [lang === 'mn' ? 'Банк' : 'Bank', d.profile?.bank_name], ['ТТД', d.profile?.tax_number],
              ].map(([k, v], i) => <tr key={i}><td className="mut" style={{ width: 180 }}>{k}</td><td className="bold">{v || '—'}</td></tr>)}
            </tbody></table>
          </Card>
          <div>
            <Card title={t('categories')}>
              {d.categories?.length ? (
                <div className="row" style={{ gap: 6 }}>
                  {d.categories.map((c: any) => (
                    <span key={c.id} className="chip orange">{c.code} · {lang === 'en' ? (c.name_en || c.name_mn) : c.name_mn}</span>
                  ))}
                </div>
              ) : <Empty icon="🏷" text={lang === 'mn' ? 'Ангилал сонгоогүй' : 'No categories selected'} />}
            </Card>
            <Card title={t('team')}>
              {d.contacts.map((c: any) => (
                <div key={c.id} className="row between" style={{ marginBottom: 6 }}>
                  <span>{c.full_name} <span className="mut">({c.position || c.contact_type})</span></span>
                  <span className="mut">{c.email}</span>
                </div>
              ))}
            </Card>
            <Card title={t('shareholders')}>
              {d.shareholders.length ? d.shareholders.map((s: any) => (
                <div key={s.id} className="row between" style={{ marginBottom: 6 }}>
                  <span>{s.name}{s.beneficial_owner && ' 🔑'}</span><span className="bold">{Number(s.ownership_percent)}%</span>
                </div>
              )) : <Empty />}
            </Card>
            <Card title={t('permits')}>
              {d.permits.length ? d.permits.map((p: any) => (
                <div key={p.id} className="row between" style={{ marginBottom: 6 }}>
                  <span>{p.permit_type} {p.number}</span>
                  <span className="mut">{p.expires_on ? `→ ${p.expires_on.slice(0, 10)}` : ''}</span>
                </div>
              )) : <Empty />}
            </Card>
          </div>
        </div>
      )}

      {tab === 'qual' && (
        <Card tight>
          <DataTable rows={d.quals} onRow={r => nav(`/admin/qualification/${r.id}`)} cols={[
            { key: 'program_name', label: lang === 'mn' ? 'Хөтөлбөр' : 'Program' },
            { key: 'version_no', label: 'v' },
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'risk_score', label: t('risk'), num: true },
            { key: 'submitted_at', label: t('date'), render: r => fmtDate(r.submitted_at) },
            { key: 'expires_on', label: t('expires_on'), render: r => fmtDate(r.expires_on) },
          ]} />
        </Card>
      )}

      {tab === 'bids' && (
        <Card tight>
          <DataTable rows={d.bids} onRow={r => nav(`/admin/tenders/${r.tender_id}`)} cols={[
            { key: 'tender_no', label: t('tender_no') },
            { key: 'title_mn', label: t('title') },
            { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
            { key: 'current_revision', label: t('revision'), render: r => `v${r.current_revision}` },
            { key: 'submitted_at', label: t('date'), render: r => fmtDate(r.submitted_at, true) },
          ]} />
        </Card>
      )}

      {tab === 'dd' && (
        <Card right={<Link className="btn sm" to="/admin/dd">{t('open_case')} →</Link>}>
          {d.ddCases.length ? d.ddCases.map((c: any) => (
            <div key={c.id} className="row between" style={{ marginBottom: 8 }}>
              <div><span className="bold">DD-{c.id}</span> <span className="mut">({c.source}, {c.risk_tier})</span></div>
              <div className="row"><StatusChip s={c.status} />{c.decision && <StatusChip s={c.decision} />}</div>
            </div>
          )) : <Empty icon="🛡" />}
        </Card>
      )}

      {tab === 'scores' && (
        <Card right={<button className="btn sm" onClick={() => { setSf({}); setScoreModal(true); }}>+ {t('add')}</button>}>
          <DataTable rows={d.scores} cols={[
            { key: 'period', label: lang === 'mn' ? 'Улирал' : 'Period' },
            { key: 'difot', label: 'DIFOT', num: true }, { key: 'quality_score', label: 'Quality', num: true },
            { key: 'overall', label: 'Overall', num: true }, { key: 'comment', label: t('comment') },
          ]} />
        </Card>
      )}

      {tab === 'timeline' && (
        <Card>
          {d.timeline.map((e: any) => (
            <div key={e.id} className="row" style={{ marginBottom: 8 }}>
              <span className="mut" style={{ width: 140, flexShrink: 0 }}>{fmtDate(e.occurred_at, true)}</span>
              <span className="chip gray">{e.action}</span>
              <span className="mut">{e.actor_name} {e.reason ? `— ${e.reason}` : ''} {e.after_summary ? `→ ${e.after_summary}` : ''}</span>
            </div>
          ))}
        </Card>
      )}

      {action && (
        <ConfirmModal title={t(action === 'reject' ? 'reject' : action === 'suspend' ? 'suspend' : action === 'blacklist' ? 'blacklist' : 'needs_correction')}
          text={d.org.name_mn} reasonRequired danger={action !== 'needs_correction'}
          onYes={(reason: string) => ['suspend', 'blacklist'].includes(action) ? doRestrict(action, reason) : doReview(action, reason)}
          onNo={() => setAction(null)} />
      )}

      {scoreModal && (
        <Modal title={`KPI — ${d.org.name_mn}`} onClose={() => setScoreModal(false)}>
          <Field label={lang === 'mn' ? 'Улирал (2026-Q3)' : 'Period (2026-Q3)'} required>
            <input value={sf.period || ''} onChange={e => setSf({ ...sf, period: e.target.value })} placeholder="2026-Q3" />
          </Field>
          <div className="grid g2">
            <Field label="DIFOT %"><input type="number" value={sf.difot || ''} onChange={e => setSf({ ...sf, difot: e.target.value })} /></Field>
            <Field label="Quality %"><input type="number" value={sf.quality_score || ''} onChange={e => setSf({ ...sf, quality_score: e.target.value })} /></Field>
          </div>
          <Field label={t('comment')}><textarea value={sf.comment || ''} onChange={e => setSf({ ...sf, comment: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setScoreModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!sf.period} onClick={async () => {
              await post(`/suppliers/${id}/scores`, sf); setScoreModal(false); toast('✓', 'ok'); load();
            }}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
