import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { Card, Tabs, Spinner, Empty } from '../../ui';

const ICONS: Record<string, string> = {
  invitation: '📋', deadline: '⏰', clarification: '💬', approval: '✍️', award: '🏆',
  regret: '📩', system: 'ℹ️', qualification: '✓', support: '🛟',
};

export default function Notifications() {
  const { t, lang } = useLang();
  const { setUnread } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('inapp');
  const [rows, setRows] = useState<any[] | null>(null);
  const [mails, setMails] = useState<any[] | null>(null);

  const load = () => {
    get('/comms/notifications').then(d => { setRows(d.notifications); setUnread(d.unread); });
    get('/comms/mailbox').then(setMails);
  };
  useEffect(() => { load(); }, []);

  const markAll = async () => { await post('/comms/notifications/read', {}); load(); };

  return (
    <>
      <div className="row between mb16">
        <h1>{t('nav_notifications')}</h1>
        <button className="btn sec sm" onClick={markAll}>{t('mark_read')}</button>
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'inapp', label: 'In-app', count: rows?.filter(r => !r.read_at).length || 0 },
        { key: 'mail', label: t('mailbox'), count: 0 },
      ]} />
      {tab === 'inapp' && (!rows ? <Spinner /> : !rows.length ? <Empty icon="🔔" /> : (
        <Card tight>
          {rows.map(n => (
            <div key={n.id} className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: n.read_at ? undefined : 'var(--orange-light)', cursor: n.link ? 'pointer' : 'default' }}
              onClick={async () => { await post('/comms/notifications/read', { ids: [n.id] }); if (n.link) nav(n.link); else load(); }}>
              <span style={{ fontSize: 20 }}>{ICONS[n.ntype] || 'ℹ️'}</span>
              <div style={{ flex: 1 }}>
                <div className="bold">{lang === 'en' && n.title_en ? n.title_en : n.title_mn}</div>
                <div className="mut">{lang === 'en' && n.body_en ? n.body_en : n.body_mn}</div>
              </div>
              <span className="mut">{fmtDate(n.created_at, true)}</span>
            </div>
          ))}
        </Card>
      ))}
      {tab === 'mail' && (!mails ? <Spinner /> : !mails.length ? <Empty icon="📧" /> : (
        <Card tight>
          {mails.map(m => (
            <div key={m.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
              <div className="row between"><span className="bold">📧 {m.subject}</span><span className="mut">{fmtDate(m.created_at, true)}</span></div>
              <div className="mut">To: {m.to_email}</div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 4, fontSize: 13 }}>{m.body}</div>
            </div>
          ))}
        </Card>
      ))}
    </>
  );
}
