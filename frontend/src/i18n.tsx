import React, { createContext, useContext, useState } from 'react';

type Dict = Record<string, [string, string]>; // key: [mn, en]

const D: Dict = {
  // common
  login: ['Нэвтрэх', 'Log in'], register: ['Бүртгүүлэх', 'Register'], logout: ['Гарах', 'Log out'],
  email: ['Имэйл', 'Email'], password: ['Нууц үг', 'Password'], forgot: ['Нууц үг мартсан?', 'Forgot password?'],
  save: ['Хадгалах', 'Save'], cancel: ['Цуцлах', 'Cancel'], submit: ['Илгээх', 'Submit'], close: ['Хаах', 'Close'],
  search: ['Хайх', 'Search'], filter: ['Шүүлтүүр', 'Filter'], all: ['Бүгд', 'All'], add: ['Нэмэх', 'Add'],
  edit: ['Засах', 'Edit'], delete: ['Устгах', 'Delete'], download: ['Татах', 'Download'], upload: ['Хавсаргах', 'Upload'],
  status: ['Төлөв', 'Status'], actions: ['Үйлдэл', 'Actions'], date: ['Огноо', 'Date'], reason: ['Шалтгаан', 'Reason'],
  yes: ['Тийм', 'Yes'], no: ['Үгүй', 'No'], confirm: ['Баталгаажуулах', 'Confirm'], back: ['Буцах', 'Back'],
  next: ['Дараах', 'Next'], loading: ['Ачаалж байна...', 'Loading...'], welcome: ['Тавтай морилно уу!', 'Welcome!'],
  required_field: ['Заавал бөглөнө', 'Required'], saved: ['Хадгалагдлаа', 'Saved'], error: ['Алдаа гарлаа', 'Error occurred'],
  none_yet: ['Одоогоор алга', 'Nothing here yet'], details: ['Дэлгэрэнгүй', 'Details'], total: ['Нийт', 'Total'],
  open: ['Нээлттэй', 'Open'], closed: ['Хаагдсан', 'Closed'], view: ['Харах', 'View'], send: ['Илгээх', 'Send'],
  export_excel: ['Excel татах', 'Export Excel'], name: ['Нэр', 'Name'], type: ['Төрөл', 'Type'],
  amount: ['Дүн', 'Amount'], currency: ['Валют', 'Currency'], comment: ['Тайлбар', 'Comment'],

  // nav supplier
  nav_dashboard: ['Хянах самбар', 'Dashboard'], nav_profile: ['Профайл', 'Profile'],
  nav_qualification: ['Урьдчилсан үнэлгээ', 'Qualification'], nav_tenders: ['Тендер', 'Tenders'],
  nav_messages: ['Мессеж', 'Messages'], nav_notifications: ['Мэдэгдэл', 'Notifications'],
  nav_catalogue: ['Каталог', 'Catalogue'], nav_kpi: ['KPI / Үнэлгээ', 'KPI / Scores'],
  nav_support: ['Дэмжлэгийн төв', 'Support Hub'], nav_surveys: ['Судалгаа', 'Surveys'],
  // nav admin
  nav_suppliers: ['Нийлүүлэгчид', 'Suppliers'], nav_qual_queue: ['Үнэлгээний хяналт', 'Qualification review'],
  nav_tender_mgmt: ['Тендер удирдлага', 'Tender management'], nav_approvals: ['Зөвшөөрөл', 'Approvals'],
  nav_dd: ['DD / COI', 'DD / COI'], nav_reports: ['Тайлан', 'Reports'], nav_users: ['Хэрэглэгчид', 'Users'],
  nav_masterdata: ['Мастер дата', 'Master data'], nav_translations: ['Орчуулга', 'Translations'],
  nav_audit: ['Аудит лог', 'Audit log'], nav_health: ['Системийн эрүүл мэнд', 'System health'], nav_support_admin: ['Дэмжлэг', 'Support'],
  nav_integrations: ['Интеграц', 'Integrations'],
  test_connection: ['Холболт шалгах', 'Test connection'], last_test: ['Сүүлийн шалгалт', 'Last test'],
  enabled: ['Идэвхтэй', 'Enabled'], disabled_st: ['Идэвхгүй', 'Disabled'],
  endpoint: ['Endpoint / хаяг', 'Endpoint'], api_key: ['API түлхүүр', 'API key'],
  sync_interval: ['Sync давтамж (мин)', 'Sync interval (min)'],
  integration_logs: ['Интеграцийн лог', 'Integration logs'],
  nav_notif_admin: ['Мэдэгдэл удирдлага', 'Notifications'],

  // auth
  login_title: ['НЭВТРЭХ', 'LOG IN'], login_sub: ['Нийлүүлэгчийн нэгдсэн систем 2.0', 'Supplier integrated system 2.0'],
  no_account: ['Та бүртгэлгүй юу?', "Don't have an account?"], have_account: ['Бүртгэлтэй юу?', 'Already registered?'],
  remember: ['Намайг сана', 'Remember me'], invalid_credentials: ['Имэйл эсвэл нууц үг буруу байна', 'Invalid email or password'],
  account_locked: ['Бүртгэл түгжигдсэн. Дэмжлэгт хандана уу.', 'Account locked. Contact support.'],
  otp_prompt: ['Имэйлээр очсон 6 оронтой кодоо оруулна уу', 'Enter the 6-digit code sent to your email'],
  reg_step1: ['Имэйл баталгаажуулах', 'Verify email'], reg_step2: ['Нууц үг үүсгэх', 'Create password'],
  reg_step3: ['Байгууллагын мэдээлэл', 'Organization info'],
  verification_sent: ['Баталгаажуулах код имэйл рүү илгээгдлээ (демо: доор харагдана)', 'Verification code sent to email (demo: shown below)'],
  verify_code: ['Баталгаажуулах код', 'Verification code'],
  password_rule: ['Том, жижиг үсэг, тоо орсон 8+ тэмдэгт', '8+ chars with upper, lower case and digit'],
  confirm_password: ['Нууц үг давтах', 'Confirm password'],
  org_company: ['Байгууллага', 'Company'], org_individual: ['Хувь хүн', 'Individual'],
  res_national: ['Дотоодын', 'National'], res_international: ['Гадаадын', 'International'],
  registry_no: ['Регистрийн дугаар', 'Registry number'], khur_check: ['ХУР шалгах', 'Check KHUR'],
  khur_found: ['ХУР системээс баталгаажлаа', 'Verified against KHUR registry'],
  khur_not_found: ['ХУР системд олдсонгүй — гараар бөглөнө үү', 'Not found in KHUR — enter manually'],
  company_name_mn: ['Байгууллагын нэр (МН)', 'Company name (MN)'], company_name_en: ['Байгууллагын нэр (EN)', 'Company name (EN)'],
  your_name: ['Таны нэр', 'Your name'], phone: ['Утас', 'Phone'], terms_agree: ['Үйлчилгээний нөхцөл, нууцлалын бодлогыг зөвшөөрч байна', 'I agree to the terms and privacy policy'],

  // dashboard
  deadlines_72: ['Ойрын хаагдах хугацаа (72 цаг)', 'Closing within 72 hours'],
  draft_bids: ['Ноорог саналууд', 'Draft bids'], recent_results: ['Сүүлийн үр дүн', 'Recent results'],
  profile_completion: ['Профайлын гүйцэтгэл', 'Profile completion'],
  qual_status: ['Үнэлгээний төлөв', 'Qualification status'], hours_short: ['цаг', 'h'],
  view_all: ['Бүгдийг харах', 'View all'], next_action: ['Дараагийн алхам', 'Next action'],
  participated: ['Оролцсон', 'Participated'], invited: ['Уригдсан', 'Invited'], responded: ['Хариу өгсөн', 'Responded'],

  // profile
  general_info: ['Ерөнхий мэдээлэл', 'General information'], team: ['Удирдлагын баг', 'Management team'],
  shareholders: ['Хувьцаа эзэмшигчид', 'Shareholders'], permits: ['Тусгай зөвшөөрөл', 'Permits'],
  categories: ['Бүтээгдэхүүн/үйлчилгээний ангилал', 'Product/service categories'],
  address: ['Хаяг', 'Address'], workforce: ['Ажиллах хүч', 'Workforce'],
  total_employees: ['Нийт ажилтан', 'Total employees'], mongolian_employees: ['Монгол ажилтан', 'Mongolian employees'],
  umnugovi_employees: ['Өмнөговийн ажилтан', 'Umnugovi employees'],
  submit_profile: ['Профайл илгээх', 'Submit profile'], profile_submitted: ['Профайл хянуулахаар илгээгдлээ', 'Profile submitted for review'],
  change_request_note: ['Батлагдсан профайлын өөрчлөлт админ баталсны дараа хүчинтэй болно', 'Changes to an approved profile take effect after admin approval'],
  ownership_percent: ['Эзэмшлийн хувь', 'Ownership %'], position: ['Албан тушаал', 'Position'],
  expires_on: ['Дуусах огноо', 'Expires'], issued_on: ['Олгосон огноо', 'Issued'], issuer: ['Олгогч', 'Issuer'],

  // qualification
  start_qual: ['Үнэлгээ эхлүүлэх', 'Start assessment'], continue_qual: ['Үргэлжлүүлэх', 'Continue'],
  autosaved: ['Автоматаар хадгалагдлаа', 'Autosaved'],
  qual_submit_confirm: ['Илгээсний дараа засварлах боломжгүй. Илгээх үү?', 'Cannot edit after submitting. Submit now?'],
  required_missing: ['Заавал асуултууд дутуу байна', 'Required questions are missing'],
  evidence_missing: ['Нотлох баримт дутуу байна', 'Required evidence attachments missing'],

  // tenders
  time_left: ['Үлдсэн хугацаа', 'Time left'], closes: ['Хаагдах', 'Closes'], published: ['Нийтэлсэн', 'Published'],
  tender_no: ['Тендерийн №', 'Tender no'], title: ['Гарчиг', 'Title'],
  my_bid: ['Миний санал', 'My bid'], not_participated: ['Оролцоогүй', 'Not participated'],
  disclaimer_title: ['Анхааруулга / Disclaimer', 'Disclaimer'],
  disclaimer_body: ['Энэхүү тендерийн мэдээлэл нь нууцлалтай бөгөөд зөвхөн урилга хүлээн авагчид зориулагдсан. Оролцсоноор та тендерийн нөхцөл, ёс зүйн шаардлагыг хүлээн зөвшөөрч байна. Оюу Толгой ХХК нь аль ч саналыг хүлээн авах, татгалзах эрхтэй.', 'This tender information is confidential and intended only for invited recipients. By participating you accept the tender conditions and ethical requirements. Oyu Tolgoi LLC reserves the right to accept or reject any bid.'],
  accept_continue: ['Зөвшөөрч үргэлжлүүлэх', 'Accept and continue'], decline_invite: ['Татгалзах', 'Decline'],
  requirements: ['Шаардлагууд', 'Requirements'], items: ['Барааны жагсаалт', 'Line items'],
  bid_editor: ['Үнийн санал', 'Bid'], unit_price: ['Нэгж үнэ', 'Unit price'], qty: ['Тоо', 'Qty'],
  line_total: ['Нийт дүн', 'Line total'], lead_time: ['Нийлүүлэх хугацаа (хоног)', 'Lead time (days)'],
  alternative: ['Alternative', 'Alternative'], manufacturer: ['Үйлдвэрлэгч', 'Manufacturer'], part_no: ['Парт №', 'Part no'],
  datasheet: ['Datasheet', 'Datasheet'], license_doc: ['Лиценз', 'License'], certificate: ['Сертификат', 'Certificate'],
  validate: ['Шалгах', 'Validate'], validation_ok: ['Алдаа олдсонгүй — илгээхэд бэлэн', 'No errors — ready to submit'],
  download_template: ['Excel загвар татах', 'Download Excel template'], import_excel: ['Excel импорт', 'Import Excel'],
  submit_bid: ['Санал илгээх', 'Submit bid'], bid_submitted: ['Санал амжилттай илгээгдлээ', 'Bid submitted successfully'],
  receipt_no: ['Баримтын дугаар', 'Receipt no'], revision: ['Хувилбар', 'Revision'],
  validity_days: ['Саналын хүчинтэй хугацаа (хоног)', 'Bid validity (days)'],
  draft_saved: ['Ноорог хадгалагдлаа', 'Draft saved'], withdraw: ['Санал татах', 'Withdraw'],
  clarification: ['Тодруулга', 'Clarification'], ask_question: ['Асуулт илгээх', 'Ask a question'],
  attachments: ['Хавсралтууд', 'Attachments'], deadline_history: ['Хугацааны түүх', 'Deadline history'],

  // auction
  auction_live: ['Аукшин явагдаж байна', 'Auction is live'], current_best: ['Одоогийн хамгийн бага', 'Current best'],
  your_bid_max: ['Таны саналын дээд хязгаар', 'Your maximum bid'], place_bid: ['Санал өгөх', 'Place bid'],
  min_decrement: ['Хамгийн бага бууралт', 'Min decrement'], auction_ended: ['Аукшин дууссан', 'Auction ended'],
  you_won: ['Та түрүүллээ! 🎉', 'You won! 🎉'], bid_too_high: ['Санал хэт өндөр байна', 'Bid too high'],

  // messages / notifications
  new_thread: ['Шинэ мессеж', 'New message'], subject: ['Гарчиг', 'Subject'], mark_read: ['Уншсан болгох', 'Mark read'],
  mailbox: ['Имэйл (демо)', 'Email (demo)'], internal_note: ['Дотоод тэмдэглэл', 'Internal note'],
  reply: ['Хариулах', 'Reply'],

  // support
  ask_ai: ['AI туслахаас асуух', 'Ask the AI assistant'], ai_answer: ['AI хариулт', 'AI answer'],
  create_ticket: ['Тасалбар үүсгэх', 'Create ticket'], severity: ['Ноцтой байдал', 'Severity'],
  my_tickets: ['Миний тасалбарууд', 'My tickets'], helpful: ['Тустай', 'Helpful'],
  faq: ['Түгээмэл асуулт, гарын авлага', 'FAQ & guides'],

  // admin
  pending_review: ['Хянагдахаар хүлээгдэж буй', 'Pending review'], approve: ['Батлах', 'Approve'],
  reject: ['Татгалзах', 'Reject'], needs_correction: ['Засвар шаардах', 'Request correction'],
  suspend: ['Түдгэлзүүлэх', 'Suspend'], blacklist: ['Хар жагсаалт', 'Blacklist'], reactivate: ['Идэвхжүүлэх', 'Reactivate'],
  timeline: ['Түүх', 'Timeline'], risk: ['Эрсдэл', 'Risk'],
  create_tender: ['Тендер үүсгэх', 'Create tender'], wizard_type: ['Төрөл', 'Type'], wizard_main: ['Үндсэн мэдээлэл', 'Main info'],
  wizard_email: ['Имэйл агуулга', 'Email content'], wizard_items: ['Бараа/Шаардлага', 'Items/Form'],
  wizard_recipients: ['Хүлээн авагчид', 'Recipients'], wizard_review: ['Шалгаж нийтлэх', 'Validate & publish'],
  request_publish: ['Нийтлэх зөвшөөрөл хүсэх', 'Request publish approval'],
  recipients_preview: ['Хүлээн авагчдын урьдчилсан харагдац', 'Recipient preview'],
  comparison: ['Саналын харьцуулалт', 'Bid comparison'], evaluation: ['Үнэлгээ', 'Evaluation'],
  eu_evaluation: ['End-user үнэлгээ', 'End-user evaluation'], buyer_evaluation: ['Buyer үнэлгээ', 'Buyer evaluation'],
  recommendation: ['Зөвлөмж', 'Recommendation'], justification: ['Үндэслэл', 'Justification'],
  select_supplier: ['Нийлүүлэгч сонгох', 'Select supplier'], selected: ['Сонгосон', 'Selected'],
  lowest_price: ['Хамгийн бага үнэ', 'Lowest price'], request_award: ['Award зөвшөөрөл хүсэх', 'Request award approval'],
  award: ['Award', 'Award'], regret: ['Regret', 'Regret'], cancel_award: ['Award цуцлах', 'Cancel award'],
  approve_stage: ['Батлах', 'Approve'], reject_stage: ['Татгалзах', 'Reject'], return_stage: ['Буцаах', 'Return'],
  delegate: ['Шилжүүлэх', 'Delegate'], current_approver: ['Одоогийн батлагч', 'Current approver'],
  stage: ['Шат', 'Stage'], overdue: ['Хугацаа хэтэрсэн', 'Overdue'], age: ['Хүлээгдсэн', 'Age'],
  my_actions: ['Миний ажлууд', 'My actions'], run_report: ['Тайлан ажиллуулах', 'Run report'],
  ai_summary: ['AI хураангуй', 'AI summary'], generating: ['Боловсруулж байна...', 'Generating...'],
  broadcast: ['Мэдэгдэл илгээх', 'Broadcast'], audience: ['Хүлээн авагчид', 'Audience'],
  add_language: ['Хэл нэмэх', 'Add language'], key: ['Түлхүүр', 'Key'],
  deadline_change: ['Хугацаа өөрчлөх', 'Change deadline'], new_deadline: ['Шинэ хаагдах хугацаа', 'New close date'],
  start_evaluation: ['Үнэлгээ эхлүүлэх', 'Start evaluation'], close_tender: ['Тендер хаах', 'Close tender'],
  cancel_tender: ['Тендер цуцлах', 'Cancel tender'], negotiation: ['Тохиролцоо', 'Negotiation'],
  new_round: ['Шинэ шат нээх', 'Open new round'], dd_case: ['DD хэрэг', 'DD case'], coi_decl: ['COI мэдүүлэг', 'COI declaration'],
  decision: ['Шийдвэр', 'Decision'], cleared: ['Цэвэр', 'Cleared'], blocked: ['Хориглосон', 'Blocked'],
  open_case: ['Хэрэг нээх', 'Open case'], screening: ['Шалгалт', 'Screening'],
  scores: ['Үнэлгээ, оноо', 'Scores'], feedback: ['Санал шүүмж', 'Feedback'],
  publish_survey: ['Судалгаа нийтлэх', 'Publish survey'], results: ['Үр дүн', 'Results'],
  known_issue: ['Мэдэгдэж буй асуудлын мэдээлэл', 'Known issue banner'],
  session_expiring: ['Таны session удахгүй дуусна', 'Your session is about to expire'],
  session_expired: ['Идэвхгүй байсан тул та системээс гарлаа (15 мин)', 'Logged out due to inactivity (15 min)'],
};

const LangCtx = createContext<{ lang: string; setLang: (l: string) => void; t: (k: string) => string }>({ lang: 'mn', setLang: () => {}, t: k => k });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState(localStorage.getItem('oasis_lang') || 'mn');
  const setLang = (l: string) => { setLangState(l); localStorage.setItem('oasis_lang', l); };
  const t = (k: string) => {
    const e = D[k];
    if (!e) return k;
    return lang === 'en' ? e[1] : e[0];
  };
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/** pick mn/en field from a record */
export function useL() {
  const { lang } = useLang();
  return (obj: any, base: string) => {
    if (!obj) return '';
    return (lang === 'en' ? (obj[`${base}_en`] || obj[`${base}_mn`]) : (obj[`${base}_mn`] || obj[`${base}_en`])) || '';
  };
}
