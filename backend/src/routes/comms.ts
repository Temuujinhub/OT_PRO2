import { Router } from 'express';
import { q, q1 } from '../db';
import { requireAuth, requireInternal } from '../util/auth';
import { audit, notify, notifyOrg, bad } from '../util/helpers';

const r = Router();
r.use(requireAuth);

// ---- Threads (clarification / messaging — spec 7.10, 8.13) ----
r.get('/threads', async (req, res) => {
  const { context_type, context_id } = req.query as any;
  const cond: string[] = []; const params: any[] = [];
  if (req.user!.userType === 'supplier') {
    params.push(req.user!.orgId); cond.push(`(th.organization_id=$${params.length} OR th.organization_id IS NULL)`);
    cond.push(`th.visibility='supplier'`);
  }
  if (context_type) { params.push(context_type); cond.push(`th.context_type=$${params.length}`); }
  if (context_id) { params.push(context_id); cond.push(`th.context_id=$${params.length}`); }
  const rows = await q(
    `SELECT th.*, o.name_mn AS org_name, u.display_name AS creator_name,
       (SELECT count(*)::int FROM msg_message m WHERE m.thread_id=th.id ${req.user!.userType === 'supplier' ? 'AND m.internal_only=false' : ''}) AS message_count,
       (SELECT max(m.sent_at) FROM msg_message m WHERE m.thread_id=th.id) AS last_at,
       CASE WHEN th.context_type='tender' THEN (SELECT tender_no FROM tender WHERE id=th.context_id) END AS tender_no
     FROM msg_thread th LEFT JOIN organization o ON o.id=th.organization_id LEFT JOIN app_user u ON u.id=th.created_by
     ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
     ORDER BY last_at DESC NULLS LAST LIMIT 200`, params);
  res.json(rows);
});

r.post('/threads', async (req, res) => {
  const { context_type, context_id, subject, body, organization_id, due_at, internal_only } = req.body || {};
  if (!subject || !body) return bad(res, 'subject_body_required');
  const orgId = req.user!.userType === 'supplier' ? req.user!.orgId : (organization_id || null);
  const th = (await q(
    `INSERT INTO msg_thread(context_type, context_id, subject, visibility, organization_id, due_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [context_type || 'direct', context_id || null, subject,
     internal_only && req.user!.userType === 'internal' ? 'internal' : 'supplier',
     orgId, due_at || null, req.user!.id]))[0];
  await q(`INSERT INTO msg_message(thread_id, sender_id, body, internal_only, attachment_id) VALUES ($1,$2,$3,$4,$5)`,
    [th.id, req.user!.id, body, !!internal_only && req.user!.userType === 'internal', req.body?.attachment_id || null]);
  await audit(req, 'thread_created', 'thread', th.id, { after: subject });
  // notify other side
  if (req.user!.userType === 'supplier') {
    const buyers = await q(`SELECT id FROM app_user WHERE user_type='internal' AND role IN ('Buyer','Support','SystemAdmin') LIMIT 5`);
    for (const b of buyers) {
      await notify(b.id, null, 'clarification', 'Шинэ асуулга ирлээ', 'New clarification received',
        subject, subject, `/admin/messages`);
    }
  } else if (orgId && !internal_only) {
    await notifyOrg(orgId, 'clarification', 'Шинэ мессеж ирлээ', 'New message received', subject, subject, `/supplier/messages`);
  }
  res.json(th);
});

r.get('/threads/:id(\\d+)', async (req, res) => {
  const th = await q1('SELECT * FROM msg_thread WHERE id=$1', [req.params.id]);
  if (!th) return res.status(404).json({ error: 'not_found' });
  if (req.user!.userType === 'supplier' && th.organization_id && th.organization_id !== req.user!.orgId)
    return res.status(403).json({ error: 'forbidden' });
  const internalFilter = req.user!.userType === 'supplier' ? 'AND m.internal_only=false' : '';
  const messages = await q(
    `SELECT m.*, u.display_name AS sender_name, u.user_type AS sender_type,
        a.original_name AS attachment_name, a.id AS att_id
     FROM msg_message m JOIN app_user u ON u.id=m.sender_id
     LEFT JOIN attachment a ON a.id=m.attachment_id
     WHERE m.thread_id=$1 ${internalFilter} ORDER BY m.sent_at`, [th.id]);
  res.json({ thread: th, messages });
});

r.post('/threads/:id(\\d+)/messages', async (req, res) => {
  const { body, internal_only, attachment_id } = req.body || {};
  if (!body) return bad(res, 'body_required');
  const th = await q1('SELECT * FROM msg_thread WHERE id=$1', [req.params.id]);
  if (!th) return res.status(404).json({ error: 'not_found' });
  if (th.status === 'closed') return bad(res, 'thread_closed');
  if (req.user!.userType === 'supplier' && th.organization_id && th.organization_id !== req.user!.orgId)
    return res.status(403).json({ error: 'forbidden' });
  const m = (await q(`INSERT INTO msg_message(thread_id, sender_id, body, internal_only, attachment_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [th.id, req.user!.id, body, !!internal_only && req.user!.userType === 'internal', attachment_id || null]))[0];
  if (req.user!.userType === 'internal' && th.organization_id && !internal_only) {
    await notifyOrg(th.organization_id, 'clarification', 'Хариу ирлээ', 'Reply received', th.subject, th.subject, `/supplier/messages/${th.id}`);
  }
  res.json(m);
});

r.post('/threads/:id(\\d+)/close', requireInternal, async (req, res) => {
  await q(`UPDATE msg_thread SET status='closed' WHERE id=$1`, [req.params.id]);
  await audit(req, 'thread_closed', 'thread', req.params.id);
  res.json({ ok: true });
});

// ---- Notifications (spec 7.11) ----
r.get('/notifications', async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const rows = await q(
    `SELECT * FROM notification WHERE user_id=$1 ${unreadOnly ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 100`,
    [req.user!.id]);
  const unread = await q1('SELECT count(*)::int AS c FROM notification WHERE user_id=$1 AND read_at IS NULL', [req.user!.id]);
  res.json({ notifications: rows, unread: unread.c });
});

