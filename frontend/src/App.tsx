import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { get, post, setToken, getToken, setAuthFailHandler } from './api';
import { useLang } from './i18n';
import { useToast } from './ui';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Forgot from './pages/auth/Forgot';

import SupDashboard from './pages/supplier/Dashboard';
import SupProfile from './pages/supplier/Profile';
import SupQualification from './pages/supplier/Qualification';
import SupQualForm from './pages/supplier/QualForm';
import SupTenders from './pages/supplier/Tenders';
import SupTenderDetail from './pages/supplier/TenderDetail';
import SupMessages from './pages/supplier/Messages';
import SupNotifications from './pages/supplier/Notifications';
import SupCatalogue from './pages/supplier/Catalogue';
import SupKpi from './pages/supplier/Kpi';
import SupSupport from './pages/supplier/Support';
import SupSurveys from './pages/supplier/Surveys';

import AdmDashboard from './pages/admin/Dashboard';
import AdmSuppliers from './pages/admin/Suppliers';
import AdmSupplierDetail from './pages/admin/SupplierDetail';
import AdmQualQueue from './pages/admin/QualQueue';
import AdmQualReview from './pages/admin/QualReview';
import AdmTenders from './pages/admin/Tenders';
import AdmTenderWizard from './pages/admin/TenderWizard';
import AdmTenderOverview from './pages/admin/TenderOverview';
import AdmComparison from './pages/admin/Comparison';
import AdmApprovals from './pages/admin/Approvals';
import AdmDD from './pages/admin/DD';
import AdmReports from './pages/admin/Reports';
import AdmUsers from './pages/admin/Users';
import AdmMasterData from './pages/admin/MasterData';
import AdmIntegrations from './pages/admin/Integrations';
import AdmTranslations from './pages/admin/Translations';
import AdmAudit from './pages/admin/Audit';
import AdmSupport from './pages/admin/Support';
import AdmComms from './pages/admin/Comms';

// ---------------- auth context ----------------
export const AuthCtx = createContext<any>(null);
export const useAuth = () => useContext(AuthCtx);

function IdleGuard({ onTimeout }: { onTimeout: () => void }) {
  const timer = useRef<any>(null);
  useEffect(() => {
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(onTimeout, 15 * 60 * 1000); // 15-minute idle logout per contract
    };
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(e => window.addEventListener(e, reset));
    reset();
    return () => { clearTimeout(timer.current); ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(e => window.removeEventListener(e, reset)); };
  }, []);
  return null;
}

// ---------------- layout ----------------
function NavItem({ to, ico, color, label, badge }: any) {
  const loc = useLocation();
  const nav = useNavigate();
  const isRoot = to === '/supplier' || to === '/admin';
  const active = loc.pathname === to || (!isRoot && loc.pathname.startsWith(to + '/'));
  return (
    <div className={`nav-item ${active ? 'active' : ''}`} onClick={() => nav(to)}>
      <div className="ico" style={{ background: color }}>{ico}</div>
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && <span className="chip orange">{badge}</span>}
    </div>
  );
}

