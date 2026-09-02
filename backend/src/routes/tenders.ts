import { Router } from 'express';
import { q, q1, tx } from '../db';
import { requireAuth, requireSupplier, requireInternal, requireRole } from '../util/auth';
import { audit, notify, notifyOrg, bad, nextNumber, convert, sendEmail } from '../util/helpers';

const r = Router();
r.use(requireAuth);

const BUYER_ROLES = ['Buyer', 'SystemAdmin'];

async function loadTender(id: number) {
  const t = await q1(
    `SELECT t.*, tt.code AS type_code, tt.name_mn AS type_name_mn, tt.name_en AS type_name_en, tt.has_items,
        bu.display_name AS buyer_name, eu.display_name AS end_user_name, c.name_mn AS category_name
     FROM tender t JOIN tender_type tt ON tt.id=t.type_id
     LEFT JOIN app_user bu ON bu.id=t.buyer_id LEFT JOIN app_user eu ON eu.id=t.end_user_id
     LEFT JOIN ref_category c ON c.id=t.category_id
     WHERE t.id=$1`, [id]);
  if (!t) return null;
  t.items = await q('SELECT * FROM tender_item WHERE tender_id=$1 ORDER BY line_no', [id]);
  t.requirements = await q('SELECT * FROM tender_requirement WHERE tender_id=$1 ORDER BY line_no', [id]);
  t.attachments = await q(`SELECT * FROM attachment WHERE owner_type='tender' AND owner_id=$1`, [id]);
  t.deadlineChanges = await q('SELECT * FROM tender_deadline_change WHERE tender_id=$1 ORDER BY id DESC', [id]);
  return t;
}

// ================== SUPPLIER SIDE (spec 7.6/7.7) ==================
r.get('/supplier/list', requireSupplier, async (req, res) => {
  const orgId = req.user!.orgId!;
  const { type, filter, search } = req.query as any;
  const params: any[] = [orgId];
  const cond: string[] = [`t.status IN ('published','closed','in_evaluation','negotiation','award_pending','awarded','cancelled')`];
  cond.push(`(t.is_public = true OR EXISTS (SELECT 1 FROM tender_invitation i WHERE i.tender_id=t.id AND i.organization_id=$1))`);
  if (type) { params.push(type); cond.push(`tt.code=$${params.length}`); }
  if (search) { params.push(`%${search}%`); cond.push(`(t.tender_no ILIKE $${params.length} OR t.title_mn ILIKE $${params.length} OR t.title_en ILIKE $${params.length})`); }
  if (filter === 'open') cond.push(`t.status='published' AND t.close_at > now()`);
  if (filter === 'closed') cond.push(`(t.status <> 'published' OR t.close_at <= now())`);
  if (filter === 'participated') cond.push(`EXISTS (SELECT 1 FROM bid_response b WHERE b.tender_id=t.id AND b.organization_id=$1 AND b.status <> 'draft')`);
  if (filter === 'invited') cond.push(`EXISTS (SELECT 1 FROM tender_invitation i2 WHERE i2.tender_id=t.id AND i2.organization_id=$1)`);
  if (filter === 'draft') cond.push(`EXISTS (SELECT 1 FROM bid_response b2 WHERE b2.tender_id=t.id AND b2.organization_id=$1 AND b2.status='draft')`);
  if (filter === 'awarded') cond.push(`EXISTS (SELECT 1 FROM bid_response b3 WHERE b3.tender_id=t.id AND b3.organization_id=$1 AND b3.status='awarded')`);
  const rows = await q(
    `SELECT t.id, t.tender_no, t.title_mn, t.title_en, t.status, t.publish_at, t.close_at, t.partial_allowed,
            tt.code AS type_code, tt.name_mn AS type_name_mn,
            (SELECT status FROM bid_response b WHERE b.tender_id=t.id AND b.organization_id=$1) AS my_bid_status,
            (SELECT status FROM tender_invitation i WHERE i.tender_id=t.id AND i.organization_id=$1) AS invitation_status,
            (SELECT count(*)::int FROM msg_thread th JOIN msg_message m ON m.thread_id=th.id
              WHERE th.context_type='tender' AND th.context_id=t.id AND th.organization_id=$1 AND m.internal_only=false) AS msg_count
     FROM tender t JOIN tender_type tt ON tt.id=t.type_id
     WHERE ${cond.join(' AND ')}
     ORDER BY t.close_at DESC NULLS LAST LIMIT 300`, params);
  res.json(rows);
});

