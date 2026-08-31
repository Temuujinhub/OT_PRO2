import { Router } from 'express';
import { q, q1 } from '../db';
import { requireAuth, requireInternal, requireRole } from '../util/auth';
import { audit, notify, bad, convert, round4 } from '../util/helpers';

const r = Router();
r.use(requireAuth, requireInternal);

// -------- Bid comparison grid (spec 8.10) --------
r.get('/:tenderId(\\d+)/comparison', async (req, res) => {
  const t = await q1(`SELECT t.*, tt.code AS type_code FROM tender t JOIN tender_type tt ON tt.id=t.type_id WHERE t.id=$1`, [req.params.tenderId]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  // Responses are hidden while tender is open (contract rule)
  if (['draft', 'pending_approval', 'published'].includes(t.status)) {
    return res.status(403).json({ error: 'responses_sealed', message: 'Тендер нээлттэй байх үед саналууд харагдахгүй' });
  }
  const items = await q('SELECT * FROM tender_item WHERE tender_id=$1 ORDER BY line_no', [t.id]);
  const responses = await q(
    `SELECT br.*, o.name_mn AS org_name, o.name_en AS org_name_en, o.registry_no, o.vendor_no, o.risk_level
     FROM bid_response br JOIN organization o ON o.id=br.organization_id
     WHERE br.tender_id=$1 AND br.status NOT IN ('draft','no_response') ORDER BY o.name_mn`, [t.id]);
  const grid: any[] = [];
  for (const resp of responses) {
    const currentRev = await q1('SELECT * FROM bid_revision WHERE response_id=$1 ORDER BY revision_no DESC LIMIT 1', [resp.id]);
    const firstRev = await q1('SELECT * FROM bid_revision WHERE response_id=$1 ORDER BY revision_no ASC LIMIT 1', [resp.id]);
    const quotes = currentRev ? await q('SELECT * FROM bid_item_quote WHERE revision_id=$1', [currentRev.id]) : [];
    const origQuotes = firstRev && firstRev.id !== currentRev?.id ? await q('SELECT * FROM bid_item_quote WHERE revision_id=$1', [firstRev.id]) : quotes;
    // reporting currency conversion (MNT) with snapshot
    for (const qt of quotes) {
      const conv = await convert(Number(qt.total_price), qt.currency, 'MNT');
      qt.total_mnt = conv?.amount ?? null; qt.rate = conv?.rate; qt.rate_date = conv?.rateDate;
      const orig = origQuotes.find(o => o.tender_item_id === qt.tender_item_id && o.option_no === qt.option_no);
      qt.original_unit_price = orig ? Number(orig.unit_price) : Number(qt.unit_price);
      qt.negotiated_delta = round4(Number(qt.unit_price) - qt.original_unit_price);
    }
    grid.push({
      response: { id: resp.id, organization_id: resp.organization_id, org_name: resp.org_name, org_name_en: resp.org_name_en,
        registry_no: resp.registry_no, vendor_no: resp.vendor_no, risk_level: resp.risk_level, status: resp.status,
        revision_no: currentRev?.revision_no || 0, submitted_at: resp.submitted_at, validity_days: resp.validity_days },
      quotes,
    });
  }
  const evaluations = await q(
    `SELECT e.*, u.display_name AS evaluator_name,
       (SELECT json_agg(json_build_object('tender_item_id', s.tender_item_id, 'organization_id', s.organization_id,
          'quote_id', s.quote_id, 'selected_qty', s.selected_qty, 'amount', s.amount, 'justification', s.justification))
        FROM item_selection s WHERE s.evaluation_id=e.id) AS selections
     FROM evaluation e JOIN app_user u ON u.id=e.evaluator_id WHERE e.tender_id=$1`, [t.id]);
  res.json({ tender: t, items, grid, evaluations });
});

// -------- Evaluation (spec 8.11/8.12) --------
r.post('/:tenderId(\\d+)/evaluations/:etype', async (req, res) => {
  const etype = req.params.etype; // end_user | buyer
  if (!['end_user', 'buyer'].includes(etype)) return bad(res, 'invalid_type');
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.tenderId]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!['in_evaluation', 'negotiation', 'closed'].includes(t.status)) return bad(res, 'invalid_state', t.status);
  // SoD: end_user evaluation belongs to assigned end user
  if (etype === 'end_user' && t.end_user_id && t.end_user_id !== req.user!.id && req.user!.role !== 'SystemAdmin')
    return res.status(403).json({ error: 'not_assigned_end_user' });
  if (etype === 'buyer' && !['Buyer', 'SystemAdmin'].includes(req.user!.role))
    return res.status(403).json({ error: 'buyer_role_required' });

  const { selections, recommendation, submit } = req.body || {};
  // mandatory recommendation on submit (DEF-13 control)
  if (submit && (!recommendation || String(recommendation).trim().length < 20))
    return bad(res, 'recommendation_required', 'Зөвлөмжийн тайлбар доод тал нь 20 тэмдэгт байх ёстой');

  let ev = await q1('SELECT * FROM evaluation WHERE tender_id=$1 AND etype=$2', [t.id, etype]);
  if (ev && ev.status === 'submitted') return bad(res, 'already_submitted');
  if (!ev) {
    ev = (await q(`INSERT INTO evaluation(tender_id, etype, evaluator_id, recommendation) VALUES ($1,$2,$3,$4) RETURNING *`,
      [t.id, etype, req.user!.id, recommendation || null]))[0];
  } else {
    await q('UPDATE evaluation SET recommendation=$1, evaluator_id=$2 WHERE id=$3', [recommendation || ev.recommendation, req.user!.id, ev.id]);
  }
  if (selections) {
    await q('DELETE FROM item_selection WHERE evaluation_id=$1', [ev.id]);
    for (const s of selections) {
      if (submit && (!s.justification || !String(s.justification).trim())) {
        return bad(res, 'justification_required', `Item ${s.tender_item_id}: тайлбар заавал`);
      }
      const quote = s.quote_id ? await q1('SELECT * FROM bid_item_quote WHERE id=$1', [s.quote_id]) : null;
      await q(
        `INSERT INTO item_selection(evaluation_id, tender_item_id, organization_id, quote_id, selected_qty, amount, currency, justification)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ev.id, s.tender_item_id, s.organization_id, s.quote_id || null,
         s.selected_qty || quote?.quantity || null,
         s.amount ?? (quote ? Number(quote.total_price) : null), quote?.currency || s.currency || 'MNT', s.justification || null]);
    }
  }
  if (submit) {
    await q(`UPDATE evaluation SET status='submitted', submitted_at=now() WHERE id=$1`, [ev.id]);
    await audit(req, `evaluation_submitted_${etype}`, 'tender', t.id);
    const target = etype === 'end_user' ? t.buyer_id : t.end_user_id;
    if (target) await notify(target, null, 'system',
      etype === 'end_user' ? 'End-user үнэлгээ илгээгдлээ' : 'Buyer үнэлгээ илгээгдлээ',
      etype === 'end_user' ? 'End-user evaluation submitted' : 'Buyer evaluation submitted',
      `${t.tender_no}`, `${t.tender_no}`, `/admin/tenders/${t.id}/evaluation`);
  }
  res.json({ ok: true, evaluationId: ev.id, submitted: !!submit });
});

r.post('/:tenderId(\\d+)/evaluations/:etype/reopen', requireRole('Buyer', 'SystemAdmin'), async (req, res) => {
  const { reason } = req.body || {};
  if (!reason) return bad(res, 'reason_required');
  await q(`UPDATE evaluation SET status='returned' WHERE tender_id=$1 AND etype=$2`, [req.params.tenderId, req.params.etype]);
  await audit(req, 'evaluation_reopened', 'tender', req.params.tenderId, { reason });
  res.json({ ok: true });
});

// -------- Send for award approval (spec 9.4: In evaluation → Award pending) --------
r.post('/:tenderId(\\d+)/request-award', requireRole('Buyer', 'SystemAdmin'), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.tenderId]);
  if (!t || !['in_evaluation', 'negotiation'].includes(t.status)) return bad(res, 'invalid_state', t?.status);
  const buyerEval = await q1(`SELECT * FROM evaluation WHERE tender_id=$1 AND etype='buyer' AND status='submitted'`, [t.id]);
  if (!buyerEval) return bad(res, 'buyer_evaluation_required');
  const selections = await q('SELECT * FROM item_selection WHERE evaluation_id=$1', [buyerEval.id]);
  if (!selections.length) return bad(res, 'no_selection');
  if (t.dd_required) {
    const orgs = [...new Set(selections.map((s: any) => s.organization_id))];
    for (const oid of orgs) {
      const dd = await q1(`SELECT * FROM dd_case WHERE organization_id=$1 AND status='decided' AND decision='cleared' AND (expires_on IS NULL OR expires_on > CURRENT_DATE) ORDER BY id DESC LIMIT 1`, [oid]);
      if (!dd) {
        const org = await q1('SELECT name_mn FROM organization WHERE id=$1', [oid]);
        return bad(res, 'dd_gate_failed', `${org?.name_mn}: Due Diligence шийдвэрлэгдээгүй байна`);
      }
    }
  }
  // total in reporting currency (MNT) using snapshot conversion
  let totalMnt = 0;
  for (const s of selections) {
    const conv = await convert(Number(s.amount || 0), s.currency || 'MNT', 'MNT');
    totalMnt += conv?.amount || 0;
  }
  totalMnt = round4(totalMnt);
  // DFA multi-level: >500M MNT needs 3 stages, >100M needs 2, else 1
  const stages = totalMnt > 500_000_000 ? 3 : totalMnt > 100_000_000 ? 2 : 1;
  const approvers = await q(
    `SELECT id, display_name, approval_limit FROM app_user WHERE user_type='internal' AND role='Approver' AND status='active' AND id<>$1 ORDER BY COALESCE(approval_limit,0) ASC`,
    [req.user!.id]);
  if (approvers.length < 1) return bad(res, 'no_approver_available');
  const conv = await convert(totalMnt, 'MNT', 'USD');
  const ai = (await q(
    `INSERT INTO approval_instance(entity_type, entity_id, total_stages, amount, currency, converted_amount, rate, rate_date, requested_by)
     VALUES ('award',$1,$2,$3,'MNT',$4,$5,$6,$7) RETURNING *`,
    [t.id, stages, totalMnt, conv?.amount || null, conv?.rate || null, conv?.rateDate || null, req.user!.id]))[0];
  const stageNames = ['Procurement lead', 'Department head', 'DFA authority'];
  for (let i = 1; i <= stages; i++) {
    const assignee = approvers[Math.min(i - 1, approvers.length - 1)];
    await q(`INSERT INTO approval_stage(approval_id, stage_no, stage_name, assignee_id, status, due_at)
             VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval)`,
      [ai.id, i, stageNames[i - 1], assignee.id, i === 1 ? 'pending' : 'waiting', String(2 * i)]);
    if (i === 1) {
      await notify(assignee.id, null, 'approval', 'Award зөвшөөрөл хүлээгдэж байна', 'Award approval pending',
        `${t.tender_no} — нийт ${totalMnt.toLocaleString()} MNT`, `${t.tender_no} — total ${totalMnt.toLocaleString()} MNT`, '/admin/approvals');
    }
  }
  await q(`UPDATE tender SET status='award_pending', updated_at=now() WHERE id=$1`, [t.id]);
  await audit(req, 'award_approval_requested', 'tender', t.id, { after: `${totalMnt} MNT, ${stages} stages` });
  res.json({ ok: true, approvalId: ai.id, totalMnt, stages });
});

export default r;
