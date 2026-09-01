import React, { useEffect, useState } from 'react';
import { get, put, post } from '../../api';
import { useLang } from '../../i18n';
import { Card, Spinner, useToast, Field, Modal } from '../../ui';

export default function AdmTranslations() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [addLang, setAddLang] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [newKey, setNewKey] = useState('');

  const load = () => get('/admin/translations').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <Spinner />;

  const langs: string[] = data.langs.length ? data.langs : ['mn', 'en'];
  const allKeys = [...new Set(data.rows.map((r: any) => r.key))] as string[];
  const keys = search ? allKeys.filter(k => k.toLowerCase().includes(search.toLowerCase())) : allKeys;
  const val = (key: string, lg: string) => {
    const ek = `${key}|${lg}`;
    if (ek in edits) return edits[ek];
    return data.rows.find((r: any) => r.key === key && r.lang === lg)?.value || '';
  };

  const save = async () => {
    const items = Object.entries(edits).map(([ek, value]) => {
      const [key, lg] = ek.split('|');
      return { key, lang: lg, value };
    });
    if (!items.length) return;
    await put('/admin/translations', { items });
    toast(`${t('saved')} (${items.length})`, 'ok');
    setEdits({}); load();
  };

  return (
    <>
      <div className="row between mb16">
        <div>
          <h1>{t('nav_translations')}</h1>
          <p className="mut mb0">{lang === 'mn' ? 'Системийн текстийг олон хэлээр удирдах (Table C5 — Translation модуль)' : 'Manage system texts in multiple languages (Table C5 — Translation module)'}</p>
        </div>
        <div className="row">
          <button className="btn sec sm" onClick={() => setAddLang(true)}>+ {t('add_language')}</button>
          <button className="btn" disabled={!Object.keys(edits).length} onClick={save}>{t('save')} ({Object.keys(edits).length})</button>
        </div>
      </div>
      <div className="filters mb16">
        <input placeholder={t('search')} style={{ maxWidth: 240 }} value={search} onChange={e => setSearch(e.target.value)} />
        <input placeholder={lang === 'mn' ? 'Шинэ түлхүүр (жишээ: home.title)' : 'New key (e.g. home.title)'} style={{ maxWidth: 240 }} value={newKey} onChange={e => setNewKey(e.target.value)} />
        <button className="btn sec sm" disabled={!newKey} onClick={() => {
          setEdits(e => ({ ...e, [`${newKey}|${langs[0]}`]: '' })); setNewKey('');
        }}>+ {t('key')}</button>
      </div>
      <Card tight>
        <div className="table-wrap" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>{t('key')}</th>{langs.map(lg => <th key={lg}>{lg.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {[...new Set([...keys, ...Object.keys(edits).map(k => k.split('|')[0])])].map(key => (
                <tr key={key}>
                  <td className="bold" style={{ minWidth: 160 }}>{key}</td>
                  {langs.map(lg => (
                    <td key={lg}>
                      <input value={val(key, lg)} onChange={e => setEdits(x => ({ ...x, [`${key}|${lg}`]: e.target.value }))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {addLang && (
        <Modal title={t('add_language')} onClose={() => setAddLang(false)}>
          <Field label={lang === 'mn' ? 'Хэлний код (zh, ru, kr...)' : 'Language code (zh, ru, kr...)'}>
            <input value={newLang} onChange={e => setNewLang(e.target.value)} maxLength={5} />
          </Field>
          <div className="actions">
            <button className="btn sec" onClick={() => setAddLang(false)}>{t('cancel')}</button>
            <button className="btn" disabled={!newLang} onClick={async () => {
              await put('/admin/translations', { items: [{ key: 'app.name', lang: newLang.toLowerCase(), value: 'OASIS v2' }] });
              setAddLang(false); setNewLang(''); load(); toast('✓', 'ok');
            }}>{t('add')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