r.get('/supplier/:id(\\d+)', requireSupplier, async (req, res) => {
  const t = await loadTender(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'not_found' });
  const orgId = req.user!.orgId!;
  const inv = await q1('SELECT * FROM tender_invitation WHERE tender_id=$1 AND organization_id=$2', [t.id, orgId]);
  if (!t.is_public && !inv) return res.status(403).json({ error: 'not_invited' });
  if (inv && inv.status === 'sent') await q(`UPDATE tender_invitation SET status='opened', opened_at=now() WHERE id=$1`, [inv.id]);
  const consent = await q1(`SELECT * FROM consent WHERE user_id=$1 AND consent_type='tender_disclaimer' AND ref_id=$2`, [req.user!.id, t.id]);
  const myBid = await q1('SELECT * FROM bid_response WHERE tender_id=$1 AND organization_id=$2', [t.id, orgId]);
  const auction = t.type_code === 'AUCTION' ? await q1('SELECT * FROM auction WHERE tender_id=$1', [t.id]) : null;
  // email content is internal-facing; hide internal fields from supplier
  delete t.email_subject; delete t.email_body;
  res.json({ tender: t, invitation: inv, disclaimerAccepted: !!consent, myBid, auction });
});

r.post('/supplier/:id(\\d+)/consent', requireSupplier, async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  await q(`INSERT INTO consent(user_id, consent_type, ref_id, doc_version, ip) VALUES ($1,'tender_disclaimer',$2,$3,$4)`,
    [req.user!.id, t.id, t.disclaimer_version, req.ip]);
  await audit(req, 'disclaimer_accepted', 'tender', t.id);
  res.json({ ok: true });
});

r.post('/supplier/:id(\\d+)/decline', requireSupplier, async (req, res) => {
  await q(`UPDATE tender_invitation SET status='declined' WHERE tender_id=$1 AND organization_id=$2`, [req.params.id, req.user!.orgId]);
  await audit(req, 'invitation_declined', 'tender', req.params.id);
  res.json({ ok: true });
});

// ================== ADMIN SIDE (spec 8.6–8.9) ==================
r.get('/types', async (_req, res) => {
  res.json(await q('SELECT * FROM tender_type WHERE active=true ORDER BY id'));
});

r.get('/', requireInternal, async (req, res) => {
  const { status, type, buyer, search, overdue } = req.query as any;
  const cond: string[] = ['1=1']; const params: any[] = [];
  if (status) { params.push(status); cond.push(`t.status=$${params.length}`); }
  if (type) { params.push(type); cond.push(`tt.code=$${params.length}`); }
  if (buyer) { params.push(buyer); cond.push(`t.buyer_id=$${params.length}`); }
  if (search) { params.push(`%${search}%`); cond.push(`(t.tender_no ILIKE $${params.length} OR t.title_mn ILIKE $${params.length})`); }
  if (overdue === 'true') cond.push(`EXISTS (SELECT 1 FROM approval_instance ai JOIN approval_stage s ON s.approval_id=ai.id AND s.status='pending'
      WHERE ai.entity_type IN ('tender_publish','award') AND ai.entity_id=t.id AND s.due_at < now())`);
  const rows = await q(
    `SELECT t.id, t.tender_no, t.title_mn, t.status, t.publish_at, t.close_at, t.department,
            tt.code AS type_code, bu.display_name AS buyer_name, eu.display_name AS end_user_name,
            (SELECT count(*)::int FROM tender_invitation i WHERE i.tender_id=t.id) AS invited,
            (SELECT count(*)::int FROM bid_response b WHERE b.tender_id=t.id AND b.status NOT IN ('draft','no_response')) AS responded,
            (SELECT count(*)::int FROM attachment a WHERE a.owner_type='tender' AND a.owner_id=t.id) AS attachment_count,
            (SELECT u.display_name FROM approval_instance ai JOIN approval_stage s ON s.approval_id=ai.id AND s.status='pending'
               JOIN app_user u ON u.id=s.assignee_id
             WHERE ai.entity_type IN ('tender_publish','award') AND ai.entity_id=t.id AND ai.status='pending'
             ORDER BY ai.id DESC LIMIT 1) AS current_approver,
            (SELECT round(extract(epoch FROM (now() - s.due_at))/3600)::int FROM approval_instance ai JOIN approval_stage s ON s.approval_id=ai.id AND s.status='pending'
             WHERE ai.entity_type IN ('tender_publish','award') AND ai.entity_id=t.id AND ai.status='pending' ORDER BY ai.id DESC LIMIT 1) AS approver_overdue_hours
     FROM tender t JOIN tender_type tt ON tt.id=t.type_id
     LEFT JOIN app_user bu ON bu.id=t.buyer_id LEFT JOIN app_user eu ON eu.id=t.end_user_id
     WHERE ${cond.join(' AND ')} ORDER BY t.updated_at DESC LIMIT 500`, params);
  res.json(rows);
});

