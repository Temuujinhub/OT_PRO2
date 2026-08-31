import { Router } from 'express';
import { q, q1 } from '../db';
import { requireAuth, requireInternal } from '../util/auth';
import { audit, notify, bad, nextNumber, getSetting } from '../util/helpers';
import { hubAssistant } from '../services/ai';

const r = Router();
r.use(requireAuth);

// SLA hours per severity (contract Table A1)
const SLA_RESPONSE_HOURS: Record<number, number> = { 1: 2, 2: 4, 3: 48, 4: 120 };

// ---- Support Hub articles (spec 7.13 / 8.21) ----
r.get('/articles', async (req, res) => {
  const { category, search, all } = req.query as any;
  const cond: string[] = [req.user!.userType === 'internal' && all === 'true' ? '1=1' : `status='published'`];
  const params: any[] = [];
  if (category) { params.push(category); cond.push(`category=$${params.length}`); }
  if (search) { params.push(`%${search}%`); cond.push(`(title_mn ILIKE $${params.length} OR title_en ILIKE $${params.length} OR body_mn ILIKE $${params.length})`); }
  res.json(await q(`SELECT * FROM support_article WHERE ${cond.join(' AND ')} ORDER BY updated_at DESC`, params));
});

r.post('/articles/:id(\\d+)/vote', async (req, res) => {
  const col = req.body?.helpful ? 'helpful' : 'not_helpful';
  await q(`UPDATE support_article SET ${col}=${col}+1 WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

r.post('/articles', requireInternal, async (req, res) => {
  const b = req.body || {};
  if (!b.title_mn || !b.body_mn) return bad(res, 'title_body_required');
  const row = (await q(
    `INSERT INTO support_article(category, title_mn, title_en, body_mn, body_en, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.category || 'general', b.title_mn, b.title_en || null, b.body_mn, b.body_en || null, b.status || 'published']))[0];
  await audit(req, 'article_created', 'article', row.id);
  res.json(row);
});

r.put('/articles/:id(\\d+)', requireInternal, async (req, res) => {
  const b = req.body || {};
  await q(
    `UPDATE support_article SET category=COALESCE($1,category), title_mn=COALESCE($2,title_mn), title_en=$3,
       body_mn=COALESCE($4,body_mn), body_en=$5, status=COALESCE($6,status), updated_at=now() WHERE id=$7`,
    [b.category, b.title_mn, b.title_en, b.body_mn, b.body_en, b.status, req.params.id]);
  await audit(req, 'article_updated', 'article', req.params.id);
  res.json({ ok: true });
});

// ---- AI assistant (Supplier Hub — Table C5 item 1) ----
r.post('/assistant', async (req, res) => {
  const { question } = req.body || {};
  if (!question || String(question).trim().length < 3) return bad(res, 'question_required');
  const articles = await q(`SELECT title_mn, title_en, body_mn, body_en FROM support_article WHERE status='published'`);
  const lang = req.user!.lang || 'mn';
  const kb = articles.map(a => ({
    title: lang === 'mn' ? a.title_mn : (a.title_en || a.title_mn),
    body: lang === 'mn' ? a.body_mn : (a.body_en || a.body_mn),
  }));
  const answer = await hubAssistant(String(question), lang, kb);
  await audit(req, 'hub_assistant_used', 'support', null, { after: String(question).slice(0, 100) });
  res.json(answer);
});

// ---- Downloadable guides (legacy supplier manuals — repo /OASIS folder) ----
import fs from 'fs';
import path from 'path';
const GUIDES_DIR = process.env.GUIDES_DIR || path.join(process.cwd(), '..', 'OASIS');
const GUIDES: { file: string; label_mn: string; label_en: string; category: string }[] = [
  { file: 'MNManual-SupplierLog-in.pdf', label_mn: 'Нэвтрэх, бүртгүүлэх заавар (МН)', label_en: 'Supplier log-in & registration manual (MN)', category: 'registration' },
  { file: 'Manual-Suppliergeneralinfo.pdf', label_mn: 'Ерөнхий мэдээлэл бөглөх заавар', label_en: 'General information manual', category: 'registration' },
  { file: 'Manual-SupplierPre-Qualification.pdf', label_mn: 'Урьдчилсан үнэлгээ бөглөх заавар', label_en: 'Pre-Qualification manual', category: 'qualification' },
  { file: 'Manual-SupplierTendermenu.pdf', label_mn: 'Тендер цэсний заавар', label_en: 'Tender menu manual', category: 'tender' },
  { file: 'Manual-SupplierEOI.pdf', label_mn: 'EOI-д оролцох заавар', label_en: 'EOI participation manual', category: 'tender' },
  { file: 'Manual-SupplierRFQ.pdf', label_mn: 'RFQ үнийн санал илгээх заавар', label_en: 'RFQ bid submission manual', category: 'tender' },
];

