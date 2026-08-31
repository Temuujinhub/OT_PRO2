import { Router } from 'express';
import { q, q1, tx } from '../db';
import { requireAuth, requireInternal } from '../util/auth';
import { audit, notify, notifyOrg, bad, round4 } from '../util/helpers';
import { publishTender } from './tenders';

const r = Router();
r.use(requireAuth, requireInternal);

// -------- Approval Center queue (spec 8.15) --------
r.get('/queue', async (req, res) => {
  const mine = req.query.mine === 'true';
  const cond = mine ? 'AND s.assignee_id=$1' : '';
  const params = mine ? [req.user!.id] : [];
  const rows = await q(
    `SELECT ai.*, s.id AS stage_id, s.stage_no, s.stage_name, s.due_at, s.assignee_id,
        u.display_name AS assignee_name, ru.display_name AS requester_name,
        round(extract(epoch FROM (now() - ai.created_at))/3600)::int AS age_hours,
        (s.due_at < now()) AS overdue,
        CASE ai.entity_type
          WHEN 'tender_publish' THEN (SELECT tender_no || ' — ' || title_mn FROM tender WHERE id=ai.entity_id)
          WHEN 'award' THEN (SELECT tender_no || ' — ' || title_mn FROM tender WHERE id=ai.entity_id)
          WHEN 'award_cancel' THEN (SELECT 'AWARD CANCEL: ' || tender_no FROM tender t JOIN award a ON a.tender_id=t.id WHERE a.id=ai.entity_id)
          ELSE ai.entity_type || ' #' || ai.entity_id END AS entity_label
     FROM approval_instance ai
     JOIN approval_stage s ON s.approval_id=ai.id AND s.status='pending'
     LEFT JOIN app_user u ON u.id=s.assignee_id
     LEFT JOIN app_user ru ON ru.id=ai.requested_by
     WHERE ai.status='pending' ${cond}
     ORDER BY s.due_at NULLS LAST`, params);
  res.json(rows);
});

r.get('/history', async (_req, res) => {
  const rows = await q(
    `SELECT ai.*, ru.display_name AS requester_name,
       (SELECT json_agg(json_build_object('stage_no', s.stage_no, 'stage_name', s.stage_name, 'status', s.status,
          'assignee', u.display_name, 'decided_at', s.decided_at, 'decision_reason', s.decision_reason) ORDER BY s.stage_no)
        FROM approval_stage s LEFT JOIN app_user u ON u.id=s.assignee_id WHERE s.approval_id=ai.id) AS stages,
       CASE ai.entity_type
         WHEN 'tender_publish' THEN (SELECT tender_no FROM tender WHERE id=ai.entity_id)
         WHEN 'award' THEN (SELECT tender_no FROM tender WHERE id=ai.entity_id)
         ELSE ai.entity_type || ' #' || ai.entity_id END AS entity_label
     FROM approval_instance ai LEFT JOIN app_user ru ON ru.id=ai.requested_by
     WHERE ai.status <> 'pending' ORDER BY ai.completed_at DESC NULLS LAST LIMIT 100`);
  res.json(rows);
});

r.get('/:id(\\d+)', async (req, res) => {
  const ai = await q1('SELECT * FROM approval_instance WHERE id=$1', [req.params.id]);
  if (!ai) return res.status(404).json({ error: 'not_found' });
  const stages = await q(
    `SELECT s.*, u.display_name AS assignee_name FROM approval_stage s LEFT JOIN app_user u ON u.id=s.assignee_id
     WHERE s.approval_id=$1 ORDER BY s.stage_no`, [ai.id]);
  let detail: any = null;
  if (['tender_publish', 'award'].includes(ai.entity_type)) {
    detail = await q1(`SELECT t.*, tt.code AS type_code FROM tender t JOIN tender_type tt ON tt.id=t.type_id WHERE t.id=$1`, [ai.entity_id]);
    if (ai.entity_type === 'award' && detail) {
      const buyerEval = await q1(`SELECT * FROM evaluation WHERE tender_id=$1 AND etype='buyer'`, [ai.entity_id]);
      const euEval = await q1(`SELECT * FROM evaluation WHERE tender_id=$1 AND etype='end_user'`, [ai.entity_id]);
      detail.buyer_recommendation = buyerEval?.recommendation;
      detail.end_user_recommendation = euEval?.recommendation;
      detail.selections = buyerEval ? await q(
        `SELECT s.*, o.name_mn AS org_name, ti.line_no, ti.description FROM item_selection s
           JOIN organization o ON o.id=s.organization_id JOIN tender_item ti ON ti.id=s.tender_item_id
         WHERE s.evaluation_id=$1 ORDER BY ti.line_no`, [buyerEval.id]) : [];
    }
  }
  res.json({ approval: ai, stages, detail });
});

