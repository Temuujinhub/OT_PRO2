import { Router } from 'express';
import { q, q1, tx } from '../db';
import { requireAuth, requireSupplier, requireInternal, requireRole } from '../util/auth';
import { audit, notifyOrg, bad, parseMoney } from '../util/helpers';

const r = Router();
r.use(requireAuth);

async function refreshStatus(a: any) {
  const now = new Date();
  if (a.status === 'scheduled' && new Date(a.starts_at) <= now) {
    await q(`UPDATE auction SET status='live' WHERE id=$1 AND status='scheduled'`, [a.id]);
    a.status = 'live';
  }
  if (a.status === 'live' && new Date(a.ends_at) <= now) {
    const best = await q1(`SELECT * FROM auction_bid WHERE auction_id=$1 ORDER BY amount ASC, placed_at ASC LIMIT 1`, [a.id]);
    await q(`UPDATE auction SET status='ended', winner_org_id=$2 WHERE id=$1 AND status='live'`, [a.id, best?.organization_id || null]);
    a.status = 'ended'; a.winner_org_id = best?.organization_id || null;
  }
  return a;
}

// state for both sides (identity anonymised for suppliers — spec 8.18)
r.get('/:tenderId(\\d+)/state', async (req, res) => {
  let a = await q1('SELECT * FROM auction WHERE tender_id=$1', [req.params.tenderId]);
  if (!a) return res.status(404).json({ error: 'not_found' });
  a = await refreshStatus(a);
  const bids = await q(
    `SELECT ab.id, ab.amount, ab.placed_at, ab.organization_id, o.name_mn
     FROM auction_bid ab JOIN organization o ON o.id=ab.organization_id
     WHERE ab.auction_id=$1 ORDER BY ab.amount ASC, ab.placed_at ASC LIMIT 50`, [a.id]);
  const isInternal = req.user!.userType === 'internal';
  const myOrg = req.user!.orgId;
  const masked = bids.map((b, idx) => ({
    rank: idx + 1,
    amount: Number(b.amount),
    placed_at: b.placed_at,
    bidder: isInternal ? b.name_mn : (b.organization_id === myOrg ? 'Таны санал / Your bid' : `Bidder-${String(b.organization_id * 7919 % 997).padStart(3, '0')}`),
    mine: b.organization_id === myOrg,
  }));
  const best = masked.length ? masked[0].amount : Number(a.start_price);
  res.json({
    auction: { id: a.id, start_price: Number(a.start_price), currency: a.currency, min_decrement: Number(a.min_decrement),
      starts_at: a.starts_at, ends_at: a.ends_at, status: a.status, extension_minutes: a.extension_minutes,
      winner_org_id: isInternal ? a.winner_org_id : (a.winner_org_id === myOrg ? myOrg : null),
      i_won: a.status === 'ended' && a.winner_org_id === myOrg },
    currentBest: best,
    nextMaxBid: best - Number(a.min_decrement),
    bids: masked,
    serverTime: new Date().toISOString(),
  });
});

