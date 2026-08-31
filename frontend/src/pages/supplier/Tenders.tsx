import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, fmtDate } from '../../api';
import { useLang } from '../../i18n';
import { Tabs, StatusChip, Spinner, Empty, Countdown, Card } from '../../ui';

const TYPE_TABS = ['', 'EOI', 'RFQ', 'RFQ_SERVICE', 'OEM', 'TRAVEL', 'FREIGHT', 'AUCTION'];

export default function SupTenders() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [type, setType] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => {
    const p = new URLSearchParams();
    if (type) p.set('type', type);
    if (filter !== 'all') p.set('filter', filter);
    if (search) p.set('search', search);
    get(`/tenders/supplier/list?${p}`).then(setRows);
  };
  useEffect(() => { load(); }, [type, filter]);

  return (
    <>
      <h1>{t('nav_tenders')}</h1>
      <Tabs active={type} onChange={setType}
        tabs={TYPE_TABS.map(k => ({ key: k, label: k === '' ? t('all') : k.replace('_SERVICE', ' Svc') }))} />
      <div className="row mb16">
        {['all', 'open', 'closed', 'invited', 'participated', 'draft', 'awarded'].map(f => (
          <button key={f} className={`btn sm ${filter === f ? '' : 'sec'}`} onClick={() => setFilter(f)}>
            {{ all: t('all'), open: t('open'), closed: t('closed'), invited: t('invited'), participated: t('participated'), draft: t('draft_bids'), awarded: 'Award' }[f]}
          </button>
        ))}
        <input placeholder={t('search') + '...'} style={{ maxWidth: 240 }} value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
      </div>
      {!rows ? <Spinner /> : !rows.length ? <Empty text={lang === 'mn' ? 'Тендер олдсонгүй — шүүлтүүрээ өөрчилж үзнэ үү' : 'No tenders found — adjust filters'} /> : (
        <div className="grid g2">
          {rows.map(r => (
            <Card key={r.id} className="mb0" >
              <div style={{ cursor: 'pointer' }} onClick={() => nav(`/supplier/tenders/${r.id}`)}>
                <div className="row between">
                  <span className="bold">{r.tender_no}</span>
                  <span className="chip blue">{r.type_code}</span>
                </div>
                <h3 style={{ margin: '6px 0' }}>{lang === 'en' && r.title_en ? r.title_en : r.title_mn}</h3>
                <div className="row between">
                  <StatusChip s={r.status === 'published' ? 'open' : r.status} />
                  {r.my_bid_status && <span className="mut">{t('my_bid')}: <StatusChip s={r.my_bid_status} /></span>}
                </div>
                <div className="row between mt16">
                  <span className="mut">{t('closes')}: {fmtDate(r.close_at, true)}</span>
                  {r.status === 'published' && <Countdown until={r.close_at} />}
                </div>
                {r.msg_count > 0 && <div className="mut" style={{ marginTop: 6 }}>💬 {r.msg_count}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
