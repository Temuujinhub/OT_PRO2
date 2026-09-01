let token: string | null = localStorage.getItem('oasis_token');
let onAuthFail: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('oasis_token', t); else localStorage.removeItem('oasis_token');
}
export function getToken() { return token; }
export function setAuthFailHandler(fn: () => void) { onAuthFail = fn; }

export class ApiError extends Error {
  code: string; detail: any; status: number; payload: any;
  constructor(status: number, payload: any) {
    super(payload?.error || 'error');
    this.status = status; this.code = payload?.error || 'error'; this.detail = payload?.detail; this.payload = payload;
  }
}

export async function api(path: string, opts: { method?: string; body?: any; raw?: boolean } = {}): Promise<any> {
  const headers: any = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let body: any = undefined;
  if (opts.body instanceof FormData) { body = opts.body; }
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(`/api/v1${path}`, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers, body });
  if (res.status === 401 && token) { setToken(null); onAuthFail?.(); }
  if (opts.raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (p: string) => api(p);
export const post = (p: string, body?: any) => api(p, { method: 'POST', body: body ?? {} });
export const put = (p: string, body?: any) => api(p, { method: 'PUT', body: body ?? {} });
export const del = (p: string) => api(p, { method: 'DELETE' });

export async function download(path: string, filename: string) {
  const res: Response = await api(path, { raw: true });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function uploadFile(file: File, ownerType: string, ownerId?: number, category?: string) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('owner_type', ownerType);
  if (ownerId) fd.append('owner_id', String(ownerId));
  if (category) fd.append('category', category);
  return api('/files/upload', { method: 'POST', body: fd });
}

export function fmtMoney(n: any, currency?: string) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (currency ? ' ' + currency : '');
}

export function fmtDate(d: any, withTime = false) {
  if (!d) return '—';
  const dt = new Date(d);
  const p = (x: number) => String(x).padStart(2, '0');
  const s = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  return withTime ? `${s} ${p(dt.getHours())}:${p(dt.getMinutes())}` : s;
}

export function hoursLeft(d: any): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - Date.now()) / 36e5);
}

/** Fetch a protected file as an object URL (the download route needs the JWT header). */
export async function blobUrl(path: string): Promise<string | null> {
  try {
    const res: Response = await api(path, { raw: true });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch { return null; }
}