// supplier places a reverse-auction bid (must be lower)
r.post('/:tenderId(\\d+)/bid', requireSupplier, async (req, res) => {
  let a = await q1('SELECT * FROM auction WHERE tender_id=$1', [req.params.tenderId]);
  if (!a) return res.status(404).json({ error: 'not_found' });
  a = await refreshStatus(a);
  if (a.status !== 'live') return bad(res, 'auction_not_live', a.status);
  const inv = await q1('SELECT 1 FROM tender_invitation WHERE tender_id=$1 AND organization_id=$2', [req.params.tenderId, req.user!.orgId]);
  const t = await q1('SELECT is_public FROM tender WHERE id=$1', [req.params.tenderId]);
  if (!inv && !t?.is_public) return bad(res, 'not_invited');
  const amount = parseMoney(req.body?.amount);
  if (amount === null || amount <= 0) return bad(res, 'invalid_amount');
  const result = await tx(async c => {
    const best = (await c.query(`SELECT amount FROM auction_bid WHERE auction_id=$1 ORDER BY amount ASC LIMIT 1 FOR UPDATE`, [a.id])).rows[0];
    const currentBest = best ? Number(best.amount) : Number(a.start_price);
    const maxAllowed = currentBest - Number(a.min_decrement);
    if (amount > maxAllowed + 1e-9) throw Object.assign(new Error('bid_too_high'), { code: 'bid_too_high', maxAllowed });
    await c.query(`INSERT INTO auction_bid(auction_id, organization_id, amount, ip) VALUES ($1,$2,$3,$4)`,
      [a.id, req.user!.orgId, amount, null]);
    // anti-sniping extension
    const remaining = new Date(a.ends_at).getTime() - Date.now();
    let extended = false;
    if (remaining < a.extension_minutes * 60000) {
      await c.query(`UPDATE auction SET ends_at = ends_at + ($1 || ' minutes')::interval WHERE id=$2`, [String(a.extension_minutes), a.id]);
      extended = true;
    }
    return { extended };
  }).catch(e => ({ error: e.code || 'error', maxAllowed: e.maxAllowed }));
  if ((result as any).error) return res.status(400).json({ error: (result as any).error, maxAllowed: (result as any).maxAllowed });
  await audit(req, 'auction_bid_placed', 'auction', a.id, { after: String(amount) });
  res.json({ ok: true, extended: (result as any).extended });
});

// admin controls
r.post('/:tenderId(\\d+)/configure', requireInternal, requireRole('Buyer', 'SystemAdmin'), async (req, res) => {
  const { start_price, min_decrement, starts_at, ends_at, extension_minutes, currency } = req.body || {};
  const t = await q1(`SELECT t.*, tt.code FROM tender t JOIN tender_type tt ON tt.id=t.type_id WHERE t.id=$1`, [req.params.tenderId]);
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (t.code !== 'AUCTION') return bad(res, 'not_auction_tender');
  const sp = parseMoney(start_price);
  if (sp === null || sp <= 0) return bad(res, 'invalid_start_price');
  if (!starts_at || !ends_at || new Date(starts_at) >= new Date(ends_at)) return bad(res, 'invalid_dates');
  const row = (await q(
    `INSERT INTO auction(tender_id, start_price, currency, min_decrement, starts_at, ends_at, extension_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tender_id) DO UPDATE SET start_price=$2, currency=$3, min_decrement=$4, starts_at=$5, ends_at=$6, extension_minutes=$7
     RETURNING *`,
    [t.id, sp, currency || 'MNT', parseMoney(min_decrement) || 1, starts_at, ends_at, extension_minutes || 5]))[0];
  await audit(req, 'auction_configured', 'auction', row.id);
  res.json(row);
});

r.post('/:tenderId(\\d+)/control', requireInternal, requireRole('Buyer', 'SystemAdmin'), async (req, res) => {
  const { action } = req.body || {}; // pause | resume | end | cancel
  const a = await q1('SELECT * FROM auction WHERE tender_id=$1', [req.params.tenderId]);
  if (!a) return res.status(404).json({ error: 'not_found' });
  const map: any = { pause: 'paused', resume: 'live', end: 'ended', cancel: 'cancelled' };
  if (!map[action]) return bad(res, 'invalid_action');
  if (action === 'end') {
    const best = await q1(`SELECT * FROM auction_bid WHERE auction_id=$1 ORDER BY amount ASC, placed_at ASC LIMIT 1`, [a.id]);
    await q(`UPDATE auction SET status='ended', winner_org_id=$2, ends_at=now() WHERE id=$1`, [a.id, best?.organization_id || null]);
    if (best) {
      const t = await q1('SELECT tender_no FROM tender WHERE id=$1', [a.tender_id]);
      await notifyOrg(best.organization_id, 'award', 'Аукшинд түрүүллээ!', 'You won the auction!',
        `${t.tender_no}: таны ${Number(best.amount).toLocaleString()} ${a.currency} санал шалгарлаа.`,
        `${t.tender_no}: your bid of ${Number(best.amount).toLocaleString()} ${a.currency} won.`, `/supplier/tenders/${a.tender_id}`);
    }
  } else {
    await q(`UPDATE auction SET status=$1 WHERE id=$2`, [map[action], a.id]);
  }
  await audit(req, `auction_${action}`, 'auction', a.id);
  res.json({ ok: true });
});

export default r;