r.get('/guides', async (_req, res) => {
  const out = GUIDES.map(g => {
    const p = path.join(GUIDES_DIR, g.file);
    const exists = fs.existsSync(p);
    return { ...g, available: exists, size_bytes: exists ? fs.statSync(p).size : 0 };
  }).filter(g => g.available);
  res.json(out);
});

r.get('/guides/:file/download', async (req, res) => {
  const g = GUIDES.find(x => x.file === req.params.file); // allowlist — no path traversal
  if (!g) return res.status(404).json({ error: 'not_found' });
  const p = path.join(GUIDES_DIR, g.file);
  if (!fs.existsSync(p)) return res.status(410).json({ error: 'file_missing' });
  await audit(req, 'guide_downloaded', 'support', g.file);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(g.file)}`);
  fs.createReadStream(p).pipe(res);
});

// ---- Tickets ----
r.get('/tickets', async (req, res) => {
  if (req.user!.userType === 'supplier') {
    return res.json(await q(
      `SELECT t.*, u.display_name AS assignee_name FROM support_ticket t LEFT JOIN app_user u ON u.id=t.assignee_id
       WHERE t.user_id=$1 OR t.organization_id=$2 ORDER BY t.id DESC`, [req.user!.id, req.user!.orgId]));
  }
  const { status, severity } = req.query as any;
  const cond: string[] = ['1=1']; const params: any[] = [];
  if (status) { params.push(status); cond.push(`t.status=$${params.length}`); }
  if (severity) { params.push(severity); cond.push(`t.severity=$${params.length}`); }
  res.json(await q(
    `SELECT t.*, u.display_name AS assignee_name, cu.display_name AS creator_name, o.name_mn AS org_name,
       (t.sla_due_at < now() AND t.status NOT IN ('resolved','closed')) AS sla_breached
     FROM support_ticket t LEFT JOIN app_user u ON u.id=t.assignee_id
     JOIN app_user cu ON cu.id=t.user_id LEFT JOIN organization o ON o.id=t.organization_id
     WHERE ${cond.join(' AND ')} ORDER BY t.severity, t.id DESC LIMIT 300`, params));
});

r.post('/tickets', async (req, res) => {
  const { subject, body, severity } = req.body || {};
  if (!subject || !body) return bad(res, 'subject_body_required');
  const sev = Math.min(4, Math.max(1, parseInt(severity) || 3));
  const no = await nextNumber('TCK', 'support_ticket', 'ticket_no');
  const slaHours = SLA_RESPONSE_HOURS[sev];
  const row = (await q(
    `INSERT INTO support_ticket(ticket_no, user_id, organization_id, subject, body, severity, sla_due_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' hours')::interval) RETURNING *`,
    [no, req.user!.id, req.user!.orgId || null, subject, body, sev, String(slaHours)]))[0];
  await audit(req, 'ticket_created', 'ticket', row.id, { after: `${no} sev${sev}` });
  const agents = await q(`SELECT id FROM app_user WHERE user_type='internal' AND role IN ('Support','SystemAdmin')`);
  for (const a of agents) {
    await notify(a.id, null, 'support', `Шинэ тасалбар (Sev${sev})`, `New ticket (Sev${sev})`, `${no}: ${subject}`, `${no}: ${subject}`, '/admin/support');
  }
  res.json(row);
});

r.post('/tickets/:id(\\d+)/update', requireInternal, async (req, res) => {
  const { status, assignee_id, severity } = req.body || {};
  const t = await q1('SELECT * FROM support_ticket WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  const valid = ['new', 'triaged', 'assigned', 'in_progress', 'waiting', 'resolved', 'closed', 'reopened'];
  if (status && !valid.includes(status)) return bad(res, 'invalid_status');
  await q(
    `UPDATE support_ticket SET status=COALESCE($1,status), assignee_id=COALESCE($2,assignee_id), severity=COALESCE($3,severity),
        resolved_at=CASE WHEN $1='resolved' THEN now() ELSE resolved_at END WHERE id=$4`,
    [status || null, assignee_id || null, severity || null, t.id]);
  await audit(req, 'ticket_updated', 'ticket', t.id, { before: t.status, after: status || t.status });
  if (status === 'resolved') {
    await notify(t.user_id, t.organization_id, 'support', 'Тасалбар шийдэгдлээ', 'Ticket resolved',
      `${t.ticket_no}: ${t.subject}`, `${t.ticket_no}: ${t.subject}`, '/supplier/support');
  }
  res.json({ ok: true });
});

// supplier can reopen / confirm
r.post('/tickets/:id(\\d+)/reopen', async (req, res) => {
  const t = await q1('SELECT * FROM support_ticket WHERE id=$1 AND (user_id=$2 OR organization_id=$3)',
    [req.params.id, req.user!.id, req.user!.orgId || -1]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!['resolved', 'closed'].includes(t.status)) return bad(res, 'invalid_state');
  await q(`UPDATE support_ticket SET status='reopened' WHERE id=$1`, [t.id]);
  res.json({ ok: true });
});

// known issue banner
r.get('/banner', async (_req, res) => {
  const text = await getSetting('known_issue_banner', '');
  res.json({ banner: text });
});
r.put('/banner', requireInternal, async (req, res) => {
  await q(`INSERT INTO app_setting(key, value, description) VALUES ('known_issue_banner',$1,'Known issue banner')
           ON CONFLICT (key) DO UPDATE SET value=$1`, [req.body?.text || '']);
  await audit(req, 'banner_updated', 'setting', 'known_issue_banner');
  res.json({ ok: true });
});

// ---- Surveys (spec 8.20) ----
r.get('/surveys', async (req, res) => {
  const rows = req.user!.userType === 'internal'
    ? await q(`SELECT s.*, (SELECT count(*)::int FROM survey_response sr WHERE sr.survey_id=s.id) AS responses FROM survey s ORDER BY s.id DESC`)
    : await q(`SELECT s.*, EXISTS(SELECT 1 FROM survey_response sr WHERE sr.survey_id=s.id AND sr.user_id=$1) AS answered
               FROM survey s WHERE s.status='open' ORDER BY s.id DESC`, [req.user!.id]);
  res.json(rows);
});

r.post('/surveys', requireInternal, async (req, res) => {
  const b = req.body || {};
  if (!b.title_mn || !Array.isArray(b.questions)) return bad(res, 'title_questions_required');
  const row = (await q(
    `INSERT INTO survey(title_mn, title_en, anonymous, status, questions_json, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.title_mn, b.title_en || null, !!b.anonymous, b.status || 'open', JSON.stringify(b.questions), req.user!.id]))[0];
  await audit(req, 'survey_created', 'survey', row.id);
  res.json(row);
});

