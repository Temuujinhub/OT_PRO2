import React, { useEffect, useState } from 'react';
import { get, post, fmtDate } from '../../api';
import { useLang, useL } from '../../i18n';
import { Card, Tabs, Field, Spinner, StatusChip, useToast, Empty, Modal } from '../../ui';

const CATS = ['general', 'registration', 'tender', 'qualification', 'account'];

export default function Support() {
  const { t, lang } = useLang();
  const L = useL();
  const { toast } = useToast();
  const [tab, setTab] = useState('hub');
  const [articles, setArticles] = useState<any[]>([]);
  const [cat, setCat] = useState('');
  const [search, setSearch] = useState('');
  const [openArt, setOpenArt] = useState<any>(null);
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [tModal, setTModal] = useState(false);
  const [tf, setTf] = useState<any>({ severity: 3 });

  const loadArticles = () => {
    const p = new URLSearchParams();
    if (cat) p.set('category', cat);
    if (search) p.set('search', search);
    get(`/support/articles?${p}`).then(setArticles);
  };
  useEffect(() => { loadArticles(); }, [cat]);
  useEffect(() => { get('/support/tickets').then(setTickets); }, [tab]);

  const askAI = async () => {
    if (!question.trim()) return;
    setAiBusy(true); setAiAnswer(null);
    try { setAiAnswer(await post('/support/assistant', { question })); }
    catch { toast(t('error'), 'err'); }
    finally { setAiBusy(false); }
  };

  return (
    <>
      <h1>{t('nav_support')}</h1>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'hub', label: t('faq') },
        { key: 'ai', label: '🤖 AI' },
        { key: 'tickets', label: t('my_tickets'), count: tickets.filter((x: any) => !['resolved', 'closed'].includes(x.status)).length },
      ]} />

      {tab === 'hub' && (
        <>
          <div className="row mb16">
            <button className={`btn sm ${cat === '' ? '' : 'sec'}`} onClick={() => setCat('')}>{t('all')}</button>
            {CATS.map(c => <button key={c} className={`btn sm ${cat === c ? '' : 'sec'}`} onClick={() => setCat(c)}>{c}</button>)}
            <input placeholder={t('search')} style={{ maxWidth: 220 }} value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadArticles()} />
          </div>
          <div className="grid g2">
            {articles.map(a => (
              <Card key={a.id} className="mb0">
                <div style={{ cursor: 'pointer' }} onClick={() => setOpenArt(a)}>
                  <span className="chip gray">{a.category}</span>
                  <h3 style={{ marginTop: 8 }}>{L(a, 'title')}</h3>
                  <p className="mut">{L(a, 'body').slice(0, 130)}...</p>
                </div>
              </Card>
            ))}
          </div>
          {!articles.length && <Empty />}
        </>
      )}

      {tab === 'ai' && (
        <Card title={t('ask_ai')}>
          <p className="mut">{lang === 'mn' ? 'Supplier Hub AI туслах — бүртгэл, тендер, үнэлгээний талаар асууна уу.' : 'Supplier Hub AI assistant — ask about registration, tenders, qualification.'}</p>
          <div className="row">
            <input style={{ flex: 1 }} value={question} onChange={e => setQuestion(e.target.value)}
              placeholder={lang === 'mn' ? 'Жишээ: Тендерт яаж оролцох вэ?' : 'e.g. How do I participate in a tender?'}
              onKeyDown={e => e.key === 'Enter' && askAI()} />
            <button className="btn" onClick={askAI} disabled={aiBusy}>{aiBusy ? t('generating') : t('send')}</button>
          </div>
          {aiBusy && <Spinner />}
          {aiAnswer && (
            <div className="mt16">
              <div className="kb-answer">{aiAnswer.text}</div>
              <div className="mut" style={{ marginTop: 6 }}>{aiAnswer.source === 'claude' ? '🤖 Claude AI' : '📚 Knowledge base'}</div>
            </div>
          )}
        </Card>
      )}

      {tab === 'tickets' && (
        <>
          <div className="row end mb16"><button className="btn" onClick={() => setTModal(true)}>+ {t('create_ticket')}</button></div>
          {tickets.length ? (
            <Card tight>
              <table className="tbl">
                <thead><tr><th>№</th><th>{t('subject')}</th><th>Sev</th><th>{t('status')}</th><th>{t('date')}</th></tr></thead>
                <tbody>
                  {tickets.map(tk => (
                    <tr key={tk.id}>
                      <td className="bold">{tk.ticket_no}</td><td>{tk.subject}</td>
                      <td><span className={`chip ${tk.severity <= 2 ? 'red' : 'gray'}`}>S{tk.severity}</span></td>
                      <td><StatusChip s={tk.status} />
                        {['resolved', 'closed'].includes(tk.status) &&
                          <button className="btn ghost sm" onClick={async () => { await post(`/support/tickets/${tk.id}/reopen`); get('/support/tickets').then(setTickets); }}>↻</button>}
                      </td>
                      <td className="mut">{fmtDate(tk.created_at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : <Empty icon="🎫" />}
        </>
      )}

      {openArt && (
        <Modal title={L(openArt, 'title')} onClose={() => setOpenArt(null)} wide>
          <p style={{ whiteSpace: 'pre-wrap' }}>{L(openArt, 'body')}</p>
          <div className="row">
            <span className="mut">{lang === 'mn' ? 'Энэ нийтлэл тусалсан уу?' : 'Was this helpful?'}</span>
            <button className="btn sec sm" onClick={async () => { await post(`/support/articles/${openArt.id}/vote`, { helpful: true }); toast('✓', 'ok'); setOpenArt(null); }}>👍 {openArt.helpful}</button>
            <button className="btn sec sm" onClick={async () => { await post(`/support/articles/${openArt.id}/vote`, { helpful: false }); setOpenArt(null); }}>👎 {openArt.not_helpful}</button>
          </div>
        </Modal>
      )}

      {tModal && (
        <Modal title={t('create_ticket')} onClose={() => setTModal(false)}>
          <Field label={t('subject')} required><input value={tf.subject || ''} onChange={e => setTf({ ...tf, subject: e.target.value })} /></Field>
          <Field label={t('comment')} required><textarea value={tf.body || ''} onChange={e => setTf({ ...tf, body: e.target.value })} /></Field>
          <Field label={t('severity')} hint="1=Critical (2h), 2=High (4h), 3=Medium (2d), 4=Low (5d)">
            <select value={tf.severity} onChange={e => setTf({ ...tf, severity: Number(e.target.value) })}>
              <option value={1}>1 — Critical</option><option value={2}>2 — High</option>
              <option value={3}>3 — Medium</option><option value={4}>4 — Low</option>
            </select>
          </Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setTModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!tf.subject || !tf.body} onClick={async () => {
              const r = await post('/support/tickets', tf);
              toast(`✓ ${r.ticket_no}`, 'ok'); setTModal(false); setTf({ severity: 3 });
              get('/support/tickets').then(setTickets); setTab('tickets');
            }}>{t('submit')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