r.post('/notifications/read', async (req, res) => {
  const ids: number[] = req.body?.ids || [];
  if (ids.length) {
    await q(`UPDATE notification SET read_at=now() WHERE user_id=$1 AND id = ANY($2::int[])`, [req.user!.id, ids]);
  } else {
    await q(`UPDATE notification SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [req.user!.id]);
  }
  res.json({ ok: true });
});

// ---- Dev mailbox (simulated email delivery view) ----
r.get('/mailbox', async (req, res) => {
  // suppliers see only their own emails; internal users see all
  if (req.user!.userType === 'supplier') {
    const rows = await q('SELECT * FROM email_outbox WHERE to_email=$1 ORDER BY id DESC LIMIT 50', [req.user!.email]);
    return res.json(rows);
  }
  const rows = await q('SELECT * FROM email_outbox ORDER BY id DESC LIMIT 100');
  res.json(rows);
});

// ---- Notification templates admin (spec 8.22) ----
r.get('/templates', requireInternal, async (_req, res) => {
  res.json(await q('SELECT * FROM notification_template ORDER BY code'));
});
r.put('/templates/:code', requireInternal, async (req, res) => {
  const b = req.body || {};
  const row = (await q(
    `INSERT INTO notification_template(code, subject_mn, subject_en, body_mn, body_en, channel, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (code) DO UPDATE SET subject_mn=$2, subject_en=$3, body_mn=$4, body_en=$5, channel=$6, active=$7 RETURNING *`,
    [req.params.code, b.subject_mn || null, b.subject_en || null, b.body_mn || null, b.body_en || null, b.channel || 'both', b.active ?? true]))[0];
  await audit(req, 'template_updated', 'template', req.params.code);
  res.json(row);
});

// manual campaign / broadcast (spec 8.22)
r.post('/broadcast', requireInternal, async (req, res) => {
  const { title_mn, title_en, body_mn, body_en, audience } = req.body || {}; // audience: all_suppliers | approved_suppliers | internal
  if (!title_mn || !body_mn) return bad(res, 'title_body_required');
  let users: any[] = [];
  if (audience === 'internal') {
    users = await q(`SELECT id, organization_id FROM app_user WHERE user_type='internal' AND status='active'`);
  } else if (audience === 'approved_suppliers') {
    users = await q(`SELECT u.id, u.organization_id FROM app_user u JOIN organization o ON o.id=u.organization_id WHERE o.status='approved' AND u.status='active'`);
  } else {
    users = await q(`SELECT id, organization_id FROM app_user WHERE user_type='supplier' AND status='active'`);
  }
  for (const u of users) {
    await notify(u.id, u.organization_id, 'system', title_mn, title_en || title_mn, body_mn, body_en || body_mn);
  }
  await audit(req, 'broadcast_sent', 'notification', audience, { after: `${users.length} recipients` });
  res.json({ ok: true, recipients: users.length });
});

export default r;
