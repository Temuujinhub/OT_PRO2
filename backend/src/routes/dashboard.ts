import { Router } from 'express';
import { q, q1 } from '../db';
import { requireAuth, requireSupplier, requireInternal } from '../util/auth';

const r = Router();
r.use(requireAuth);

// -------- Supplier dashboard (spec 7.3) --------
r.get('/supplier', requireSupplier, async (req, res) => {
  const orgId = req.user!.orgId!;
  const [org, tenderStats, deadlines, drafts, awards, pendingMsgs, quals, scores, unread] = await Promise.all([
    q1('SELECT * FROM organization WHERE id=$1', [orgId]),
    q(
      `SELECT tt.code, count(*)::int AS total,
         count(*) FILTER (WHERE t.status='published' AND t.close_at > now())::int AS open,
         count(*) FILTER (WHERE br.status NOT IN ('draft','no_response') AND br.status IS NOT NULL)::int AS responded
       FROM tender t JOIN tender_type tt ON tt.id=t.type_id
       JOIN tender_invitation i ON i.tender_id=t.id AND i.organization_id=$1
       LEFT JOIN bid_response br ON br.tender_id=t.id AND br.organization_id=$1
       WHERE t.status NOT IN ('draft','pending_approval')
       GROUP BY tt.code`, [orgId]),
    q(
      `SELECT t.id, t.tender_no, t.title_mn, t.title_en, t.close_at,
          round(extract(epoch FROM (t.close_at - now()))/3600)::int AS hours_left
       FROM tender t JOIN tender_invitation i ON i.tender_id=t.id AND i.organization_id=$1
       WHERE t.status='published' AND t.close_at BETWEEN now() AND now() + interval '72 hours'
       ORDER BY t.close_at LIMIT 10`, [orgId]),
    q(
      `SELECT t.id, t.tender_no, t.title_mn, t.close_at FROM bid_response br JOIN tender t ON t.id=br.tender_id
       WHERE br.organization_id=$1 AND br.status='draft' AND t.status='published' ORDER BY t.close_at LIMIT 10`, [orgId]),
    q(
      `SELECT t.id, t.tender_no, t.title_mn, br.status, br.submitted_at FROM bid_response br JOIN tender t ON t.id=br.tender_id
       WHERE br.organization_id=$1 AND br.status IN ('awarded','regret') ORDER BY br.submitted_at DESC LIMIT 10`, [orgId]),
    q1(
      `SELECT count(*)::int AS c FROM msg_thread th
       WHERE th.organization_id=$1 AND th.status='open' AND th.visibility='supplier'`, [orgId]),
    q(
      `SELECT qs.status, p.name_mn, p.name_en, p.ptype, qs.expires_on FROM qual_submission qs JOIN qual_program p ON p.id=qs.program_id
       WHERE qs.organization_id=$1 ORDER BY qs.id DESC LIMIT 5`, [orgId]),
    q('SELECT * FROM supplier_score WHERE organization_id=$1 ORDER BY period DESC LIMIT 8', [orgId]),
    q1('SELECT count(*)::int AS c FROM notification WHERE user_id=$1 AND read_at IS NULL', [req.user!.id]),
  ]);
  res.json({ org, tenderStats, deadlines, drafts, awards, pendingThreads: pendingMsgs?.c || 0, quals, scores: scores.reverse(), unread: unread?.c || 0 });
});

// -------- Admin dashboard (spec 8.1) --------
r.get('/admin', requireInternal, async (req, res) => {
  const [suppliers, quals, tenders, bids, approvals, support, security, myActions] = await Promise.all([
    q1(
      `SELECT count(*)::int AS total,
         count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_30d,
         count(*) FILTER (WHERE status='approved')::int AS approved,
         count(*) FILTER (WHERE status IN ('submitted','under_review'))::int AS pending_review,
         count(*) FILTER (WHERE status IN ('suspended','blacklisted'))::int AS restricted,
         count(*) FILTER (WHERE residency='national')::int AS national,
         count(*) FILTER (WHERE residency='international')::int AS international
       FROM organization`),
    q1(
      `SELECT count(*) FILTER (WHERE status='submitted')::int AS submitted,
         count(*) FILTER (WHERE status='screening')::int AS screening,
         count(*) FILTER (WHERE status='needs_improvement')::int AS needs_improvement,
         count(*) FILTER (WHERE status='approved')::int AS approved,
         count(*) FILTER (WHERE status='rejected')::int AS rejected,
         count(*) FILTER (WHERE status='approved' AND expires_on < CURRENT_DATE + 60)::int AS expiring
       FROM qual_submission`),
    q1(
      `SELECT count(*) FILTER (WHERE status='draft')::int AS draft,
         count(*) FILTER (WHERE status='pending_approval')::int AS pending_approval,
         count(*) FILTER (WHERE status='published')::int AS open,
         count(*) FILTER (WHERE status='published' AND close_at < now() + interval '72 hours')::int AS closing_soon,
         count(*) FILTER (WHERE status IN ('in_evaluation','negotiation'))::int AS evaluating,
         count(*) FILTER (WHERE status='award_pending')::int AS award_pending,
         count(*) FILTER (WHERE status='awarded')::int AS awarded,
         count(*) FILTER (WHERE status='cancelled')::int AS cancelled
       FROM tender`),
    q1(
      `SELECT count(*)::int AS invited,
         count(*) FILTER (WHERE status NOT IN ('draft','no_response'))::int AS responded
       FROM bid_response`),
    q(
      `SELECT ai.id, ai.entity_type, ai.entity_id, ai.amount, ai.currency, s.stage_no, s.stage_name, s.due_at,
          u.display_name AS approver, (s.due_at < now()) AS overdue,
          round(extract(epoch FROM (now() - ai.created_at))/3600)::int AS age_hours
       FROM approval_instance ai JOIN approval_stage s ON s.approval_id=ai.id AND s.status='pending'
       LEFT JOIN app_user u ON u.id=s.assignee_id WHERE ai.status='pending' ORDER BY s.due_at LIMIT 15`),
    q1(
      `SELECT count(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS open,
         count(*) FILTER (WHERE severity<=2 AND status NOT IN ('resolved','closed'))::int AS critical,
         count(*) FILTER (WHERE sla_due_at < now() AND status NOT IN ('resolved','closed'))::int AS breached
       FROM support_ticket`),
    q1(
      `SELECT count(*) FILTER (WHERE action='login_failed' AND occurred_at > now() - interval '24 hours')::int AS failed_logins_24h,
         (SELECT count(*)::int FROM app_user WHERE status='locked') AS locked_accounts
       FROM audit_event`),
    q(
      `SELECT ai.id, ai.entity_type, ai.entity_id, s.stage_name, s.due_at, (s.due_at < now()) AS overdue,
         CASE ai.entity_type
           WHEN 'tender_publish' THEN (SELECT tender_no || ' — ' || title_mn FROM tender WHERE id=ai.entity_id)
           WHEN 'award' THEN (SELECT tender_no || ' — ' || title_mn FROM tender WHERE id=ai.entity_id)
           ELSE ai.entity_type END AS label
       FROM approval_instance ai JOIN approval_stage s ON s.approval_id=ai.id AND s.status='pending' AND s.assignee_id=$1
       WHERE ai.status='pending' ORDER BY s.due_at LIMIT 10`, [req.user!.id]),
  ]);
  const monthly = await q(
    `SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS c FROM organization
     WHERE created_at > now() - interval '12 months' GROUP BY 1 ORDER BY 1`);
  res.json({ suppliers, quals, tenders, bids, approvals, support, security, myActions, monthly });
});

export default r;
