import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { q, q1 } from '../db';
import { requireAuth } from '../util/auth';
import { audit, bad } from '../util/helpers';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// file security policy (spec 13.5 / GAP-02): allowlist + module size caps, executables blocked
const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.txt', '.csv', '.zip', '.dwg'];
const BLOCKED_EXT = ['.exe', '.bat', '.cmd', '.sh', '.js', '.msi', '.dll', '.scr', '.vbs', '.ps1', '.jar', '.com'];
const SIZE_LIMITS: Record<string, number> = {
  profile: 30 * 1024 * 1024,
  permit: 30 * 1024 * 1024,
  qualification: 10 * 1024 * 1024,
  tender: 30 * 1024 * 1024,
  bid: 30 * 1024 * 1024,
  message: 20 * 1024 * 1024,
  ticket: 20 * 1024 * 1024,
  catalogue: 10 * 1024 * 1024,
};

const upload = multer({ dest: '/tmp/oasis-uploads', limits: { fileSize: 30 * 1024 * 1024 } });
const r = Router();
r.use(requireAuth);

r.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return bad(res, 'file_required');
  const ownerType = String(req.body?.owner_type || 'profile');
  const ownerId = req.body?.owner_id ? Number(req.body.owner_id) : null;
  const category = req.body?.category || null;
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (BLOCKED_EXT.includes(ext)) { fs.unlinkSync(req.file.path); return bad(res, 'file_type_blocked', ext); }
  if (!ALLOWED_EXT.includes(ext)) { fs.unlinkSync(req.file.path); return bad(res, 'file_type_not_allowed', ext); }
  const limit = SIZE_LIMITS[ownerType] || 10 * 1024 * 1024;
  if (req.file.size > limit) { fs.unlinkSync(req.file.path); return bad(res, 'file_too_large', { limit }); }
  const buf = fs.readFileSync(req.file.path);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.copyFileSync(req.file.path, path.join(UPLOAD_DIR, storedName));
  fs.unlinkSync(req.file.path);
  const row = (await q(
    `INSERT INTO attachment(owner_type, owner_id, category, original_name, stored_name, mime_type, size_bytes, sha256, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [ownerType, ownerId, category, req.file.originalname, storedName, req.file.mimetype, req.file.size, sha256, req.user!.id]))[0];
  await audit(req, 'file_uploaded', 'attachment', row.id, { after: `${req.file.originalname} (${req.file.size}b)` });
  res.json(row);
});

r.get('/:id(\\d+)/download', async (req, res) => {
  const att = await q1('SELECT * FROM attachment WHERE id=$1', [req.params.id]);
  if (!att) return res.status(404).json({ error: 'not_found' });
  const filePath = path.join(UPLOAD_DIR, att.stored_name);
  if (!fs.existsSync(filePath)) {
    // DEF-05 control: orphan detection surfaces a clear error, not a broken URL
    await audit(req, 'file_orphan_detected', 'attachment', att.id);
    return res.status(410).json({ error: 'file_missing', message: 'Файл олдсонгүй — админд мэдэгдлээ' });
  }
  // integrity check
  const buf = fs.readFileSync(filePath);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (att.sha256 && sha !== att.sha256) {
    return res.status(409).json({ error: 'checksum_mismatch' });
  }
  await audit(req, 'file_downloaded', 'attachment', att.id);
  res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.original_name)}`);
  res.send(buf);
});

r.get('/by-owner/:ownerType/:ownerId(\\d+)', async (req, res) => {
  res.json(await q('SELECT * FROM attachment WHERE owner_type=$1 AND owner_id=$2 ORDER BY id DESC',
    [req.params.ownerType, req.params.ownerId]));
});

export default r;