function Shell({ children }: any) {
  const { user, org, logout, unread } = useAuth();
  const { t, lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState('');
  useEffect(() => { get('/support/banner').then(d => setBanner(d.banner || '')).catch(() => {}); }, []);
  const isSupplier = user.userType === 'supplier';
  return (
    <div className="shell">
      <div className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <img src="/ot-logo.png" alt="Оюу Толгой" />
          <div><div className="t1">Оюу Толгой</div><div className="t2">OASIS v2 — Supplier System</div></div>
        </div>
        <div className="nav">
          {isSupplier ? (<>
            <NavItem to="/supplier" ico="▦" color="var(--purple)" label={t('nav_dashboard')} />
            <NavItem to="/supplier/profile" ico="🏢" color="var(--blue)" label={t('nav_profile')} />
            <NavItem to="/supplier/qualification" ico="✓" color="var(--green)" label={t('nav_qualification')} />
            <NavItem to="/supplier/tenders" ico="📋" color="var(--orange)" label={t('nav_tenders')} />
            <NavItem to="/supplier/messages" ico="💬" color="var(--teal)" label={t('nav_messages')} />
            <NavItem to="/supplier/notifications" ico="🔔" color="var(--pink)" label={t('nav_notifications')} badge={unread} />
            <NavItem to="/supplier/catalogue" ico="🗂" color="var(--amber)" label={t('nav_catalogue')} />
            <NavItem to="/supplier/kpi" ico="📈" color="var(--purple)" label={t('nav_kpi')} />
            <NavItem to="/supplier/surveys" ico="📝" color="var(--blue)" label={t('nav_surveys')} />
            <NavItem to="/supplier/support" ico="🛟" color="var(--teal)" label={t('nav_support')} />
          </>) : (<>
            <NavItem to="/admin" ico="▦" color="var(--purple)" label={t('nav_dashboard')} />
            <div className="nav-sect">Procurement</div>
            <NavItem to="/admin/tenders" ico="📋" color="var(--orange)" label={t('nav_tender_mgmt')} />
            <NavItem to="/admin/approvals" ico="✍️" color="var(--green)" label={t('nav_approvals')} />
            <div className="nav-sect">Suppliers</div>
            <NavItem to="/admin/suppliers" ico="🏢" color="var(--blue)" label={t('nav_suppliers')} />
            <NavItem to="/admin/qualification" ico="✓" color="var(--teal)" label={t('nav_qual_queue')} />
            <NavItem to="/admin/dd" ico="🛡" color="var(--red)" label={t('nav_dd')} />
            <div className="nav-sect">Operations</div>
            <NavItem to="/admin/reports" ico="📊" color="var(--pink)" label={t('nav_reports')} />
            <NavItem to="/admin/messages" ico="💬" color="var(--teal)" label={t('nav_messages')} />
            <NavItem to="/admin/support" ico="🛟" color="var(--amber)" label={t('nav_support_admin')} />
            <div className="nav-sect">System</div>
            <NavItem to="/admin/users" ico="👥" color="var(--blue)" label={t('nav_users')} />
            <NavItem to="/admin/masterdata" ico="⚙️" color="var(--ink-soft)" label={t('nav_masterdata')} />
            <NavItem to="/admin/integrations" ico="🔌" color="var(--green)" label={t('nav_integrations')} />
            <NavItem to="/admin/translations" ico="🌐" color="var(--purple)" label={t('nav_translations')} />
            <NavItem to="/admin/audit" ico="🧾" color="var(--ink)" label={t('nav_audit')} />
          </>)}
        </div>
        <div className="foot">
          <span className="logout" onClick={logout}>⏻ {t('logout')}</span>
          version 2.0 · {user.email}
        </div>
      </div>
      <div className="main">
        <div className="topbar">
          <button className="burger" onClick={() => setOpen(o => !o)}>☰</button>
          <div className="crumb">
            {isSupplier ? (org ? `${org.name_mn}${org.vendor_no ? ' · ' + org.vendor_no : ''}` : '') : `${user.name} · ${user.role}`}
          </div>
          <div className="lang-select">
            <select value={lang} onChange={e => setLang(e.target.value)} aria-label="Language">
              <option value="mn">🇲🇳 МН</option>
              <option value="en">🇬🇧 EN</option>
            </select>
          </div>
          <Link to={isSupplier ? '/supplier/notifications' : '/admin/messages'} style={{ position: 'relative', fontSize: 18 }}>
            🔔{unread > 0 && <span className="chip orange" style={{ position: 'absolute', top: -6, right: -12, padding: '0 6px' }}>{unread}</span>}
          </Link>
        </div>
        <div className="content">
          {banner && <div className="banner">⚠️ {banner}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

function Protected({ children, internal }: any) {
  const { user, booting } = useAuth();
  if (booting) return <div className="spinner" style={{ marginTop: 120 }} />;
  if (!user) return <Navigate to="/login" replace />;
  if (internal && user.userType !== 'internal') return <Navigate to="/supplier" replace />;
  if (internal === false && user.userType !== 'supplier') return <Navigate to="/admin" replace />;
  return <Shell>{children}</Shell>;
}

function AppRoutes() {
  const { user, setSession, logout } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const nav = useNavigate();

  useEffect(() => {
    setAuthFailHandler(() => { setSession(null, null); nav('/login'); });
  }, []);

  // refresh /me on load if token present
  const { setBooting } = useAuth();
  useEffect(() => {
    if (getToken() && !user) {
      get('/auth/me').then(d => {
        setSession({
          id: d.user.id, email: d.user.email, name: d.user.display_name, userType: d.user.user_type,
          role: d.user.role, orgId: d.user.organization_id, lang: d.user.language,
        }, d.org, d.freshToken);
      }).catch(() => setToken(null)).finally(() => setBooting(false));
    } else {
      setBooting(false);
    }
  }, []);

  return (
    <>
      {user && <IdleGuard onTimeout={() => { toast(t('session_expired'), 'err'); logout(); }} />}
      <Routes>
        <Route path="/login" element={user ? <Navigate to={user.userType === 'internal' ? '/admin' : '/supplier'} /> : <Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<Forgot />} />

        <Route path="/supplier" element={<Protected internal={false}><SupDashboard /></Protected>} />
        <Route path="/supplier/profile" element={<Protected internal={false}><SupProfile /></Protected>} />
        <Route path="/supplier/qualification" element={<Protected internal={false}><SupQualification /></Protected>} />
        <Route path="/supplier/qualification/:id" element={<Protected internal={false}><SupQualForm /></Protected>} />
        <Route path="/supplier/tenders" element={<Protected internal={false}><SupTenders /></Protected>} />
        <Route path="/supplier/tenders/:id" element={<Protected internal={false}><SupTenderDetail /></Protected>} />
        <Route path="/supplier/messages" element={<Protected internal={false}><SupMessages /></Protected>} />
        <Route path="/supplier/messages/:id" element={<Protected internal={false}><SupMessages /></Protected>} />
        <Route path="/supplier/notifications" element={<Protected internal={false}><SupNotifications /></Protected>} />
        <Route path="/supplier/catalogue" element={<Protected internal={false}><SupCatalogue /></Protected>} />
        <Route path="/supplier/kpi" element={<Protected internal={false}><SupKpi /></Protected>} />
        <Route path="/supplier/support" element={<Protected internal={false}><SupSupport /></Protected>} />
        <Route path="/supplier/surveys" element={<Protected internal={false}><SupSurveys /></Protected>} />

        <Route path="/admin" element={<Protected internal><AdmDashboard /></Protected>} />
        <Route path="/admin/suppliers" element={<Protected internal><AdmSuppliers /></Protected>} />
        <Route path="/admin/suppliers/:id" element={<Protected internal><AdmSupplierDetail /></Protected>} />
        <Route path="/admin/qualification" element={<Protected internal><AdmQualQueue /></Protected>} />
        <Route path="/admin/qualification/:id" element={<Protected internal><AdmQualReview /></Protected>} />
        <Route path="/admin/tenders" element={<Protected internal><AdmTenders /></Protected>} />
        <Route path="/admin/tenders/new" element={<Protected internal><AdmTenderWizard /></Protected>} />
        <Route path="/admin/tenders/:id/edit" element={<Protected internal><AdmTenderWizard /></Protected>} />
        <Route path="/admin/tenders/:id" element={<Protected internal><AdmTenderOverview /></Protected>} />
        <Route path="/admin/tenders/:id/comparison" element={<Protected internal><AdmComparison /></Protected>} />
        <Route path="/admin/approvals" element={<Protected internal><AdmApprovals /></Protected>} />
        <Route path="/admin/dd" element={<Protected internal><AdmDD /></Protected>} />
        <Route path="/admin/reports" element={<Protected internal><AdmReports /></Protected>} />
        <Route path="/admin/users" element={<Protected internal><AdmUsers /></Protected>} />
        <Route path="/admin/masterdata" element={<Protected internal><AdmMasterData /></Protected>} />
        <Route path="/admin/integrations" element={<Protected internal><AdmIntegrations /></Protected>} />
        <Route path="/admin/translations" element={<Protected internal><AdmTranslations /></Protected>} />
        <Route path="/admin/audit" element={<Protected internal><AdmAudit /></Protected>} />
        <Route path="/admin/support" element={<Protected internal><AdmSupport /></Protected>} />
        <Route path="/admin/messages" element={<Protected internal><AdmComms /></Protected>} />
        <Route path="/admin/messages/:id" element={<Protected internal><AdmComms /></Protected>} />

        <Route path="*" element={<Navigate to={user ? (user.userType === 'internal' ? '/admin' : '/supplier') : '/login'} />} />
      </Routes>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [booting, setBooting] = useState<boolean>(!!getToken());

  const setSession = (u: any, o: any, tok?: string) => {
    setUser(u); setOrg(o);
    if (tok) setToken(tok);
  };
  const logout = () => {
    post('/auth/logout').catch(() => {});
    setToken(null); setUser(null); setOrg(null);
  };

  // poll unread notifications
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () => get('/comms/notifications?unread=true').then(d => alive && setUnread(d.unread)).catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [user]);

  return (
    <AuthCtx.Provider value={{ user, org, setSession, logout, unread, setUnread, booting, setBooting, refreshOrg: () => get('/auth/me').then(d => setOrg(d.org)).catch(() => {}) }}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}