// -------- Decide (approve / reject / return) --------
r.post('/:id(\\d+)/decide', async (req, res) => {
  const { decision, reason } = req.body || {}; // approve | reject | return
  if (!['approve', 'reject', 'return'].includes(decision)) return bad(res, 'invalid_decision');
  if (decision !== 'approve' && !reason) return bad(res, 'reason_required');
  const ai = await q1('SELECT * FROM approval_instance WHERE id=$1', [req.params.id]);
  if (!ai || ai.status !== 'pending') return bad(res, 'invalid_state', ai?.status);
  const stage = await q1(`SELECT * FROM approval_stage WHERE approval_id=$1 AND status='pending' ORDER BY stage_no LIMIT 1`, [ai.id]);
  if (!stage) return bad(res, 'no_pending_stage');
  if (stage.assignee_id !== req.user!.id && req.user!.role !== 'SystemAdmin')
    return res.status(403).json({ error: 'not_your_stage', assignee: stage.assignee_id });
  // SoD: requester cannot approve own request
  if (ai.requested_by === req.user!.id && decision === 'approve')
    return res.status(403).json({ error: 'sod_violation', message: 'Хүсэлт гаргасан хүн өөрөө батлах боломжгүй' });

  const newStageStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'returned';
  await q(`UPDATE approval_stage SET status=$1, decided_at=now(), decision_reason=$2, decided_by=$3 WHERE id=$4`,
    [newStageStatus, reason || null, req.user!.id, stage.id]);
  await audit(req, `approval_${decision}`, 'approval', ai.id, { reason, after: `stage ${stage.stage_no}` });

  if (decision === 'approve') {
    const next = await q1(`SELECT * FROM approval_stage WHERE approval_id=$1 AND stage_no=$2`, [ai.id, stage.stage_no + 1]);
    if (next) {
      await q(`UPDATE approval_stage SET status='pending' WHERE id=$1`, [next.id]);
      await q(`UPDATE approval_instance SET current_stage=$1 WHERE id=$2`, [next.stage_no, ai.id]);
      if (next.assignee_id) await notify(next.assignee_id, null, 'approval', 'Танд зөвшөөрлийн хүсэлт ирлээ', 'Approval task assigned',
        `Шат ${next.stage_no}: ${next.stage_name}`, `Stage ${next.stage_no}: ${next.stage_name}`, '/admin/approvals');
      return res.json({ ok: true, nextStage: next.stage_no });
    }
    // final approval → execute entity action
    await q(`UPDATE approval_instance SET status='approved', completed_at=now() WHERE id=$1`, [ai.id]);
    if (ai.entity_type === 'tender_publish') {
      await publishTender(ai.entity_id, req);
    } else if (ai.entity_type === 'award') {
      await executeAward(ai, req);
    } else if (ai.entity_type === 'award_cancel') {
      await executeAwardCancel(ai, req);
    }
    if (ai.requested_by) await notify(ai.requested_by, null, 'approval', 'Хүсэлт бүрэн батлагдлаа', 'Request fully approved',
      `${ai.entity_type} #${ai.entity_id}`, `${ai.entity_type} #${ai.entity_id}`, null as any);
    return res.json({ ok: true, completed: true });
  }

  // reject / return
  await q(`UPDATE approval_instance SET status=$1, completed_at=now() WHERE id=$2`,
    [decision === 'reject' ? 'rejected' : 'returned', ai.id]);
  if (ai.entity_type === 'tender_publish') {
    await q(`UPDATE tender SET status='draft', updated_at=now() WHERE id=$1`, [ai.entity_id]);
  } else if (ai.entity_type === 'award') {
    await q(`UPDATE tender SET status='in_evaluation', updated_at=now() WHERE id=$1`, [ai.entity_id]);
  } else if (ai.entity_type === 'award_cancel') {
    await q(`UPDATE award SET status='issued' WHERE id=$1`, [ai.entity_id]);
  }
  if (ai.requested_by) await notify(ai.requested_by, null, 'approval',
    decision === 'reject' ? 'Хүсэлт татгалзагдлаа' : 'Хүсэлт буцаагдлаа',
    decision === 'reject' ? 'Request rejected' : 'Request returned',
    `Шалтгаан: ${reason}`, `Reason: ${reason}`, null as any);
  res.json({ ok: true, status: decision });
});

