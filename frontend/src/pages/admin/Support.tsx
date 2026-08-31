import React, { useEffect, useState } from 'react';
import { get, post, put, fmtDate } from '../../api';
import { useLang, useL } from '../../i18n';
import { Card, Tabs, DataTable, StatusChip, Spinner, useToast, Modal, Field, Empty } from '../../ui';

export default function AdmSupport() {
  const { t, lang } = useLang();
  const L = useL();
  const { toast } = useToast();
  const [tab, setTab] = useState('tickets');
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [banner, setBanner] = useState('');
  const [artModal, setArtModal] = useState<any>(null);
  const [svModal, setSvModal] = useState(false);
  const [svResults, setSvResults] = useState<any>(null);
  const [sv, setSv] = useState<any>({ questions: [{ id: 'q1', type: 'rating', label_mn: '' }] });
  const [bcModal, setBcModal] = useState(false);
  const [bc, setBc] = useState<any>({ audience: 'all_suppliers' });

  const load = () => {
    get('/support/tickets').then(setTickets);
    get('/support/articles?all=true').then(setArticles);
    get('/support/surveys').then(setSurveys);
    get('/support/banner').then(d => setBanner(d.banner || ''));
    get('/admin/users?type=internal').then(setUsers);
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="row between mb16">
        <h1>{t('nav_support_admin')}</h1>
        <button className="btn teal" onClick={() => setBcModal(true)}>📢 {t('broadcast')}</button>
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'tickets', label: t('my_tickets'), count: tickets?.filter((x: any) => !['resolved', 'closed'].includes(x.status)).length || 0 },
        { key: 'articles', label: t('faq'), count: articles.length },
        { key: 'surveys', label: t('nav_surveys'), count: surveys.length },
        { key: 'banner', label: t('known_issue') },
      ]} />

      {tab === 'tickets' && (!tickets ? <Spinner /> : (
        <Card tight>
          <DataTable rows={tickets} cols={[
            { key: 'ticket_no', label: '№', render: r => <span className="bold">{r.ticket_no}</span> },
            { key: 'subject', label: t('subject'), render: r => <><div>{r.subject}</div><div className="mut">{r.org_name || r.creator_name}</div></> },
            { key: 'severity', label: 'Sev', render: r => <span className={`chip ${r.severity <= 2 ? 'red' : 'gray'}`}>S{r.severity}</span> },
            { key: 'status', label: t('status'), render: r => (
              <select value={r.status} onClick={e => e.stopPropagation()} onChange={async e => {
                await post(`/support/tickets/${r.id}/update`, { status: e.target.value }); load();
              }}>
                {['new', 'triaged', 'assigned', 'in_progress', 'waiting', 'resolved', 'closed', 'reopened'].map(s => <option key={s}>{s}</option>)}
              </select>
            ) },
            { key: 'assignee_name', label: 'Assignee', render: r => (
              <select value={r.assignee_id || ''} onClick={e => e.stopPropagation()} onChange={async e => {
                await post(`/support/tickets/${r.id}/update`, { assignee_id: Number(e.target.value) }); load();
              }}>
                <option value="">—</option>
                {users.filter(u => ['Support', 'SystemAdmin'].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            ) },
            { key: 'sla_due_at', label: 'SLA', render: r => r.sla_breached ? <span className="chip red">⚠ breached</span> : fmtDate(r.sla_due_at, true) },
            { key: 'created_at', label: t('date'), render: r => fmtDate(r.created_at, true) },
          ]} />
        </Card>
      ))}

      {tab === 'articles' && (
        <>
          <div className="row end mb16"><button className="btn" onClick={() => setArtModal({})}>+ {t('add')}</button></div>
          <Card tight>
            <DataTable rows={articles} onRow={r => setArtModal(r)} cols={[
              { key: 'title_mn', label: t('title'), render: r => <span className="bold">{L(r, 'title')}</span> },
              { key: 'category', label: t('categories'), render: r => <span className="chip gray">{r.category}</span> },
              { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
              { key: 'helpful', label: '👍', num: true }, { key: 'not_helpful', label: '👎', num: true },
              { key: 'updated_at', label: t('date'), render: r => fmtDate(r.updated_at) },
            ]} />
          </Card>
        </>
      )}

      {tab === 'surveys' && (
        <>
          <div className="row end mb16"><button className="btn" onClick={() => setSvModal(true)}>+ {t('publish_survey')}</button></div>
          <Card tight>
            <DataTable rows={surveys} cols={[
              { key: 'title_mn', label: t('title'), render: r => <span className="bold">{L(r, 'title')}</span> },
              { key: 'status', label: t('status'), render: r => <StatusChip s={r.status} /> },
              { key: 'anonymous', label: '🔒', render: r => r.anonymous ? '✓' : '—' },
              { key: 'responses', label: t('results'), num: true },
              { key: 'act', label: '', render: r => (
                <div className="row">
                  <button className="btn sec sm" onClick={async e => { e.stopPropagation(); setSvResults(await get(`/support/surveys/${r.id}/results`)); }}>{t('results')}</button>
                  {r.status === 'open' && <button className="btn ghost sm" onClick={async e => { e.stopPropagation(); await post(`/support/surveys/${r.id}/close`); load(); }}>{t('close')}</button>}
                </div>
              ) },
            ]} />
          </Card>
        </>
      )}

      {tab === 'banner' && (
        <Card title={t('known_issue')}>
          <Field label={lang === 'mn' ? 'Бүх хэрэглэгчид харагдах мэдээлэл (хоосон бол нуугдана)' : 'Shown to all users (empty = hidden)'}>
            <textarea value={banner} onChange={e => setBanner(e.target.value)} />
          </Field>
          <button className="btn" onClick={async () => { await put('/support/banner', { text: banner }); toast(t('saved'), 'ok'); }}>{t('save')}</button>
        </Card>
      )}

      {artModal !== null && (
        <Modal title={artModal.id ? t('edit') : t('add')} onClose={() => setArtModal(null)} wide>
          <div className="grid g2">
            <Field label={`${t('title')} (МН)`} required><input value={artModal.title_mn || ''} onChange={e => setArtModal({ ...artModal, title_mn: e.target.value })} /></Field>
            <Field label="(EN)"><input value={artModal.title_en || ''} onChange={e => setArtModal({ ...artModal, title_en: e.target.value })} /></Field>
          </div>
          <div className="grid g2">
            <Field label={t('categories')}>
              <select value={artModal.category || 'general'} onChange={e => setArtModal({ ...artModal, category: e.target.value })}>
                {['general', 'registration', 'tender', 'qualification', 'account'].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t('status')}>
              <select value={artModal.status || 'published'} onChange={e => setArtModal({ ...artModal, status: e.target.value })}>
                {['draft', 'published', 'retired'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="МН" required><textarea style={{ minHeight: 120 }} value={artModal.body_mn || ''} onChange={e => setArtModal({ ...artModal, body_mn: e.target.value })} /></Field>
          <Field label="EN"><textarea style={{ minHeight: 120 }} value={artModal.body_en || ''} onChange={e => setArtModal({ ...artModal, body_en: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setArtModal(null)}>{t('cancel')}</button>
            <button className="btn" disabled={!artModal.title_mn || !artModal.body_mn} onClick={async () => {
              if (artModal.id) await put(`/support/articles/${artModal.id}`, artModal);
              else await post('/support/articles', artModal);
              setArtModal(null); load(); toast(t('saved'), 'ok');
            }}>{t('save')}</button>
          </div>
        </Modal>
      )}

      {svModal && (
        <Modal title={t('publish_survey')} onClose={() => setSvModal(false)} wide>
          <div className="grid g2">
            <Field label={`${t('title')} (МН)`} required><input value={sv.title_mn || ''} onChange={e => setSv({ ...sv, title_mn: e.target.value })} /></Field>
            <Field label="(EN)"><input value={sv.title_en || ''} onChange={e => setSv({ ...sv, title_en: e.target.value })} /></Field>
          </div>
          <label className="checkbox field"><input type="checkbox" checked={!!sv.anonymous} onChange={e => setSv({ ...sv, anonymous: e.target.checked })} /> {lang === 'mn' ? 'Нэрээ нууцалсан' : 'Anonymous'}</label>
          {sv.questions.map((qq: any, i: number) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <select style={{ width: 110 }} value={qq.type} onChange={e => setSv({ ...sv, questions: sv.questions.map((y: any, j: number) => j === i ? { ...y, type: e.target.value } : y) })}>
                <option value="rating">rating</option><option value="text">text</option>
              </select>
              <input style={{ flex: 1 }} placeholder={lang === 'mn' ? 'Асуулт (МН)' : 'Question (MN)'} value={qq.label_mn || ''}
                onChange={e => setSv({ ...sv, questions: sv.questions.map((y: any, j: number) => j === i ? { ...y, label_mn: e.target.value } : y) })} />
              <button className="btn ghost sm" onClick={() => setSv({ ...sv, questions: sv.questions.filter((_: any, j: number) => j !== i) })}>🗑</button>
            </div>
          ))}
          <button className="btn sec sm" onClick={() => setSv({ ...sv, questions: [...sv.questions, { id: `q${sv.questions.length + 1}`, type: 'rating', label_mn: '' }] })}>+ {t('add')}</button>
          <div className="actions">
            <button className="btn sec" onClick={() => setSvModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!sv.title_mn} onClick={async () => {
              await post('/support/surveys', sv); setSvModal(false); setSv({ questions: [{ id: 'q1', type: 'rating', label_mn: '' }] }); load(); toast('✓', 'ok');
            }}>{t('publish_survey')}</button>
          </div>
        </Modal>
      )}

      {svResults && (
        <Modal title={`${t('results')}: ${L(svResults.survey, 'title')}`} onClose={() => setSvResults(null)} wide>
          <p className="mut">{svResults.responses.length} {lang === 'mn' ? 'хариулт' : 'responses'}</p>
          {svResults.survey.questions_json.map((qq: any) => {
            const vals = svResults.responses.map((r: any) => r.answers_json[qq.id]).filter((v: any) => v !== undefined && v !== '');
            return (
              <div key={qq.id} className="mb16">
                <div className="bold">{qq.label_mn}</div>
                {qq.type === 'rating' ? (
                  <div>{lang === 'mn' ? 'Дундаж' : 'Average'}: <b>{vals.length ? (vals.reduce((a: number, b: number) => a + Number(b), 0) / vals.length).toFixed(1) : '—'}</b> ⭐ ({vals.length})</div>
                ) : vals.map((v: any, i: number) => <div key={i} className="mut">• {v}</div>)}
              </div>
            );
          })}
        </Modal>
      )}

      {bcModal && (
        <Modal title={t('broadcast')} onClose={() => setBcModal(false)}>
          <Field label={t('audience')}>
            <select value={bc.audience} onChange={e => setBc({ ...bc, audience: e.target.value })}>
              <option value="all_suppliers">{lang === 'mn' ? 'Бүх нийлүүлэгч' : 'All suppliers'}</option>
              <option value="approved_suppliers">{lang === 'mn' ? 'Батлагдсан нийлүүлэгч' : 'Approved suppliers'}</option>
              <option value="internal">{lang === 'mn' ? 'Дотоод хэрэглэгчид' : 'Internal users'}</option>
            </select>
          </Field>
          <div className="grid g2">
            <Field label={`${t('title')} (МН)`} required><input value={bc.title_mn || ''} onChange={e => setBc({ ...bc, title_mn: e.target.value })} /></Field>
            <Field label="(EN)"><input value={bc.title_en || ''} onChange={e => setBc({ ...bc, title_en: e.target.value })} /></Field>
          </div>
          <Field label={`${t('comment')} (МН)`} required><textarea value={bc.body_mn || ''} onChange={e => setBc({ ...bc, body_mn: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setBcModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!bc.title_mn || !bc.body_mn} onClick={async () => {
              const r = await post('/comms/broadcast', bc);
              toast(`✓ ${r.recipients} ${lang === 'mn' ? 'хүлээн авагч' : 'recipients'}`, 'ok');
              setBcModal(false); setBc({ audience: 'all_suppliers' });
            }}>{t('send')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
