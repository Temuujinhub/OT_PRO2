import express from 'express';
import 'express-async-errors'; // async route errors reach the error handler instead of crashing
import cors from 'cors';
import { initSchema, q, q1, pool } from './db';
import { seed, seedIntegrations } from './seed';

import authRoutes from './routes/auth';
import supplierRoutes from './routes/suppliers';
import qualificationRoutes from './routes/qualification';
import tenderRoutes from './routes/tenders';
import bidRoutes from './routes/bids';
import evaluationRoutes from './routes/evaluation';
import approvalRoutes from './routes/approvals';
import auctionRoutes from './routes/auction';
import ddRoutes from './routes/dd';
import commsRoutes from './routes/comms';
import supportRoutes from './routes/support';
import reportRoutes from './routes/reports';
import adminRoutes from './routes/admin';
import dashboardRoutes from './routes/dashboard';
import fileRoutes from './routes/files';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// correlation id + request log (spec 15.1)
app.use((req, _res, next) => {
  (req as any).correlationId = Math.random().toString(36).slice(2, 10);
  next();
});

app.get('/api/v1/health', async (_req, res) => {
  try {
    await q1('SELECT 1');
    res.json({ status: 'ok', version: '2.0.0', db: 'up', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/qualification', qualificationRoutes);
app.use('/api/v1/tenders', tenderRoutes);
app.use('/api/v1/bids', bidRoutes);
app.use('/api/v1/evaluation', evaluationRoutes);
app.use('/api/v1/approvals', approvalRoutes);
app.use('/api/v1/auction', auctionRoutes);
app.use('/api/v1/dd', ddRoutes);
app.use('/api/v1/comms', commsRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/files', fileRoutes);

// Problem-details style error handler (spec 12.1)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: any, res: any, _next: any) => {
  console.error(`[${req.correlationId}]`, err.message || err);
  res.status(err.status || 500).json({
    error: 'internal_error',
    detail: process.env.NODE_ENV === 'production' ? undefined : String(err.message || err),
    correlationId: req.correlationId,
  });
});

const PORT = parseInt(process.env.PORT || '4000');

// last-resort safety net — log, never die (spec NFR-01 availability)
process.on('uncaughtException', e => console.error('uncaughtException', e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));

async function closeExpiredTenders() {
  // background worker: auto-close tenders past deadline (spec 9.4)
  try {
    const rows = await q(`UPDATE tender SET status='closed', updated_at=now()
      WHERE status='published' AND close_at IS NOT NULL AND close_at < now() RETURNING id, tender_no`);
    for (const t of rows) {
      await q(`INSERT INTO audit_event(actor_name, action, entity_type, entity_id) VALUES ('system','tender_auto_closed','tender',$1)`, [String(t.id)]);
    }
    // auction lifecycle refresh
    await q(`UPDATE auction SET status='live' WHERE status='scheduled' AND starts_at <= now()`);
    const ended = await q(`SELECT * FROM auction WHERE status='live' AND ends_at <= now()`);
    for (const a of ended) {
      const best = await q1(`SELECT * FROM auction_bid WHERE auction_id=$1 ORDER BY amount ASC, placed_at ASC LIMIT 1`, [a.id]);
      await q(`UPDATE auction SET status='ended', winner_org_id=$2 WHERE id=$1`, [a.id, best?.organization_id || null]);
    }
  } catch (e: any) {
    console.error('worker error', e.message);
  }
}

async function start() {
  let retries = 30;
  while (retries--) {
    try { await q1('SELECT 1'); break; } catch { await new Promise(r => setTimeout(r, 2000)); }
  }
  await initSchema();
  const userCount = await q1('SELECT count(*)::int AS c FROM app_user');
  if (!userCount || userCount.c === 0) {
    console.log('Empty database — seeding demo data...');
    await seed();
    console.log('Seed complete.');
  } else {
    // upgraded database: fill newly added reference tables
    const ic = await q1('SELECT count(*)::int AS c FROM integration_config');
    if (ic.c === 0) { await seedIntegrations(); console.log('Integration configs seeded (upgrade).'); }
  }
  setInterval(closeExpiredTenders, 30000);
  app.listen(PORT, () => console.log(`OASIS v2 API listening on :${PORT}`));
}

start().catch(e => { console.error('startup failed', e); process.exit(1); });
