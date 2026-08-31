import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, q1 } from '../db';
import { requireAuth, requireInternal, requireRole } from '../util/auth';
import { audit, bad } from '../util/helpers';

const r = Router();

// translations are public (frontend loads them before login)
r.get('/translations/:lang', async (req, res) => {
  const rows = await q('SELECT key, value FROM translation WHERE lang=$1', [req.params.lang]);
  const map: Record<string, string> = {};
  rows.forEach(x => map[x.key] = x.value);
  res.json(map);
});

// master data lists are available to any authenticated user
r.get('/masterdata', requireAuth, async (_req, res) => {
  const [categories, uoms, currencies, incoterms, manufacturers, tenderTypes, reasonCodes, rates] = await Promise.all([
    q('SELECT * FROM ref_category WHERE active=true ORDER BY code'),
    q('SELECT * FROM ref_uom ORDER BY code'),
    q('SELECT * FROM ref_currency WHERE active=true ORDER BY code'),
    q('SELECT * FROM ref_incoterm ORDER BY code'),
    q('SELECT * FROM ref_manufacturer ORDER BY name'),
    q('SELECT * FROM tender_type WHERE active=true ORDER BY id'),
    q('SELECT * FROM ref_reason_code ORDER BY area, code'),
    q(`SELECT DISTINCT ON (base_currency, quote_currency) * FROM exchange_rate ORDER BY base_currency, quote_currency, rate_date DESC`),
  ]);
  res.json({ categories, uoms, currencies, incoterms, manufacturers, tenderTypes, reasonCodes, rates });
});

r.use(requireAuth, requireInternal);

// ---- Internal users (spec 8.2) ----
r.get('/users', async (req, res) => {
  const { type } = req.query as any;
  const cond = type === 'supplier' ? `u.user_type='supplier'` : type === 'internal' ? `u.user_type='internal'` : '1=1';
  const rows = await q(
    `SELECT u.id, u.email, u.display_name, u.user_type, u.role, u.status, u.department, u.position, u.language,
            u.mfa_enabled, u.last_login_at, u.approval_limit, u.organization_id, o.name_mn AS org_name
     FROM app_user u LEFT JOIN organization o ON o.id=u.organization_id
     WHERE ${cond} ORDER BY u.user_type, u.role, u.id LIMIT 500`);
  res.json(rows);
});

r.post('/users', requireRole('SystemAdmin'), async (req, res) => {
  const b = req.body || {};
  if (!b.email || !b.display_name || !b.role) return bad(res, 'fields_required');
  const exists = await q1('SELECT 1 FROM app_user WHERE email=$1', [b.email.toLowerCase()]);
  if (exists) return bad(res, 'email_taken');
  const password = b.password || 'Oasis@' + Math.random().toString(36).slice(2, 8);
  const row = (await q(
    `INSERT INTO app_user(email, password_hash, display_name, user_type, role, status, department, position, approval_limit, language)
     VALUES ($1,$2,$3,'internal',$4,'active',$5,$6,$7,'mn') RETURNING id, email, display_name, role`,
    [b.email.toLowerCase(), await bcrypt.hash(password, 10), b.display_name, b.role, b.department || null, b.position || null, b.approval_limit || null]))[0];
  await audit(req, 'internal_user_created', 'user', row.id, { after: `${b.email} (${b.role})` });
  res.json({ ...row, initialPassword: b.password ? undefined : password });
});

r.put('/users/:id(\\d+)', requireRole('SystemAdmin'), async (req, res) => {
  const b = req.body || {};
  const u = await q1('SELECT * FROM app_user WHERE id=$1', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'not_found' });
  await q(
    `UPDATE app_user SET display_name=COALESCE($1,display_name), role=COALESCE($2,role), status=COALESCE($3,status),
       department=COALESCE($4,department), position=COALESCE($5,position), approval_limit=$6, updated_at=now() WHERE id=$7`,
    [b.display_name, b.role, b.status, b.department, b.position, b.approval_limit ?? u.approval_limit, u.id]);
  await audit(req, 'user_updated', 'user', u.id, { before: `${u.role}/${u.status}`, after: `${b.role || u.role}/${b.status || u.status}` });
  res.json({ ok: true });
});

r.post('/users/:id(\\d+)/unlock', requireRole('SystemAdmin'), async (req, res) => {
  await q(`UPDATE app_user SET status='active', failed_logins=0 WHERE id=$1 AND status='locked'`, [req.params.id]);
  await audit(req, 'user_unlocked', 'user', req.params.id);
  res.json({ ok: true });
});

r.post('/users/:id(\\d+)/reset-password', requireRole('SystemAdmin'), async (req, res) => {
  const pw = 'Oasis@' + Math.random().toString(36).slice(2, 8);
  await q('UPDATE app_user SET password_hash=$1, failed_logins=0 WHERE id=$2', [await bcrypt.hash(pw, 10), req.params.id]);
  await audit(req, 'password_admin_reset', 'user', req.params.id);
  res.json({ ok: true, newPassword: pw });
});

