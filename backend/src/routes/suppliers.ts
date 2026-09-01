import { Router } from 'express';
import { q, q1 } from '../db';
import { requireAuth, requireSupplier, requireInternal, requireRole } from '../util/auth';
import { audit, notify, notifyOrg, bad, orgActiveRestriction } from '../util/helpers';

const r = Router();
r.use(requireAuth);

// ============ SUPPLIER SIDE — own profile ============
async function loadFullProfile(orgId: number) {
  const org = await q1('SELECT * FROM organization WHERE id=$1', [orgId]);
  if (!org) return null;
  const profile = await q1('SELECT * FROM org_profile WHERE organization_id=$1', [orgId]);
  const contacts = await q('SELECT * FROM org_contact WHERE organization_id=$1 ORDER BY contact_type DESC, id', [orgId]);
  const shareholders = await q('SELECT * FROM org_shareholder WHERE organization_id=$1 ORDER BY id', [orgId]);
  const permits = await q('SELECT * FROM org_permit WHERE organization_id=$1 ORDER BY id', [orgId]);
  const categories = await q(
    `SELECT c.id, c.code, c.name_mn, c.name_en FROM org_category oc JOIN ref_category c ON c.id=oc.category_id WHERE oc.organization_id=$1`, [orgId]);
  const changeRequests = await q('SELECT * FROM profile_change_request WHERE organization_id=$1 ORDER BY id DESC LIMIT 10', [orgId]);
  return { org, profile, contacts, shareholders, permits, categories, changeRequests };
}

function computeCompletion(p: any): number {
  let score = 0; const total = 8;
  if (p.org.name_mn) score++;
  if (p.profile?.address_line1 && p.profile?.address_province) score++;
  if (p.profile?.phone) score++;
  if (p.profile?.total_employees > 0) score++;
  if (p.contacts.length >= 1) score++;
  if (p.shareholders.length >= 1) score++;
  if (p.permits.length >= 1) score++;
  if (p.categories.length >= 1) score++;
  return Math.round((score / total) * 100);
}

r.get('/my/profile', requireSupplier, async (req, res) => {
  const data = await loadFullProfile(req.user!.orgId!);
  if (!data) return res.status(404).json({ error: 'not_found' });
  const completion = computeCompletion(data);
  if (completion !== data.org.completion_percent) {
    await q('UPDATE organization SET completion_percent=$1 WHERE id=$2', [completion, data.org.id]);
    data.org.completion_percent = completion;
  }
  res.json(data);
});

r.put('/my/profile/general', requireSupplier, async (req, res) => {
  const orgId = req.user!.orgId!;
  const org = await q1('SELECT * FROM organization WHERE id=$1', [orgId]);
  const b = req.body || {};
  // Approved profiles cannot be edited directly — a change request is created (spec 7.4 / 9.2)
  if (org.status === 'approved') {
    await q(`INSERT INTO profile_change_request(organization_id, payload, requested_by) VALUES ($1,$2,$3)`,
      [orgId, JSON.stringify(b), req.user!.id]);
    await audit(req, 'profile_change_requested', 'organization', orgId);
    return res.json({ ok: true, changeRequest: true, message: 'change_request_created' });
  }
  const we = { total: parseInt(b.total_employees) || 0, mn: parseInt(b.mongolian_employees) || 0, ug: parseInt(b.umnugovi_employees) || 0 };
  if (we.mn > we.total || we.ug > we.total) return bad(res, 'workforce_invalid', 'Монгол/Өмнөговь ажилтан нийт тооноос их байж болохгүй');
  await q(`UPDATE organization SET name_mn=COALESCE($1,name_mn), name_en=COALESCE($2,name_en), updated_at=now() WHERE id=$3`,
    [b.name_mn || null, b.name_en || null, orgId]);
  await q(
    `UPDATE org_profile SET address_country=$1, address_province=$2, address_district=$3, address_postcode=$4,
       address_line1=$5, address_line2=$6, phone=$7, website=$8, established_year=$9, legal_form=$10,
       ownership_type=$11, total_employees=$12, mongolian_employees=$13, umnugovi_employees=$14,
       bank_name=$15, tax_number=$16, intro_mn=$17, intro_en=$18
     WHERE organization_id=$19`,
    [b.address_country || 'MN', b.address_province || null, b.address_district || null, b.address_postcode || null,
     b.address_line1 || null, b.address_line2 || null, b.phone || null, b.website || null, b.established_year || null,
     b.legal_form || null, b.ownership_type || null, we.total, we.mn, we.ug,
     b.bank_name || null, b.tax_number || null, b.intro_mn || null, b.intro_en || null, orgId]);
  await audit(req, 'profile_updated', 'organization', orgId);
  res.json({ ok: true });
});