// delegate stage
r.post('/:id(\\d+)/delegate', async (req, res) => {
  const { toUserId, reason } = req.body || {};
  if (!toUserId || !reason) return bad(res, 'target_and_reason_required');
  const stage = await q1(`SELECT * FROM approval_stage WHERE approval_id=$1 AND status='pending' LIMIT 1`, [req.params.id]);
  if (!stage) return bad(res, 'no_pending_stage');
  if (stage.assignee_id !== req.user!.id && req.user!.role !== 'SystemAdmin') return res.status(403).json({ error: 'not_your_stage' });
  const target = await q1(`SELECT * FROM app_user WHERE id=$1 AND user_type='internal' AND status='active'`, [toUserId]);
  if (!target) return bad(res, 'invalid_target');
  await q(`UPDATE approval_stage SET assignee_id=$1 WHERE id=$2`, [toUserId, stage.id]);
  await audit(req, 'approval_delegated', 'approval', req.params.id, { reason, after: target.display_name });
  await notify(toUserId, null, 'approval', 'Зөвшөөрлийн ажил шилжүүлэгдлээ', 'Approval delegated to you',
    `${stage.stage_name} — ${reason}`, `${stage.stage_name} — ${reason}`, '/admin/approvals');
  res.json({ ok: true });
});

// -------- Award execution (called on final approval) --------
async function executeAward(ai: any, req: any) {
  const tenderId = ai.entity_id;
  const t = await q1('SELECT * FROM tender WHERE id=$1', [tenderId]);
  const buyerEval = await q1(`SELECT * FROM evaluation WHERE tender_id=$1 AND etype='buyer'`, [tenderId]);
  const selections = await q('SELECT * FROM item_selection WHERE evaluation_id=$1', [buyerEval.id]);
  const ver = await q1('SELECT COALESCE(max(version_no),0)+1 AS v FROM award WHERE tender_id=$1', [tenderId]);
  const award = (await q(
    `INSERT INTO award(tender_id, version_no, total_amount, currency, approval_id, issued_by, letter_text)
     VALUES ($1,$2,$3,'MNT',$4,$5,$6) RETURNING *`,
    [tenderId, ver.v, ai.amount, ai.id, req?.user?.id || null,
     `OASIS AWARD LETTER\nTender: ${t.tender_no} — ${t.title_mn}\nНийт дүн: ${Number(ai.amount).toLocaleString()} MNT\nОгноо: ${new Date().toISOString().slice(0, 10)}`]))[0];
  const winnerOrgs = new Set<number>();
  for (const s of selections) {
    await q(`INSERT INTO award_allocation(award_id, tender_item_id, organization_id, quote_id, quantity, amount, currency)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [award.id, s.tender_item_id, s.organization_id, s.quote_id, s.selected_qty, s.amount, s.currency]);
    winnerOrgs.add(s.organization_id);
  }
  await q(`UPDATE tender SET status='awarded', updated_at=now() WHERE id=$1`, [tenderId]);
  // notify winners + regret to others (spec 8.17)
  const participants = await q(
    `SELECT DISTINCT organization_id FROM bid_response WHERE tender_id=$1 AND status NOT IN ('draft','no_response','withdrawn')`, [tenderId]);
  for (const p of participants) {
    if (winnerOrgs.has(p.organization_id)) {
      await q(`UPDATE bid_response SET status='awarded' WHERE tender_id=$1 AND organization_id=$2`, [tenderId, p.organization_id]);
      await notifyOrg(p.organization_id, 'award', 'Баяр хүргэе — Award!', 'Congratulations — Award!',
        `${t.tender_no} тендерт таны байгууллага шалгарлаа.`, `Your organization has been awarded in ${t.tender_no}.`, `/supplier/tenders/${tenderId}`);
    } else {
      await q(`UPDATE bid_response SET status='regret' WHERE tender_id=$1 AND organization_id=$2`, [tenderId, p.organization_id]);
      await q(`INSERT INTO regret_notice(award_id, organization_id, body) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [award.id, p.organization_id,
         `Regret letter — ${t.tender_no}: Таны саналыг энэ удаад дэмжих боломжгүй болсныг харамсалтайгаар мэдэгдье. Цаашдын хамтын ажиллагаанд амжилт хүсье. / We regret to inform you that your bid was not successful this time.`]);
      await notifyOrg(p.organization_id, 'regret', 'Тендерийн үр дүн', 'Tender result',
        `${t.tender_no}: Таны санал энэ удаад шалгараагүй.`, `${t.tender_no}: Your bid was not successful this time.`, `/supplier/tenders/${tenderId}`);
    }
  }
  await audit(req, 'award_issued', 'tender', tenderId, { after: `award v${ver.v}, ${selections.length} allocations` });
}