// ---- Master data CRUD (spec 8.25) ----
r.post('/masterdata/categories', requireRole('SystemAdmin', 'ContentAdmin'), async (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name_mn) return bad(res, 'code_name_required');
  const row = (await q(`INSERT INTO ref_category(code, name_mn, name_en) VALUES ($1,$2,$3)
    ON CONFLICT (code) DO UPDATE SET name_mn=$2, name_en=$3, active=true RETURNING *`, [b.code, b.name_mn, b.name_en || null]))[0];
  await audit(req, 'category_saved', 'masterdata', b.code);
  res.json(row);
});
r.delete('/masterdata/categories/:id(\\d+)', requireRole('SystemAdmin'), async (req, res) => {
  await q('UPDATE ref_category SET active=false WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

r.post('/masterdata/uoms', requireRole('SystemAdmin', 'ContentAdmin'), async (req, res) => {
  const b = req.body || {};
  if (!b.code) return bad(res, 'code_required');
  const row = (await q(`INSERT INTO ref_uom(code, name_mn, name_en) VALUES ($1,$2,$3)
    ON CONFLICT (code) DO UPDATE SET name_mn=$2, name_en=$3 RETURNING *`, [b.code.toUpperCase(), b.name_mn || null, b.name_en || null]))[0];
  res.json(row);
});

r.post('/masterdata/manufacturers', requireRole('SystemAdmin', 'ContentAdmin', 'Buyer'), async (req, res) => {
  const b = req.body || {};
  if (!b.name) return bad(res, 'name_required');
  const row = (await q(`INSERT INTO ref_manufacturer(name, country) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET country=$2 RETURNING *`,
    [String(b.name), b.country || null]))[0];
  res.json(row);
});

r.post('/masterdata/rates', requireRole('SystemAdmin'), async (req, res) => {
  const b = req.body || {};
  const rate = Number(b.rate);
  if (!b.base_currency || !b.quote_currency || !isFinite(rate) || rate <= 0) return bad(res, 'invalid_rate');
  const row = (await q(
    `INSERT INTO exchange_rate(base_currency, quote_currency, rate, rate_date, source) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (base_currency, quote_currency, rate_date) DO UPDATE SET rate=$3, source=$5 RETURNING *`,
    [b.base_currency.toUpperCase(), b.quote_currency.toUpperCase(), rate, b.rate_date || new Date().toISOString().slice(0, 10), b.source || 'Manual']))[0];
  await audit(req, 'exchange_rate_set', 'masterdata', `${b.base_currency}/${b.quote_currency}`, { after: String(rate) });
  res.json(row);
});

// ---- Translations admin (Table C5 item 5) ----
r.get('/translations', async (_req, res) => {
  const rows = await q('SELECT * FROM translation ORDER BY key, lang');
  const langs = await q('SELECT DISTINCT lang FROM translation ORDER BY lang');
  res.json({ rows, langs: langs.map(l => l.lang) });
});

r.put('/translations', requireRole('SystemAdmin', 'ContentAdmin'), async (req, res) => {
  const items: any[] = req.body?.items || [];
  for (const it of items) {
    if (!it.key || !it.lang) continue;
    await q(`INSERT INTO translation(key, lang, value) VALUES ($1,$2,$3) ON CONFLICT (key, lang) DO UPDATE SET value=$3`,
      [it.key, it.lang, it.value || '']);
  }
  await audit(req, 'translations_updated', 'translation', null, { after: `${items.length} keys` });
  res.json({ ok: true, saved: items.length });
});

r.delete('/translations/:key', requireRole('SystemAdmin'), async (req, res) => {
  await q('DELETE FROM translation WHERE key=$1', [req.params.key]);
  res.json({ ok: true });
});

// ---- Settings / feature flags ----
r.get('/settings', async (_req, res) => {
  res.json(await q('SELECT * FROM app_setting ORDER BY key'));
});
r.put('/settings/:key', requireRole('SystemAdmin'), async (req, res) => {
  await q(`INSERT INTO app_setting(key, value, description) VALUES ($1,$2,$3)
           ON CONFLICT (key) DO UPDATE SET value=$2`, [req.params.key, String(req.body?.value ?? ''), req.body?.description || null]);
  await audit(req, 'setting_changed', 'setting', req.params.key, { after: String(req.body?.value ?? '') });
  res.json({ ok: true });
});

// ---- ХУР registry mock admin ----
r.get('/khur', async (_req, res) => {
  res.json(await q('SELECT * FROM khur_registry ORDER BY registry_no'));
});
r.post('/khur', requireRole('SystemAdmin'), async (req, res) => {
  const b = req.body || {};
  if (!b.registry_no || !b.name_mn) return bad(res, 'fields_required');
  const row = (await q(
    `INSERT INTO khur_registry(registry_no, name_mn, name_en, legal_form, state_reg_no, director, address)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (registry_no) DO UPDATE SET name_mn=$2, name_en=$3, legal_form=$4, state_reg_no=$5, director=$6, address=$7 RETURNING *`,
    [b.registry_no, b.name_mn, b.name_en || null, b.legal_form || 'ХХК', b.state_reg_no || null, b.director || null, b.address || null]))[0];
  res.json(row);
});

export default r;