r.post('/surveys/:id(\\d+)/respond', async (req, res) => {
  const s = await q1(`SELECT * FROM survey WHERE id=$1 AND status='open'`, [req.params.id]);
  if (!s) return bad(res, 'survey_closed');
  const already = await q1('SELECT 1 FROM survey_response WHERE survey_id=$1 AND user_id=$2', [s.id, req.user!.id]);
  if (already) return bad(res, 'already_answered');
  await q(`INSERT INTO survey_response(survey_id, user_id, answers_json) VALUES ($1,$2,$3)`,
    [s.id, s.anonymous ? null : req.user!.id, JSON.stringify(req.body?.answers || {})]);
  res.json({ ok: true });
});

r.get('/surveys/:id(\\d+)/results', requireInternal, async (req, res) => {
  const s = await q1('SELECT * FROM survey WHERE id=$1', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'not_found' });
  const responses = await q('SELECT * FROM survey_response WHERE survey_id=$1', [s.id]);
  res.json({ survey: s, responses });
});

r.post('/surveys/:id(\\d+)/close', requireInternal, async (req, res) => {
  await q(`UPDATE survey SET status='closed' WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ---- Catalogue (spec 7.12) ----
r.get('/catalogue', async (req, res) => {
  if (req.user!.userType === 'supplier') {
    return res.json(await q('SELECT * FROM catalogue_item WHERE organization_id=$1 ORDER BY id DESC', [req.user!.orgId]));
  }
  const { search } = req.query as any;
  const params: any[] = []; let cond = '1=1';
  if (search) { params.push(`%${search}%`); cond = `(ci.name ILIKE $1 OR ci.manufacturer ILIKE $1 OR ci.part_no ILIKE $1)`; }
  res.json(await q(
    `SELECT ci.*, o.name_mn AS org_name FROM catalogue_item ci JOIN organization o ON o.id=ci.organization_id
     WHERE ${cond} ORDER BY ci.id DESC LIMIT 300`, params));
});

r.post('/catalogue', requireAuth, async (req, res) => {
  if (req.user!.userType !== 'supplier') return res.status(403).json({ error: 'supplier_only' });
  const b = req.body || {};
  if (!b.name) return bad(res, 'name_required');
  const row = (await q(
    `INSERT INTO catalogue_item(organization_id, name, category_id, manufacturer, part_no, origin_country, description, certifications, unit_price, currency, uom)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user!.orgId, b.name, b.category_id || null, b.manufacturer || null, b.part_no || null, b.origin_country || null,
     b.description || null, b.certifications || null, b.unit_price || null, b.currency || 'MNT', b.uom || 'EA']))[0];
  res.json(row);
});

r.delete('/catalogue/:id(\\d+)', async (req, res) => {
  if (req.user!.userType === 'supplier') {
    await q('DELETE FROM catalogue_item WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  } else {
    await q('DELETE FROM catalogue_item WHERE id=$1', [req.params.id]);
  }
  res.json({ ok: true });
});

export default r;
