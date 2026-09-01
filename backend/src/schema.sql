-- =====================================================================
-- OASIS vNext (v2) — Database schema (PostgreSQL)
-- Aligned with OASIS_vNext SRS section 11 (schema grouping), pragmatic
-- flattening for the v2 test system. Money: numeric(19,4), qty numeric(19,6),
-- fx rate numeric(19,8). All timestamps UTC (timestamptz).
-- =====================================================================

-- ============================ IAM ====================================
CREATE TABLE IF NOT EXISTS app_user (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  user_type     TEXT NOT NULL DEFAULT 'supplier', -- supplier | internal
  role          TEXT NOT NULL DEFAULT 'SupplierAdmin',
  -- internal roles: SystemAdmin, Buyer, EndUser, Compliance, Screening, DDAnalyst, Approver, AwardOfficer, Support, ContentAdmin, Auditor
  -- supplier roles: SupplierPrimary, SupplierAdmin, SupplierEmployee
  organization_id INT,
  status        TEXT NOT NULL DEFAULT 'active',  -- pending_email | active | locked | disabled
  language      TEXT NOT NULL DEFAULT 'mn',
  mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
  failed_logins INT NOT NULL DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  email_verify_token TEXT,
  reset_token   TEXT,
  otp_code      TEXT,
  otp_expires_at TIMESTAMPTZ,
  department    TEXT,
  position      TEXT,
  approval_limit NUMERIC(19,4),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_session (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES app_user(id),
  token_hash  TEXT NOT NULL,
  device      TEXT,
  ip          TEXT,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS consent (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES app_user(id),
  consent_type  TEXT NOT NULL,           -- terms | privacy | tender_disclaimer
  ref_id        INT,                     -- tender id for disclaimers
  doc_version   TEXT NOT NULL DEFAULT '1.0',
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip            TEXT
);

-- ========================= SUPPLIER ==================================
CREATE TABLE IF NOT EXISTS organization (
  id                 SERIAL PRIMARY KEY,
  org_type           TEXT NOT NULL DEFAULT 'company',   -- company | individual
  residency          TEXT NOT NULL DEFAULT 'national',  -- national | international
  registry_no        TEXT,
  state_reg_no       TEXT,
  vendor_no          TEXT,
  name_mn            TEXT NOT NULL,
  name_en            TEXT,
  status             TEXT NOT NULL DEFAULT 'draft', -- draft|submitted|under_review|needs_correction|approved|rejected|suspended|blacklisted
  risk_level         TEXT DEFAULT 'low',
  tier               TEXT DEFAULT 'standard',
  country            TEXT DEFAULT 'MN',
  khur_verified      BOOLEAN NOT NULL DEFAULT false,
  khur_verified_at   TIMESTAMPTZ,
  completion_percent INT NOT NULL DEFAULT 0,
  profile_version    INT NOT NULL DEFAULT 1,
  submitted_at       TIMESTAMPTZ,
  reviewed_by        INT,
  review_comment     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_profile (
  id             SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id) UNIQUE,
  address_country  TEXT, address_province TEXT, address_district TEXT,
  address_postcode TEXT, address_line1 TEXT, address_line2 TEXT,
  phone          TEXT, website TEXT, established_year INT,
  legal_form     TEXT, ownership_type TEXT,
  total_employees INT DEFAULT 0,
  mongolian_employees INT DEFAULT 0,
  umnugovi_employees  INT DEFAULT 0,
  bank_name      TEXT, tax_number TEXT,
  intro_mn       TEXT, intro_en TEXT,
  CONSTRAINT workforce_chk CHECK (
    total_employees >= 0 AND mongolian_employees >= 0 AND umnugovi_employees >= 0
    AND mongolian_employees <= total_employees AND umnugovi_employees <= total_employees)
);

CREATE TABLE IF NOT EXISTS org_contact (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  contact_type TEXT NOT NULL DEFAULT 'member', -- primary | member
  full_name TEXT NOT NULL, position TEXT, email TEXT, phone1 TEXT, phone2 TEXT,
  receives_email BOOLEAN NOT NULL DEFAULT false,
  system_role TEXT, active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS org_shareholder (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL, owner_type TEXT DEFAULT 'individual',
  id_ref TEXT, ownership_percent NUMERIC(7,4) CHECK (ownership_percent >= 0 AND ownership_percent <= 100),
  country TEXT DEFAULT 'MN', beneficial_owner BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS org_permit (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  permit_type TEXT NOT NULL, number TEXT, issuer TEXT, manufacturer TEXT,
  issued_on DATE, expires_on DATE, status TEXT DEFAULT 'active',
  attachment_id INT
);

CREATE TABLE IF NOT EXISTS org_category (
  organization_id INT NOT NULL REFERENCES organization(id),
  category_id INT NOT NULL,
  PRIMARY KEY (organization_id, category_id)
);

CREATE TABLE IF NOT EXISTS profile_change_request (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  reason TEXT,
  requested_by INT, decided_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS org_restriction (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  rtype TEXT NOT NULL, -- suspend | blacklist
  reason_code TEXT, reason TEXT,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(), end_at TIMESTAMPTZ,
  approved_by INT, active BOOLEAN NOT NULL DEFAULT true
);

-- mock ХУР/ДАН registry
CREATE TABLE IF NOT EXISTS khur_registry (
  registry_no TEXT PRIMARY KEY,
  name_mn TEXT NOT NULL, name_en TEXT, legal_form TEXT,
  state_reg_no TEXT, established DATE, director TEXT, address TEXT
);

-- ===================== QUALIFICATION =================================
CREATE TABLE IF NOT EXISTS qual_program (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, ptype TEXT NOT NULL, -- prequalification | due_diligence | coi | audit
  name_mn TEXT NOT NULL, name_en TEXT, active BOOLEAN NOT NULL DEFAULT true,
  version_no INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS qual_section (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES qual_program(id),
  code TEXT NOT NULL, order_no INT NOT NULL DEFAULT 0,
  title_mn TEXT NOT NULL, title_en TEXT
);

CREATE TABLE IF NOT EXISTS qual_question (
  id SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES qual_section(id),
  code TEXT NOT NULL, order_no INT NOT NULL DEFAULT 0,
  qtype TEXT NOT NULL DEFAULT 'text', -- text|number|money|date|yesno|single|multi|attachment
  label_mn TEXT NOT NULL, label_en TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  options_json JSONB, guidance_mn TEXT, guidance_en TEXT,
  evidence_required BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS qual_submission (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  program_id INT NOT NULL REFERENCES qual_program(id),
  version_no INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|submitted|screening|needs_improvement|approved|rejected|expired
  submitted_at TIMESTAMPTZ, decided_at TIMESTAMPTZ,
  reviewer_id INT, risk_score INT, decision_comment TEXT,
  expires_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, program_id, version_no)
);

CREATE TABLE IF NOT EXISTS qual_answer (
  id SERIAL PRIMARY KEY,
  submission_id INT NOT NULL REFERENCES qual_submission(id),
  question_id INT NOT NULL REFERENCES qual_question(id),
  value_text TEXT, value_number NUMERIC(19,4), value_date DATE, value_bool BOOLEAN,
  value_options JSONB, attachment_id INT,
  UNIQUE (submission_id, question_id)
);

CREATE TABLE IF NOT EXISTS qual_question_review (
  id SERIAL PRIMARY KEY,
  submission_id INT NOT NULL REFERENCES qual_submission(id),
  question_id INT NOT NULL REFERENCES qual_question(id),
  result TEXT, -- pass | fail | needs_correction
  comment TEXT, reviewer_id INT,
  UNIQUE (submission_id, question_id)
);

-- ========================= TENDER ====================================
CREATE TABLE IF NOT EXISTS tender_type (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- EOI | RFQ | RFQ_SERVICE | OEM | TRAVEL | FREIGHT | AUCTION
  name_mn TEXT NOT NULL, name_en TEXT,
  has_items BOOLEAN NOT NULL DEFAULT false,
  workflow_version INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS tender (
  id SERIAL PRIMARY KEY,
  tender_no TEXT NOT NULL UNIQUE,
  type_id INT NOT NULL REFERENCES tender_type(id),
  title_mn TEXT NOT NULL, title_en TEXT,
  description_mn TEXT, description_en TEXT,
  department TEXT, category_id INT,
  buyer_id INT REFERENCES app_user(id),
  end_user_id INT REFERENCES app_user(id),
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft|pending_approval|published|closed|in_evaluation|negotiation|award_pending|awarded|cancelled|reopened|archived
  publish_at TIMESTAMPTZ, close_at TIMESTAMPTZ,
  clarification_deadline TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Asia/Ulaanbaatar',
  currency_policy TEXT NOT NULL DEFAULT 'any', -- any | MNT | USD
  partial_allowed BOOLEAN NOT NULL DEFAULT true,
  alternative_allowed BOOLEAN NOT NULL DEFAULT true,
  qualification_required BOOLEAN NOT NULL DEFAULT false,
  dd_required BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  email_subject TEXT, email_body TEXT,
  disclaimer_version TEXT NOT NULL DEFAULT '1.0',
  published_version INT NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  created_by INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tender_status ON tender(status, close_at);

CREATE TABLE IF NOT EXISTS tender_requirement (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  line_no INT NOT NULL,
  label_mn TEXT NOT NULL, label_en TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  attachment_required BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tender_id, line_no)
);

CREATE TABLE IF NOT EXISTS tender_item (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  line_no INT NOT NULL,
  pr_no TEXT, material_no TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(19,6) NOT NULL CHECK (quantity > 0),
  uom TEXT NOT NULL DEFAULT 'EA',
  manufacturer TEXT, part_no TEXT,
  datasheet_required BOOLEAN NOT NULL DEFAULT false,
  license_required BOOLEAN NOT NULL DEFAULT false,
  certificate_required BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tender_id, line_no)
);

CREATE TABLE IF NOT EXISTS tender_invitation (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  organization_id INT REFERENCES organization(id),
  external_email TEXT,
  status TEXT NOT NULL DEFAULT 'prepared', -- prepared|sent|delivered|opened|participated|declined
  sent_at TIMESTAMPTZ, opened_at TIMESTAMPTZ,
  UNIQUE (tender_id, organization_id)
);

CREATE TABLE IF NOT EXISTS tender_deadline_change (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  old_close_at TIMESTAMPTZ, new_close_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL, changed_by INT NOT NULL,
  notified_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================== BID =====================================
CREATE TABLE IF NOT EXISTS bid_response (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  organization_id INT NOT NULL REFERENCES organization(id),
  status TEXT NOT NULL DEFAULT 'draft', -- no_response|draft|submitted|reopened|withdrawn|evaluated|awarded|regret
  current_revision INT NOT NULL DEFAULT 0,
  validity_days INT, payment_term_accepted BOOLEAN DEFAULT true, payment_term_note TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tender_id, organization_id)
);

CREATE TABLE IF NOT EXISTS bid_revision (
  id SERIAL PRIMARY KEY,
  response_id INT NOT NULL REFERENCES bid_response(id),
  revision_no INT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual', -- manual|import|negotiation
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by INT,
  UNIQUE (response_id, revision_no)
);

CREATE TABLE IF NOT EXISTS bid_item_quote (
  id SERIAL PRIMARY KEY,
  revision_id INT NOT NULL REFERENCES bid_revision(id),
  tender_item_id INT NOT NULL REFERENCES tender_item(id),
  option_no INT NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'MNT',
  unit_price NUMERIC(19,4) NOT NULL CHECK (unit_price >= 0),
  quantity NUMERIC(19,6) NOT NULL,
  total_price NUMERIC(19,4) NOT NULL,
  lead_time_value INT, lead_time_unit TEXT DEFAULT 'days',
  incoterm TEXT, delivery_location TEXT,
  is_alternative BOOLEAN NOT NULL DEFAULT false,
  manufacturer TEXT, part_no TEXT,
  comment TEXT,
  datasheet_attachment_id INT, license_attachment_id INT, certificate_attachment_id INT,
  UNIQUE (revision_id, tender_item_id, option_no)
);

CREATE TABLE IF NOT EXISTS bid_requirement_answer (
  id SERIAL PRIMARY KEY,
  revision_id INT NOT NULL REFERENCES bid_revision(id),
  requirement_id INT NOT NULL REFERENCES tender_requirement(id),
  comment TEXT, attachment_id INT,
  UNIQUE (revision_id, requirement_id)
);

-- draft storage (mutable until submit)
CREATE TABLE IF NOT EXISTS bid_draft (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  organization_id INT NOT NULL REFERENCES organization(id),
  payload JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tender_id, organization_id)
);

CREATE TABLE IF NOT EXISTS negotiation_round (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  round_no INT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL DEFAULT now(), closes_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open', -- open|closed
  price_increase_allowed BOOLEAN NOT NULL DEFAULT false,
  scope_change_reason TEXT,
  created_by INT,
  UNIQUE (tender_id, round_no)
);

CREATE TABLE IF NOT EXISTS negotiation_participant (
  round_id INT NOT NULL REFERENCES negotiation_round(id),
  organization_id INT NOT NULL REFERENCES organization(id),
  baseline_revision_id INT, submitted_revision_id INT,
  PRIMARY KEY (round_id, organization_id)
);

-- ================== EVALUATION / APPROVAL / AWARD ====================
CREATE TABLE IF NOT EXISTS evaluation (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  etype TEXT NOT NULL, -- end_user | buyer
  evaluator_id INT NOT NULL REFERENCES app_user(id),
  status TEXT NOT NULL DEFAULT 'draft', -- draft|submitted|returned
  recommendation TEXT,
  submitted_at TIMESTAMPTZ,
  UNIQUE (tender_id, etype)
);

CREATE TABLE IF NOT EXISTS item_selection (
  id SERIAL PRIMARY KEY,
  evaluation_id INT NOT NULL REFERENCES evaluation(id),
  tender_item_id INT NOT NULL REFERENCES tender_item(id),
  organization_id INT NOT NULL REFERENCES organization(id),
  quote_id INT REFERENCES bid_item_quote(id),
  selected_qty NUMERIC(19,6), amount NUMERIC(19,4), currency TEXT DEFAULT 'MNT',
  justification TEXT,
  UNIQUE (evaluation_id, tender_item_id, organization_id)
);

CREATE TABLE IF NOT EXISTS approval_instance (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL, -- tender_publish | award | qualification | award_cancel | negotiation_exception
  entity_id INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|returned|cancelled
  current_stage INT NOT NULL DEFAULT 1,
  total_stages INT NOT NULL DEFAULT 1,
  amount NUMERIC(19,4), currency TEXT,
  converted_amount NUMERIC(19,4), rate NUMERIC(19,8), rate_date DATE,
  requested_by INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS approval_stage (
  id SERIAL PRIMARY KEY,
  approval_id INT NOT NULL REFERENCES approval_instance(id),
  stage_no INT NOT NULL,
  stage_name TEXT NOT NULL,
  assignee_id INT REFERENCES app_user(id),
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting|pending|approved|rejected|returned|delegated
  due_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ, decision_reason TEXT, decided_by INT,
  UNIQUE (approval_id, stage_no)
);
CREATE INDEX IF NOT EXISTS idx_stage_assignee ON approval_stage(assignee_id, status);

CREATE TABLE IF NOT EXISTS award (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id),
  version_no INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'issued', -- issued|cancel_pending|cancelled
  total_amount NUMERIC(19,4), currency TEXT DEFAULT 'MNT',
  approval_id INT,
  issued_by INT, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  letter_text TEXT,
  cancel_reason_code TEXT, cancel_reason TEXT, cancelled_at TIMESTAMPTZ,
  UNIQUE (tender_id, version_no)
);

CREATE TABLE IF NOT EXISTS award_allocation (
  id SERIAL PRIMARY KEY,
  award_id INT NOT NULL REFERENCES award(id),
  tender_item_id INT NOT NULL REFERENCES tender_item(id),
  organization_id INT NOT NULL REFERENCES organization(id),
  quote_id INT,
  quantity NUMERIC(19,6), amount NUMERIC(19,4), currency TEXT DEFAULT 'MNT'
);

CREATE TABLE IF NOT EXISTS regret_notice (
  id SERIAL PRIMARY KEY,
  award_id INT NOT NULL REFERENCES award(id),
  organization_id INT NOT NULL REFERENCES organization(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body TEXT,
  UNIQUE (award_id, organization_id)
);

-- ========================= DD / COI ==================================
CREATE TABLE IF NOT EXISTS dd_case (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  source TEXT NOT NULL DEFAULT 'supplier', -- supplier|tender|award
  source_id INT,
  risk_tier TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open', -- open|screening|decided|expired
  screening_notes TEXT, decision TEXT, decision_reason TEXT,
  analyst_id INT, opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ, expires_on DATE
);

CREATE TABLE IF NOT EXISTS coi_declaration (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES app_user(id),
  tender_id INT REFERENCES tender(id),
  organization_id INT REFERENCES organization(id),
  has_conflict BOOLEAN NOT NULL DEFAULT false,
  conflict_type TEXT, details TEXT, mitigation TEXT,
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted|reviewed|cleared|blocked
  reviewed_by INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ======================== AUCTION ====================================
CREATE TABLE IF NOT EXISTS auction (
  id SERIAL PRIMARY KEY,
  tender_id INT NOT NULL REFERENCES tender(id) UNIQUE,
  start_price NUMERIC(19,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MNT',
  min_decrement NUMERIC(19,4) NOT NULL DEFAULT 1,
  starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
  extension_minutes INT NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|live|paused|ended|cancelled
  winner_org_id INT
);

CREATE TABLE IF NOT EXISTS auction_bid (
  id SERIAL PRIMARY KEY,
  auction_id INT NOT NULL REFERENCES auction(id),
  organization_id INT NOT NULL REFERENCES organization(id),
  amount NUMERIC(19,4) NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_auction_bid ON auction_bid(auction_id, amount);

-- ================= COMMS / NOTIFICATION / FILES ======================
CREATE TABLE IF NOT EXISTS msg_thread (
  id SERIAL PRIMARY KEY,
  context_type TEXT NOT NULL, -- tender|qualification|support|direct
  context_id INT,
  subject TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'supplier', -- supplier | internal
  organization_id INT,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  created_by INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msg_message (
  id SERIAL PRIMARY KEY,
  thread_id INT NOT NULL REFERENCES msg_thread(id),
  sender_id INT NOT NULL REFERENCES app_user(id),
  body TEXT NOT NULL,
  internal_only BOOLEAN NOT NULL DEFAULT false,
  attachment_id INT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES app_user(id),
  organization_id INT,
  ntype TEXT NOT NULL, -- invitation|deadline|clarification|approval|award|regret|system|qualification|support
  title_mn TEXT NOT NULL, title_en TEXT,
  body_mn TEXT, body_en TEXT,
  link TEXT,
  channel TEXT NOT NULL DEFAULT 'inapp', -- inapp|email
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, read_at);

-- simulated outgoing email box (dev mailbox)
CREATE TABLE IF NOT EXISTS email_outbox (
  id SERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_template (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  subject_mn TEXT, subject_en TEXT, body_mn TEXT, body_en TEXT,
  channel TEXT NOT NULL DEFAULT 'both', active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS attachment (
  id SERIAL PRIMARY KEY,
  owner_type TEXT NOT NULL, -- profile|permit|qualification|tender|bid|message|ticket|catalogue
  owner_id INT,
  category TEXT,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT, size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT,
  uploaded_by INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= SUPPORT / SURVEY / CATALOGUE ======================
CREATE TABLE IF NOT EXISTS support_article (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'general', -- general|registration|tender|qualification|account
  title_mn TEXT NOT NULL, title_en TEXT,
  body_mn TEXT NOT NULL, body_en TEXT,
  status TEXT NOT NULL DEFAULT 'published', -- draft|published|retired
  helpful INT NOT NULL DEFAULT 0, not_helpful INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_ticket (
  id SERIAL PRIMARY KEY,
  ticket_no TEXT NOT NULL UNIQUE,
  user_id INT NOT NULL REFERENCES app_user(id),
  organization_id INT,
  subject TEXT NOT NULL, body TEXT NOT NULL,
  severity INT NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'new', -- new|triaged|assigned|in_progress|waiting|resolved|closed|reopened
  assignee_id INT,
  sla_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS survey (
  id SERIAL PRIMARY KEY,
  title_mn TEXT NOT NULL, title_en TEXT,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open', -- draft|open|closed
  questions_json JSONB NOT NULL DEFAULT '[]',
  opens_at TIMESTAMPTZ, closes_at TIMESTAMPTZ,
  created_by INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_response (
  id SERIAL PRIMARY KEY,
  survey_id INT NOT NULL REFERENCES survey(id),
  user_id INT,
  answers_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogue_item (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL, category_id INT,
  manufacturer TEXT, part_no TEXT, origin_country TEXT,
  description TEXT, certifications TEXT,
  unit_price NUMERIC(19,4), currency TEXT DEFAULT 'MNT', uom TEXT DEFAULT 'EA',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_score (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  period TEXT NOT NULL, -- e.g. 2026-Q2
  difot NUMERIC(7,2), quality_score NUMERIC(7,2), overall NUMERIC(7,2),
  comment TEXT, created_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period)
);

CREATE TABLE IF NOT EXISTS supplier_feedback (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organization(id),
  tender_id INT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT, created_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= REFERENCE / MASTER DATA ===========================
CREATE TABLE IF NOT EXISTS ref_category (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,  -- SECT codes
  name_mn TEXT NOT NULL, name_en TEXT,
  parent_id INT, active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ref_uom (
  code TEXT PRIMARY KEY, name_mn TEXT, name_en TEXT
);

CREATE TABLE IF NOT EXISTS ref_currency (
  code TEXT PRIMARY KEY, name_mn TEXT, symbol TEXT, active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS exchange_rate (
  id SERIAL PRIMARY KEY,
  base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL,
  rate NUMERIC(19,8) NOT NULL,
  rate_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'MongolBank',
  UNIQUE (base_currency, quote_currency, rate_date)
);

CREATE TABLE IF NOT EXISTS ref_incoterm (
  code TEXT PRIMARY KEY, name TEXT
);

CREATE TABLE IF NOT EXISTS ref_manufacturer (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, country TEXT
);

CREATE TABLE IF NOT EXISTS ref_reason_code (
  code TEXT PRIMARY KEY, area TEXT NOT NULL, name_mn TEXT, name_en TEXT
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT
);

CREATE TABLE IF NOT EXISTS translation (
  key TEXT NOT NULL,
  lang TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, lang)
);

-- ===================== INTEGRATIONS ==================================
CREATE TABLE IF NOT EXISTS integration_config (
  code        TEXT PRIMARY KEY,   -- KHUR | DAN | SAP_PNOW | MSSQL_SYNC | SMTP | ANTHROPIC | SMS
  name_mn     TEXT NOT NULL, name_en TEXT,
  category    TEXT NOT NULL DEFAULT 'external', -- government | erp | messaging | ai | data
  enabled     BOOLEAN NOT NULL DEFAULT false,
  endpoint    TEXT, username TEXT, api_key TEXT,
  sync_interval_min INT,
  extra_json  JSONB NOT NULL DEFAULT '{}',
  last_test_at TIMESTAMPTZ, last_test_status TEXT, last_test_message TEXT,
  updated_by  INT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_log (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'out', -- in | out
  action TEXT NOT NULL,
  status TEXT NOT NULL, -- success | failure
  detail TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intlog ON integration_log(code, created_at);

-- ========================== AUDIT ====================================
CREATE TABLE IF NOT EXISTS audit_event (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id INT, actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT,
  reason TEXT,
  before_summary TEXT, after_summary TEXT,
  ip TEXT, correlation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_event(entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_event(occurred_at);

-- ===================== IN-PLACE MIGRATIONS ============================
-- Idempotent column additions for databases created by an earlier schema.
ALTER TABLE catalogue_item ADD COLUMN IF NOT EXISTS image_attachment_id INT;