r.get('/:id(\\d+)', requireInternal, async (req, res) => {
  const t = await loadTender(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'not_found' });
  const invitations = await q(
    `SELECT i.*, o.name_mn AS org_name, o.registry_no, o.status AS org_status, o.risk_level,
        (SELECT status FROM bid_response b WHERE b.tender_id=i.tender_id AND b.organization_id=i.organization_id) AS bid_status
     FROM tender_invitation i LEFT JOIN organization o ON o.id=i.organization_id WHERE i.tender_id=$1 ORDER BY i.id`, [t.id]);
  const approvals = await q(
    `SELECT ai.*, (SELECT json_agg(json_build_object('stage_no', s.stage_no, 'stage_name', s.stage_name, 'status', s.status,
        'assignee', u.display_name, 'decided_at', s.decided_at, 'decision_reason', s.decision_reason, 'due_at', s.due_at) ORDER BY s.stage_no)
        FROM approval_stage s LEFT JOIN app_user u ON u.id=s.assignee_id WHERE s.approval_id=ai.id) AS stages
     FROM approval_instance ai WHERE ai.entity_type IN ('tender_publish','award','award_cancel') AND ai.entity_id=$1 ORDER BY ai.id DESC`, [t.id]);
  const events = await q(`SELECT * FROM audit_event WHERE entity_type='tender' AND entity_id=$1 ORDER BY occurred_at DESC LIMIT 60`, [String(t.id)]);
  const stats = await q1(
    `SELECT (SELECT count(*)::int FROM tender_invitation WHERE tender_id=$1) AS invited,
            (SELECT count(*)::int FROM tender_invitation WHERE tender_id=$1 AND status='opened') AS opened,
            (SELECT count(*)::int FROM bid_response WHERE tender_id=$1 AND status NOT IN ('draft','no_response')) AS submitted,
            (SELECT count(*)::int FROM bid_response WHERE tender_id=$1 AND status='draft') AS drafts,
            (SELECT count(*)::int FROM tender_invitation WHERE tender_id=$1 AND status='declined') AS declined`, [t.id]);
  const awardRow = await q1(`SELECT * FROM award WHERE tender_id=$1 ORDER BY version_no DESC LIMIT 1`, [t.id]);
  const auction = t.type_code === 'AUCTION' ? await q1('SELECT * FROM auction WHERE tender_id=$1', [t.id]) : null;
  res.json({ tender: t, invitations, approvals, events, stats, award: awardRow, auction });
});

