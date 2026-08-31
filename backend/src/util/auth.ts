import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { q1 } from '../db';

export const JWT_SECRET = process.env.JWT_SECRET || 'oasis-v2-dev-secret-change-in-prod';
const TOKEN_TTL_MIN = parseInt(process.env.SESSION_IDLE_MINUTES || '15');

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  userType: 'supplier' | 'internal';
  role: string;
  orgId: number | null;
  lang: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export function signToken(u: AuthUser): string {
  // Sliding 15-minute idle expiry per contract; frontend refreshes on activity.
  // Pick only known fields — a decoded JWT payload may carry exp/iat which jwt.sign rejects.
  const payload = { id: u.id, email: u.email, name: u.name, userType: u.userType, role: u.role, orgId: u.orgId, lang: u.lang };
  return jwt.sign(payload as any, JWT_SECRET, { expiresIn: `${TOKEN_TTL_MIN}m` });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  if (!hdr || !hdr.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(hdr.slice(7), JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'session_expired' });
  }
}

export function requireInternal(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.userType !== 'internal') return res.status(403).json({ error: 'forbidden' });
  next();
}

export function requireSupplier(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.userType !== 'supplier' || !req.user.orgId) return res.status(403).json({ error: 'forbidden' });
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.role === 'SystemAdmin') return next();
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden', need: roles });
    next();
  };
}

/** refresh sliding session: issue a new token with each authenticated response */
export function slidingToken(req: Request): string | null {
  if (!req.user) return null;
  const { id, email, name, userType, role, orgId, lang } = req.user as any;
  return signToken({ id, email, name, userType, role, orgId, lang });
}

export async function loadUser(id: number) {
  return q1('SELECT * FROM app_user WHERE id=$1', [id]);
}