// team members
r.post('/my/contacts', requireSupplier, async (req, res) => {
  const b = req.body || {};
  if (!b.full_name) return bad(res, 'name_required');
  const row = (await q(
    `INSERT INTO org_contact(organization_id, contact_type, full_name, position, email, phone1, phone2, receives_email, system_role)
     VALUES ($1,'member',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user!.orgId, b.full_name, b.position || null, b.email || null, b.phone1 || null, b.phone2 || null, !!b.receives_email, b.system_role || null]))[0];
  res.json(row);
});
r.put('/my/contacts/:id', requireSupplier, async (req, res) => {
  const b = req.body || {};
  const row = await q1('SELECT * FROM org_contact WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  await q(`UPDATE org_contact SET full_name=$1, position=$2, email=$3, phone1=$4, phone2=$5, receives_email=$6, active=$7 WHERE id=$8`,
    [b.full_name || row.full_name, b.position ?? row.position, b.email ?? row.email, b.phone1 ?? row.phone1, b.phone2 ?? row.phone2,
     b.receives_email ?? row.receives_email, b.active ?? row.active, row.id]);
  res.json({ ok: true });
});
r.delete('/my/contacts/:id', requireSupplier, async (req, res) => {
  const row = await q1('SELECT * FROM org_contact WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.contact_type === 'primary') return bad(res, 'cannot_delete_primary');
  await q('DELETE FROM org_contact WHERE id=$1', [row.id]);
  res.json({ ok: true });
});

// shareholders
r.post('/my/shareholders', requireSupplier, async (req, res) => {
  const b = req.body || {};
  if (!b.name) return bad(res, 'name_required');
  const pct = Number(b.ownership_percent) || 0;
  if (pct < 0 || pct > 100) return bad(res, 'invalid_percent');
  const cur = await q1('SELECT COALESCE(sum(ownership_percent),0) AS s FROM org_shareholder WHERE organization_id=$1', [req.user!.orgId]);
  if (Number(cur.s) + pct > 100.0001) return bad(res, 'percent_sum_exceeds_100', `Одоогийн нийлбэр: ${cur.s}%`);
  const row = (await q(
    `INSERT INTO org_shareholder(organization_id, name, owner_type, id_ref, ownership_percent, country, beneficial_owner)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user!.orgId, b.name, b.owner_type || 'individual', b.id_ref || null, pct, b.country || 'MN', !!b.beneficial_owner]))[0];
  res.json(row);
});
r.delete('/my/shareholders/:id', requireSupplier, async (req, res) => {
  await q('DELETE FROM org_shareholder WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  res.json({ ok: true });
});

// permits
r.post('/my/permits', requireSupplier, async (req, res) => {
  const b = req.body || {};
  if (!b.permit_type) return bad(res, 'type_required');
  const row = (await q(
    `INSERT INTO org_permit(organization_id, permit_type, number, issuer, manufacturer, issued_on, expires_on, attachment_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user!.orgId, b.permit_type, b.number || null, b.issuer || null, b.manufacturer || null,
     b.issued_on || null, b.expires_on || null, b.attachment_id || null]))[0];
  res.json(row);
});
r.delete('/my/permits/:id', requireSupplier, async (req, res) => {
  await q('DELETE FROM org_permit WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  res.json({ ok: true });
});

// categories (max 20 per spec 7.4)
r.put('/my/categories', requireSupplier, async (req, res) => {
  const ids: number[] = (req.body?.categoryIds || []).slice(0, 20);
  await q('DELETE FROM org_category WHERE organization_id=$1', [req.user!.orgId]);
  for (const cid of ids) {
    await q('INSERT INTO org_category(organization_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user!.orgId, cid]);
  }
  res.json({ ok: true, count: ids.length });
});

// submit profile for review
r.post('/my/profile/submit', requireSupplier, async (req, res) => {
  const data = await loadFullProfile(req.user!.orgId!);
  const completion = computeCompletion(data);
  if (completion < 60) return bad(res, 'profile_incomplete', { completion, required: 60 });
  if (!['draft', 'needs_correction', 'rejected'].includes(data!.org.status)) return bad(res, 'invalid_state', data!.org.status);
  await q(`UPDATE organization SET status='submitted', submitted_at=now(), completion_percent=$1, profile_version=profile_version+1 WHERE id=$2`,
    [completion, req.user!.orgId]);
  await audit(req, 'profile_submitted', 'organization', req.user!.orgId);
  const admins = await q(`SELECT id FROM app_user WHERE user_type='internal' AND role IN ('Compliance','SystemAdmin')`);
  for (const a of admins) {
    await notify(a.id, null, 'qualification', 'Профайл хянуулахаар ирлээ', 'Profile submitted for review',
      `${data!.org.name_mn} профайлаа илгээлээ.`, `${data!.org.name_mn} submitted their profile.`, `/admin/suppliers/${req.user!.orgId}`);
  }
  res.json({ ok: true, status: 'submitted' });
});

// my KPI / scores / feedback
r.get('/my/scores', requireSupplier, async (req, res) => {
  const scores = await q('SELECT * FROM supplier_score WHERE organization_id=$1 ORDER BY period', [req.user!.orgId]);
  const feedback = await q('SELECT * FROM supplier_feedback WHERE organization_id=$1 ORDER BY id DESC', [req.user!.orgId]);
  res.json({ scores, feedback });
});

// ============ ADMIN SIDE — supplier management (spec 8.3) ============
r.get('/', requireInternal, async (req, res) => {
  const { status, residency, search, risk, category } = req.query as any;
  const cond: string[] = ['1=1']; const params: any[] = [];
  if (status) { params.push(status); cond.push(`o.status=$${params.length}`); }
  if (residency) { params.push(residency); cond.push(`o.residency=$${params.length}`); }
  if (risk) { params.push(risk); cond.push(`o.risk_level=$${params.length}`); }
  if (category) { params.push(Number(category)); cond.push(`EXISTS (SELECT 1 FROM org_category oc2 WHERE oc2.organization_id=o.id AND oc2.category_id=$${params.length})`); }
  if (search) { params.push(`%${search}%`); cond.push(`(o.name_mn ILIKE $${params.length} OR o.name_en ILIKE $${params.length} OR o.registry_no ILIKE $${params.length} OR o.vendor_no ILIKE $${params.length})`); }
  const rows = await q(
    `SELECT o.*, (SELECT count(*) FROM bid_response br WHERE br.organization_id=o.id AND br.status='submitted') AS submitted_bids,
       (SELECT string_agg(DISTINCT qs.status, ',') FROM qual_submission qs WHERE qs.organization_id=o.id) AS qual_statuses,
       (SELECT count(*) FROM org_restriction rr WHERE rr.organization_id=o.id AND rr.active) AS restrictions,
       (SELECT full_name FROM org_contact c WHERE c.organization_id=o.id AND c.contact_type='primary' LIMIT 1) AS primary_contact,
       (SELECT string_agg(rc.code, ', ' ORDER BY rc.code) FROM org_category oc3 JOIN ref_category rc ON rc.id=oc3.category_id WHERE oc3.organization_id=o.id) AS category_codes
     FROM organization o WHERE ${cond.join(' AND ')} ORDER BY o.updated_at DESC LIMIT 500`, params);
  res.json(rows);
});

r.get('/:id(\\d+)', requireInternal, async (req, res) => {
  const data = await loadFullProfile(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'not_found' });
  const quals = await q(`SELECT qs.*, p.name_mn AS program_name, p.ptype FROM qual_submission qs JOIN qual_program p ON p.id=qs.program_id WHERE qs.organization_id=$1 ORDER BY qs.id DESC`, [req.params.id]);
  const restrictions = await q('SELECT * FROM org_restriction WHERE organization_id=$1 ORDER BY id DESC', [req.params.id]);
  const ddCases = await q('SELECT * FROM dd_case WHERE organization_id=$1 ORDER BY id DESC', [req.params.id]);
  const scores = await q('SELECT * FROM supplier_score WHERE organization_id=$1 ORDER BY period', [req.params.id]);
  const timeline = await q(`SELECT * FROM audit_event WHERE entity_type='organization' AND entity_id=$1 ORDER BY occurred_at DESC LIMIT 50`, [String(req.params.id)]);
  const bids = await q(`SELECT br.*, t.tender_no, t.title_mn FROM bid_response br JOIN tender t ON t.id=br.tender_id WHERE br.organization_id=$1 ORDER BY br.id DESC LIMIT 20`, [req.params.id]);
  res.json({ ...data, quals, restrictions, ddCases, scores, timeline, bids });
});

r.post('/:id(\\d+)/review', requireInternal, requireRole('Compliance', 'SystemAdmin'), async (req, res) => {
  const { decision, comment } = req.body || {}; // approve | needs_correction | reject
  const org = await q1('SELECT * FROM organization WHERE id=$1', [req.params.id]);
  if (!org) return res.status(404).json({ error: 'not_found' });
  if (!['submitted', 'under_review'].includes(org.status)) return bad(res, 'invalid_state', org.status);
  if (decision !== 'approve' && !comment) return bad(res, 'reason_required');
  const newStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_correction';
  await q('UPDATE organization SET status=$1, reviewed_by=$2, review_comment=$3, updated_at=now() WHERE id=$4',
    [newStatus, req.user!.id, comment || null, org.id]);
  await audit(req, 'profile_review', 'organization', org.id, { reason: comment, before: org.status, after: newStatus });
  const titles: any = {
    approved: ['Профайл батлагдлаа', 'Profile approved', 'Таны байгууллагын профайл батлагдлаа.', 'Your organization profile has been approved.'],
    needs_correction: ['Профайл засвар шаардлагатай', 'Profile needs correction', `Засварлах шаардлага: ${comment}`, `Correction required: ${comment}`],
    rejected: ['Профайл татгалзагдлаа', 'Profile rejected', `Шалтгаан: ${comment}`, `Reason: ${comment}`],
  };
  const t = titles[newStatus];
  await notifyOrg(org.id, 'qualification', t[0], t[1], t[2], t[3], '/supplier/profile');
  res.json({ ok: true, status: newStatus });
});

// change request decisions
r.get('/change-requests', requireInternal, async (_req, res) => {
  const rows = await q(`SELECT cr.*, o.name_mn FROM profile_change_request cr JOIN organization o ON o.id=cr.organization_id WHERE cr.status='pending' ORDER BY cr.id`);
  res.json(rows);
});
r.post('/change-requests/:id/decide', requireInternal, requireRole('Compliance', 'SystemAdmin'), async (req, res) => {
  const { decision, reason } = req.body || {};
  const cr = await q1('SELECT * FROM profile_change_request WHERE id=$1 AND status=\'pending\'', [req.params.id]);
  if (!cr) return res.status(404).json({ error: 'not_found' });
  if (decision === 'approve') {
    const b = cr.payload;
    await q(`UPDATE organization SET name_mn=COALESCE($1,name_mn), name_en=COALESCE($2,name_en), profile_version=profile_version+1, updated_at=now() WHERE id=$3`,
      [b.name_mn || null, b.name_en || null, cr.organization_id]);
    await q(
      `UPDATE org_profile SET address_province=COALESCE($1,address_province), address_district=COALESCE($2,address_district),
        address_line1=COALESCE($3,address_line1), phone=COALESCE($4,phone), website=COALESCE($5,website),
        total_employees=COALESCE($6,total_employees), mongolian_employees=COALESCE($7,mongolian_employees), umnugovi_employees=COALESCE($8,umnugovi_employees)
       WHERE organization_id=$9`,
      [b.address_province, b.address_district, b.address_line1, b.phone, b.website,
       b.total_employees, b.mongolian_employees, b.umnugovi_employees, cr.organization_id]);
  }
  await q('UPDATE profile_change_request SET status=$1, reason=$2, decided_by=$3, decided_at=now() WHERE id=$4',
    [decision === 'approve' ? 'approved' : 'rejected', reason || null, req.user!.id, cr.id]);
  await audit(req, 'profile_change_decision', 'organization', cr.organization_id, { reason, after: decision });
  await notifyOrg(cr.organization_id, 'qualification',
    decision === 'approve' ? 'Профайлын өөрчлөлт батлагдлаа' : 'Профайлын өөрчлөлт татгалзагдлаа',
    decision === 'approve' ? 'Profile change approved' : 'Profile change rejected',
    reason || '', reason || '', '/supplier/profile');
  res.json({ ok: true });
});

// suspend / blacklist / reactivate (spec 8.3)
r.post('/:id(\\d+)/restrict', requireInternal, requireRole('Compliance', 'SystemAdmin'), async (req, res) => {
  const { rtype, reason, end_at } = req.body || {};
  if (!['suspend', 'blacklist'].includes(rtype)) return bad(res, 'invalid_type');
  if (!reason) return bad(res, 'reason_required');
  await q(`INSERT INTO org_restriction(organization_id, rtype, reason, end_at, approved_by) VALUES ($1,$2,$3,$4,$5)`,
    [req.params.id, rtype, reason, end_at || null, req.user!.id]);
  await q('UPDATE organization SET status=$1, updated_at=now() WHERE id=$2', [rtype === 'suspend' ? 'suspended' : 'blacklisted', req.params.id]);
  await audit(req, 'org_restricted', 'organization', req.params.id, { reason, after: rtype });
  res.json({ ok: true });
});
r.post('/:id(\\d+)/reactivate', requireInternal, requireRole('Compliance', 'SystemAdmin'), async (req, res) => {
  await q('UPDATE org_restriction SET active=false, end_at=now() WHERE organization_id=$1 AND active=true', [req.params.id]);
  await q(`UPDATE organization SET status='approved', updated_at=now() WHERE id=$1`, [req.params.id]);
  await audit(req, 'org_reactivated', 'organization', req.params.id, { reason: req.body?.reason });
  res.json({ ok: true });
});

// scores (admin enters KPI/DIFOT — spec 8.19)
r.post('/:id(\\d+)/scores', requireInternal, async (req, res) => {
  const { period, difot, quality_score, comment } = req.body || {};
  if (!period) return bad(res, 'period_required');
  const overall = ((Number(difot) || 0) + (Number(quality_score) || 0)) / 2;
  const row = (await q(
    `INSERT INTO supplier_score(organization_id, period, difot, quality_score, overall, comment, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (organization_id, period) DO UPDATE SET difot=$3, quality_score=$4, overall=$5, comment=$6 RETURNING *`,
    [req.params.id, period, difot || null, quality_score || null, overall, comment || null, req.user!.id]))[0];
  await audit(req, 'score_published', 'organization', req.params.id, { after: period });
  await notifyOrg(Number(req.params.id), 'system', 'KPI үнэлгээ шинэчлэгдлээ', 'KPI score updated',
    `${period} үеийн DIFOT: ${difot}`, `DIFOT for ${period}: ${difot}`, '/supplier/kpi');
  res.json(row);
});

r.post('/:id(\\d+)/feedback', requireInternal, async (req, res) => {
  const { rating, comment, tender_id } = req.body || {};
  const row = (await q(`INSERT INTO supplier_feedback(organization_id, tender_id, rating, comment, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, tender_id || null, rating || null, comment || null, req.user!.id]))[0];
  res.json(row);
});

export default r;