// -------- Create / edit wizard (spec 8.7) --------
r.post('/', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const b = req.body || {};
  const type = await q1('SELECT * FROM tender_type WHERE code=$1', [b.type_code || 'RFQ']);
  if (!type) return bad(res, 'invalid_type');
  const prefix = type.code === 'EOI' ? 'EOI' : type.code === 'AUCTION' ? 'AUC' : 'RFQ';
  const no = await nextNumber(prefix, 'tender', 'tender_no');
  let cloneFrom = null;
  if (b.clone_from) cloneFrom = await loadTender(Number(b.clone_from));
  const t = (await q(
    `INSERT INTO tender(tender_no, type_id, title_mn, title_en, description_mn, description_en, department, category_id,
        buyer_id, end_user_id, publish_at, close_at, clarification_deadline, currency_policy, partial_allowed, alternative_allowed,
        qualification_required, dd_required, is_public, email_subject, email_body, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
    [no, type.id, b.title_mn || (cloneFrom ? cloneFrom.title_mn + ' (хуулбар)' : 'Шинэ тендер'), b.title_en || cloneFrom?.title_en || null,
     b.description_mn || cloneFrom?.description_mn || null, b.description_en || cloneFrom?.description_en || null,
     b.department || cloneFrom?.department || null, b.category_id || cloneFrom?.category_id || null,
     b.buyer_id || req.user!.id, b.end_user_id || cloneFrom?.end_user_id || null,
     b.publish_at || null, b.close_at || null, b.clarification_deadline || null,
     b.currency_policy || 'any', b.partial_allowed ?? true, b.alternative_allowed ?? true,
     b.qualification_required ?? false, b.dd_required ?? false, b.is_public ?? false,
     b.email_subject || null, b.email_body || null, req.user!.id]))[0];
  if (cloneFrom) {
    for (const it of cloneFrom.items) {
      await q(`INSERT INTO tender_item(tender_id, line_no, pr_no, material_no, description, quantity, uom, manufacturer, part_no, datasheet_required, license_required, certificate_required)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [t.id, it.line_no, it.pr_no, it.material_no, it.description, it.quantity, it.uom, it.manufacturer, it.part_no, it.datasheet_required, it.license_required, it.certificate_required]);
    }
    for (const rq of cloneFrom.requirements) {
      await q(`INSERT INTO tender_requirement(tender_id, line_no, label_mn, label_en, required, attachment_required) VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.id, rq.line_no, rq.label_mn, rq.label_en, rq.required, rq.attachment_required]);
    }
  }
  await audit(req, 'tender_created', 'tender', t.id, { after: no });
  res.json(t);
});

r.put('/:id(\\d+)', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!['draft', 'pending_approval'].includes(t.status)) return bad(res, 'immutable_after_publish');
  const b = req.body || {};
  await q(
    `UPDATE tender SET title_mn=COALESCE($1,title_mn), title_en=$2, description_mn=$3, description_en=$4,
       department=$5, category_id=$6, end_user_id=$7, publish_at=$8, close_at=$9, clarification_deadline=$10,
       currency_policy=COALESCE($11,currency_policy), partial_allowed=COALESCE($12,partial_allowed),
       alternative_allowed=COALESCE($13,alternative_allowed), qualification_required=COALESCE($14,qualification_required),
       dd_required=COALESCE($15,dd_required), is_public=COALESCE($16,is_public),
       email_subject=$17, email_body=$18, updated_at=now() WHERE id=$19`,
    [b.title_mn, b.title_en ?? t.title_en, b.description_mn ?? t.description_mn, b.description_en ?? t.description_en,
     b.department ?? t.department, b.category_id ?? t.category_id, b.end_user_id ?? t.end_user_id,
     b.publish_at ?? t.publish_at, b.close_at ?? t.close_at, b.clarification_deadline ?? t.clarification_deadline,
     b.currency_policy, b.partial_allowed, b.alternative_allowed, b.qualification_required, b.dd_required, b.is_public,
     b.email_subject ?? t.email_subject, b.email_body ?? t.email_body, t.id]);
  await audit(req, 'tender_updated', 'tender', t.id);
  res.json({ ok: true });
});

// items — typed validation (DEF-02 control: manufacturer must be text, qty numeric)
r.put('/:id(\\d+)/items', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!['draft', 'pending_approval'].includes(t.status)) return bad(res, 'immutable_after_publish');
  const items: any[] = req.body?.items || [];
  if (!Array.isArray(items)) return bad(res, 'invalid_items', 'items must be an array');
  const errors: any[] = [];
  items.forEach((it, idx) => {
    const line = idx + 1;
    if (!it.description || !String(it.description).trim()) errors.push({ line, field: 'description', error: 'required' });
    const qty = Number(it.quantity);
    if (!isFinite(qty) || qty <= 0) errors.push({ line, field: 'quantity', error: 'must_be_positive_number' });
    if (it.manufacturer !== undefined && it.manufacturer !== null && typeof it.manufacturer === 'number')
      it.manufacturer = String(it.manufacturer); // typed import guard
  });
  if (errors.length) return res.status(400).json({ error: 'validation_failed', rows: errors });
  await tx(async c => {
    await c.query('DELETE FROM tender_item WHERE tender_id=$1', [t.id]);
    let line = 1;
    for (const it of items) {
      await c.query(
        `INSERT INTO tender_item(tender_id, line_no, pr_no, material_no, description, quantity, uom, manufacturer, part_no, datasheet_required, license_required, certificate_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [t.id, line++, it.pr_no || null, it.material_no || null, String(it.description).trim(), Number(it.quantity),
         it.uom || 'EA', it.manufacturer ? String(it.manufacturer) : null, it.part_no ? String(it.part_no) : null,
         !!it.datasheet_required, !!it.license_required, !!it.certificate_required]);
    }
  });
  await audit(req, 'tender_items_updated', 'tender', t.id, { after: `${items.length} items` });
  res.json({ ok: true, count: items.length });
});