// -------- Award cancel / re-award (spec 8.17, DEF-11 control) --------
r.post('/award/:awardId(\\d+)/request-cancel', async (req, res) => {
  const { reason_code, reason } = req.body || {};
  if (!reason_code || !reason) return bad(res, 'reason_required');
  const award = await q1('SELECT * FROM award WHERE id=$1', [req.params.awardId]);
  if (!award || award.status !== 'issued') return bad(res, 'invalid_state', award?.status);
  // dual approval: cannot be the person who issued the award
  const approvers = await q(
    `SELECT id FROM app_user WHERE user_type='internal' AND role IN ('Approver') AND status='active' AND id<>$1 AND id<>COALESCE($2,0) LIMIT 1`,
    [req.user!.id, award.issued_by]);
  if (!approvers.length) return bad(res, 'no_independent_approver');
  const ai = (await q(
    `INSERT INTO approval_instance(entity_type, entity_id, total_stages, requested_by) VALUES ('award_cancel',$1,1,$2) RETURNING *`,
    [award.id, req.user!.id]))[0];
  await q(`INSERT INTO approval_stage(approval_id, stage_no, stage_name, assignee_id, status, due_at)
           VALUES ($1,1,'Award cancellation approval',$2,'pending', now() + interval '2 days')`, [ai.id, approvers[0].id]);
  await q(`UPDATE award SET status='cancel_pending', cancel_reason_code=$1, cancel_reason=$2 WHERE id=$3`,
    [reason_code, reason, award.id]);
  await audit(req, 'award_cancel_requested', 'award', award.id, { reason });
  await notify(approvers[0].id, null, 'approval', 'Award цуцлах зөвшөөрөл', 'Award cancellation approval',
    reason, reason, '/admin/approvals');
  res.json({ ok: true, approvalId: ai.id });
});

async function executeAwardCancel(ai: any, req: any) {
  const award = await q1('SELECT * FROM award WHERE id=$1', [ai.entity_id]);
  await q(`UPDATE award SET status='cancelled', cancelled_at=now() WHERE id=$1`, [award.id]);
  // original award record retained immutable; tender returns to evaluation for re-award
  await q(`UPDATE tender SET status='in_evaluation', updated_at=now() WHERE id=$1`, [award.tender_id]);
  await q(`UPDATE evaluation SET status='draft' WHERE tender_id=$1 AND etype='buyer'`, [award.tender_id]);
  await q(`UPDATE bid_response SET status='evaluated' WHERE tender_id=$1 AND status IN ('awarded','regret')`, [award.tender_id]);
  const t = await q1('SELECT * FROM tender WHERE id=$1', [award.tender_id]);
  const allocs = await q('SELECT DISTINCT organization_id FROM award_allocation WHERE award_id=$1', [award.id]);
  for (const a of allocs) {
    await notifyOrg(a.organization_id, 'system', 'Award цуцлагдлаа', 'Award cancelled',
      `${t.tender_no}: ${award.cancel_reason}`, `${t.tender_no}: ${award.cancel_reason}`, `/supplier/tenders/${t.id}`);
  }
  await audit(req, 'award_cancelled', 'award', award.id, { reason: award.cancel_reason });
}

export default r;
