import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, post, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Spinner, StatusChip, useToast, Empty, Field, Modal } from '../../ui';

export default function Messages({ admin }: { admin?: boolean }) {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const base = user.userType === 'internal' ? '/admin/messages' : '/supplier/messages';
  const [threads, setThreads] = useState<any[] | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [body, setBody] = useState('');
  const [internalOnly, setInternalOnly] = useState(false);
  const [newModal, setNewModal] = useState(false);
  const [nt, setNt] = useState<any>({ subject: '', body: '' });

  const loadList = () => get('/comms/threads').then(setThreads);
  const loadThread = () => id && get(`/comms/threads/${id}`).then(setThread);
  useEffect(() => { loadList(); }, []);
  useEffect(() => { if (id) loadThread(); else setThread(null); }, [id]);

  const sendMsg = async () => {
    if (!body.trim()) return;
    await post(`/comms/threads/${id}/messages`, { body, internal_only: internalOnly });
    setBody(''); loadThread();
  };

  if (id && thread) {
    return (
      <>
        <button className="btn ghost" onClick={() => nav(base)}>← {t('back')}</button>
        <Card title={thread.thread.subject} right={<StatusChip s={thread.thread.status} />}>
          <div className="msg-thread">
            {thread.messages.map((m: any) => (
              <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'mine' : ''} ${m.internal_only ? 'internal' : ''}`}>
                <div className="who">{m.sender_name} {m.internal_only && '· 🔒 internal'} · {fmtDate(m.sent_at, true)}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
              </div>
            ))}
          </div>
          {thread.thread.status !== 'closed' && (
            <div className="mt16">
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={t('reply') + '...'} />
              <div className="row between" style={{ marginTop: 8 }}>
                {user.userType === 'internal'
                  ? <label className="checkbox"><input type="checkbox" checked={internalOnly} onChange={e => setInternalOnly(e.target.checked)} /> {t('internal_note')}</label>
                  : <span />}
                <div className="row">
                  {user.userType === 'internal' && (
                    <button className="btn sec" onClick={async () => { await post(`/comms/threads/${id}/close`); loadThread(); }}>{t('close')}</button>
                  )}
                  <button className="btn" onClick={sendMsg}>{t('send')}</button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="row between mb16">
        <h1>{t('nav_messages')}</h1>
        <button className="btn" onClick={() => setNewModal(true)}>+ {t('new_thread')}</button>
      </div>
      {!threads ? <Spinner /> : !threads.length ? <Empty icon="💬" /> : (
        <Card tight>
          <table className="tbl">
            <thead><tr><th>{t('subject')}</th><th>{lang === 'mn' ? 'Хам сэдэв' : 'Context'}</th><th>💬</th><th>{t('date')}</th><th>{t('status')}</th></tr></thead>
            <tbody>
              {threads.map(th => (
                <tr key={th.id} className="click" onClick={() => nav(`${base}/${th.id}`)}>
                  <td className="bold">{th.subject}</td>
                  <td className="mut">{th.tender_no || th.context_type}{user.userType === 'internal' && th.org_name ? ` · ${th.org_name}` : ''}</td>
                  <td>{th.message_count}</td>
                  <td className="mut">{fmtDate(th.last_at || th.created_at, true)}</td>
                  <td><StatusChip s={th.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {newModal && (
        <Modal title={t('new_thread')} onClose={() => setNewModal(false)}>
          <Field label={t('subject')} required><input value={nt.subject} onChange={e => setNt({ ...nt, subject: e.target.value })} /></Field>
          <Field label={t('comment')} required><textarea value={nt.body} onChange={e => setNt({ ...nt, body: e.target.value })} /></Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setNewModal(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!nt.subject || !nt.body} onClick={async () => {
              const th = await post('/comms/threads', { context_type: 'direct', ...nt });
              setNewModal(false); setNt({ subject: '', body: '' });
              toast('✓', 'ok'); nav(`${base}/${th.id}`); loadList();
            }}>{t('send')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