r.put('/:id(\\d+)/requirements', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!['draft', 'pending_approval'].includes(t.status)) return bad(res, 'immutable_after_publish');
  const reqs: any[] = req.body?.requirements || [];
  await tx(async c => {
    await c.query('DELETE FROM tender_requirement WHERE tender_id=$1', [t.id]);
    let line = 1;
    for (const rq of reqs) {
      if (!rq.label_mn) continue;
      await c.query(`INSERT INTO tender_requirement(tender_id, line_no, label_mn, label_en, required, attachment_required) VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.id, line++, rq.label_mn, rq.label_en || null, rq.required ?? true, !!rq.attachment_required]);
    }
  });
  res.json({ ok: true });
});

// recipient selection (spec 8.7 step 5)
r.post('/:id(\\d+)/recipients/preview', requireInternal, async (req, res) => {
  const f = req.body || {};
  const cond: string[] = [`o.status IN ('approved','submitted','under_review')`]; const params: any[] = [];
  if (f.approved_only) cond.length = 0, cond.push(`o.status='approved'`);
  if (f.residency) { params.push(f.residency); cond.push(`o.residency=$${params.length}`); }
  if (f.category_id) { params.push(f.category_id); cond.push(`EXISTS (SELECT 1 FROM org_category oc WHERE oc.organization_id=o.id AND oc.category_id=$${params.length})`); }
  if (f.qualified_only) cond.push(`EXISTS (SELECT 1 FROM qual_submission qs JOIN qual_program p ON p.id=qs.program_id AND p.ptype='prequalification' WHERE qs.organization_id=o.id AND qs.status='approved')`);
  cond.push(`NOT EXISTS (SELECT 1 FROM org_restriction rr WHERE rr.organization_id=o.id AND rr.active)`);
  const rows = await q(
    `SELECT o.id, o.name_mn, o.name_en, o.registry_no, o.residency, o.status, o.risk_level,
       (SELECT email FROM org_contact c WHERE c.organization_id=o.id AND c.contact_type='primary' LIMIT 1) AS email
     FROM organization o WHERE ${cond.join(' AND ')} ORDER BY o.name_mn LIMIT 1000`, params);
  res.json(rows);
});

r.put('/:id(\\d+)/recipients', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!['draft', 'pending_approval'].includes(t.status)) return bad(res, 'recipients_frozen_after_publish');
  const orgIds: number[] = req.body?.orgIds || [];
  const externalEmails: string[] = req.body?.externalEmails || [];
  await tx(async c => {
    await c.query('DELETE FROM tender_invitation WHERE tender_id=$1', [t.id]);
    for (const oid of [...new Set(orgIds)]) {
      await c.query('INSERT INTO tender_invitation(tender_id, organization_id) VALUES ($1,$2)', [t.id, oid]);
    }
    for (const em of [...new Set(externalEmails)]) {
      if (/^[^@\s]+@[^@\s]+$/.test(em)) await c.query('INSERT INTO tender_invitation(tender_id, external_email) VALUES ($1,$2)', [t.id, em]);
    }
  });
  await audit(req, 'tender_recipients_set', 'tender', t.id, { after: `${orgIds.length} orgs, ${externalEmails.length} external` });
  res.json({ ok: true, count: orgIds.length + externalEmails.length });
});

// validation summary (spec 8.7 step 7)
async function validateTender(t: any) {
  const errors: any[] = []; const warnings: any[] = [];
  if (!t.title_mn) errors.push({ loc: 'main', error: 'title_required' });
  if (!t.close_at) errors.push({ loc: 'dates', error: 'close_date_required' });
  if (t.close_at && new Date(t.close_at) <= new Date()) errors.push({ loc: 'dates', error: 'close_date_past' });
  if (t.publish_at && t.close_at && new Date(t.publish_at) >= new Date(t.close_at)) errors.push({ loc: 'dates', error: 'publish_after_close' });
  const invCount = (await q1('SELECT count(*)::int AS c FROM tender_invitation WHERE tender_id=$1', [t.id])).c;
  if (!t.is_public && invCount === 0) errors.push({ loc: 'recipients', error: 'no_recipients' });
  if (t.has_items) {
    const itemCount = (await q1('SELECT count(*)::int AS c FROM tender_item WHERE tender_id=$1', [t.id])).c;
    if (itemCount === 0) errors.push({ loc: 'items', error: 'no_items' });
  } else {
    const reqCount = (await q1('SELECT count(*)::int AS c FROM tender_requirement WHERE tender_id=$1', [t.id])).c;
    if (reqCount === 0 && t.type_code === 'EOI') warnings.push({ loc: 'requirements', warning: 'no_requirements' });
  }
  if (!t.email_subject) warnings.push({ loc: 'email', warning: 'no_email_subject' });
  if (!t.title_en) warnings.push({ loc: 'main', warning: 'missing_english_title' });
  return { errors, warnings, invitationCount: invCount };
}

r.get('/:id(\\d+)/validate', requireInternal, async (req, res) => {
  const t = await loadTender(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'not_found' });
  res.json(await validateTender(t));
});

// request publish approval (state machine 9.4)
r.post('/:id(\\d+)/request-publish', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const t = await loadTender(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (t.status !== 'draft') return bad(res, 'invalid_state', t.status);
  const v = await validateTender(t);
  if (v.errors.length) return res.status(400).json({ error: 'validation_failed', ...v });
  // SoD: tender creator/buyer cannot be sole approver — assign approvers excluding requester
  const approvers = await q(
    `SELECT id, display_name FROM app_user WHERE user_type='internal' AND role='Approver' AND status='active' AND id<>$1 ORDER BY id LIMIT 2`,
    [req.user!.id]);
  if (!approvers.length) return bad(res, 'no_approver_available');
  const ai = (await q(
    `INSERT INTO approval_instance(entity_type, entity_id, total_stages, requested_by) VALUES ('tender_publish',$1,$2,$3) RETURNING *`,
    [t.id, 1, req.user!.id]))[0];
  await q(`INSERT INTO approval_stage(approval_id, stage_no, stage_name, assignee_id, status, due_at) VALUES ($1,1,'Publish approval',$2,'pending', now() + interval '2 days')`,
    [ai.id, approvers[0].id]);
  await q(`UPDATE tender SET status='pending_approval', updated_at=now() WHERE id=$1`, [t.id]);
  await audit(req, 'tender_publish_requested', 'tender', t.id);
  await notify(approvers[0].id, null, 'approval', 'Тендер нийтлэх зөвшөөрөл хүлээгдэж байна', 'Tender publish approval pending',
    `${t.tender_no} — ${t.title_mn}`, `${t.tender_no} — ${t.title_en || t.title_mn}`, `/admin/approvals`);
  res.json({ ok: true, approvalId: ai.id });
});

// internal publish executor — called by approvals module or directly by SystemAdmin
export async function publishTender(tenderId: number, reqCtx: any) {
  const t = await loadTender(tenderId);
  if (!t) throw new Error('not_found');
  await q(`UPDATE tender SET status='published', publish_at=COALESCE(publish_at, now()), published_version=published_version+1, updated_at=now() WHERE id=$1`, [tenderId]);
  const invs = await q(`SELECT i.*, o.name_mn FROM tender_invitation i LEFT JOIN organization o ON o.id=i.organization_id WHERE i.tender_id=$1`, [tenderId]);
  for (const inv of invs) {
    await q(`UPDATE tender_invitation SET status='sent', sent_at=now() WHERE id=$1`, [inv.id]);
    if (inv.organization_id) {
      await notifyOrg(inv.organization_id, 'invitation',
        'Тендерийн урилга', 'Tender invitation',
        `${t.tender_no} — ${t.title_mn}. Хаагдах: ${t.close_at ? new Date(t.close_at).toISOString().slice(0, 16).replace('T', ' ') : ''} UTC`,
        `${t.tender_no} — ${t.title_en || t.title_mn}`, `/supplier/tenders/${t.id}`);
    } else if (inv.external_email) {
      await sendEmail(inv.external_email, t.email_subject || `OASIS Tender invitation ${t.tender_no}`,
        (t.email_body || '') + `\n\nTender: ${t.tender_no} — ${t.title_mn}`);
    }
  }
  await audit(reqCtx, 'tender_published', 'tender', tenderId, { after: `${invs.length} invitations sent` });
}

// deadline change — MUST notify (DEF-08 control)
r.post('/:id(\\d+)/deadline', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const { new_close_at, reason } = req.body || {};
  if (!new_close_at || !reason) return bad(res, 'reason_and_date_required');
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!['published', 'negotiation'].includes(t.status)) return bad(res, 'invalid_state', t.status);
  await tx(async c => {
    await c.query('UPDATE tender SET close_at=$1, updated_at=now() WHERE id=$2', [new_close_at, t.id]);
    const invs = await c.query(`SELECT organization_id FROM tender_invitation WHERE tender_id=$1 AND organization_id IS NOT NULL`, [t.id]);
    await c.query(
      `INSERT INTO tender_deadline_change(tender_id, old_close_at, new_close_at, reason, changed_by, notified_count) VALUES ($1,$2,$3,$4,$5,$6)`,
      [t.id, t.close_at, new_close_at, reason, req.user!.id, invs.rows.length]);
  });
  const invs = await q(`SELECT organization_id FROM tender_invitation WHERE tender_id=$1 AND organization_id IS NOT NULL`, [t.id]);
  for (const inv of invs) {
    await notifyOrg(inv.organization_id, 'deadline', 'Тендерийн хугацаа өөрчлөгдлөө', 'Tender deadline changed',
      `${t.tender_no}: шинэ хаагдах хугацаа ${new Date(new_close_at).toISOString().slice(0, 16).replace('T', ' ')} UTC. Шалтгаан: ${reason}`,
      `${t.tender_no}: new close ${new Date(new_close_at).toISOString().slice(0, 16).replace('T', ' ')} UTC. Reason: ${reason}`,
      `/supplier/tenders/${t.id}`);
  }
  await audit(req, 'deadline_changed', 'tender', t.id, { reason, before: String(t.close_at), after: String(new_close_at) });
  res.json({ ok: true, notified: invs.length });
});

r.post('/:id(\\d+)/close', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t || t.status !== 'published') return bad(res, 'invalid_state', t?.status);
  await q(`UPDATE tender SET status='closed', updated_at=now() WHERE id=$1`, [t.id]);
  await audit(req, 'tender_closed', 'tender', t.id, { reason: req.body?.reason || 'manual' });
  res.json({ ok: true });
});

r.post('/:id(\\d+)/start-evaluation', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t || t.status !== 'closed') return bad(res, 'invalid_state', t?.status);
  await q(`UPDATE tender SET status='in_evaluation', updated_at=now() WHERE id=$1`, [t.id]);
  await q(`UPDATE bid_response SET status='evaluated' WHERE tender_id=$1 AND status='submitted'`, [t.id]);
  if (t.end_user_id) {
    await notify(t.end_user_id, null, 'system', 'Үнэлгээ хийхэд бэлэн', 'Evaluation ready',
      `${t.tender_no} үнэлгээнд орлоо.`, `${t.tender_no} entered evaluation.`, `/admin/tenders/${t.id}/evaluation`);
  }
  await audit(req, 'evaluation_started', 'tender', t.id);
  res.json({ ok: true });
});

r.post('/:id(\\d+)/cancel', requireInternal, requireRole(...BUYER_ROLES), async (req, res) => {
  const { reason } = req.body || {};
  if (!reason) return bad(res, 'reason_required');
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (['awarded', 'cancelled', 'archived'].includes(t.status)) return bad(res, 'invalid_state', t.status);
  await q(`UPDATE tender SET status='cancelled', cancel_reason=$1, updated_at=now() WHERE id=$2`, [reason, t.id]);
  const invs = await q(`SELECT DISTINCT organization_id FROM tender_invitation WHERE tender_id=$1 AND organization_id IS NOT NULL`, [t.id]);
  for (const inv of invs) {
    await notifyOrg(inv.organization_id, 'system', 'Тендер цуцлагдлаа', 'Tender cancelled',
      `${t.tender_no}: ${reason}`, `${t.tender_no}: ${reason}`, `/supplier/tenders/${t.id}`);
  }
  await audit(req, 'tender_cancelled', 'tender', t.id, { reason });
  res.json({ ok: true });
});

export default r;
