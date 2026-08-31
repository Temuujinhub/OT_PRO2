import bcrypt from 'bcryptjs';
import { q, q1 } from './db';

const PW = 'Oasis@2026';

export async function seed() {
  const hash = await bcrypt.hash(PW, 10);

  // ---------- master data ----------
  await q(`INSERT INTO ref_currency(code, name_mn, symbol) VALUES
    ('MNT','Төгрөг','₮'),('USD','Ам.доллар','$'),('EUR','Евро','€'),('CNY','Юань','¥'),('AUD','Австрали доллар','A$')
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO exchange_rate(base_currency, quote_currency, rate, rate_date, source) VALUES
    ('USD','MNT', 3450.50, CURRENT_DATE, 'MongolBank'),
    ('EUR','MNT', 3720.25, CURRENT_DATE, 'MongolBank'),
    ('CNY','MNT', 476.80, CURRENT_DATE, 'MongolBank'),
    ('AUD','MNT', 2245.00, CURRENT_DATE, 'MongolBank')
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO ref_uom(code, name_mn, name_en) VALUES
    ('EA','Ширхэг','Each'),('KG','Килограмм','Kilogram'),('L','Литр','Litre'),('M','Метр','Metre'),
    ('SET','Иж бүрдэл','Set'),('BOX','Хайрцаг','Box'),('T','Тонн','Tonne'),('HR','Цаг','Hour'),('M3','Шоо метр','Cubic metre')
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO ref_incoterm(code, name) VALUES
    ('EXW','Ex Works'),('FCA','Free Carrier'),('DAP','Delivered At Place'),('DDP','Delivered Duty Paid'),
    ('CIF','Cost Insurance Freight'),('FOB','Free On Board') ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO ref_manufacturer(name, country) VALUES
    ('Caterpillar','US'),('Komatsu','JP'),('Sandvik','SE'),('Atlas Copco','SE'),('SKF','SE'),
    ('Siemens','DE'),('ABB','CH'),('Parker Hannifin','US'),('Donaldson','US'),('Metso','FI')
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO ref_category(code, name_mn, name_en) VALUES
    ('SECT-01','Уул уурхайн тоног төхөөрөмж','Mining equipment'),
    ('SECT-02','Сэлбэг хэрэгсэл','Spare parts'),
    ('SECT-03','Барилга, засвар','Construction & maintenance'),
    ('SECT-04','Хүнс, хоол үйлдвэрлэл','Catering & food'),
    ('SECT-05','Тээвэр, логистик','Transport & logistics'),
    ('SECT-06','Мэдээллийн технологи','Information technology'),
    ('SECT-07','ХАБЭА хэрэгсэл','HSE supplies'),
    ('SECT-08','Зөвлөх үйлчилгээ','Consulting services'),
    ('SECT-09','Аюулгүй ажиллагааны хувцас','Safety clothing/PPE'),
    ('SECT-10','Цахилгаан хэрэгсэл','Electrical supplies')
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO ref_reason_code(code, area, name_mn, name_en) VALUES
    ('SUP_WITHDRAW','award_cancel','Нийлүүлэгч татгалзсан','Supplier withdrawal'),
    ('APPR_CORRECTION','award_cancel','Зөвшөөрлийн залруулга','Approval correction'),
    ('COMPLIANCE','award_cancel','Compliance асуудал','Compliance issue'),
    ('COMMERCIAL','award_cancel','Худалдааны нөхцөл өөрчлөгдсөн','Commercial change'),
    ('SCOPE_CHANGE','negotiation','Хамрах хүрээ өөрчлөгдсөн','Scope change'),
    ('DEADLINE_EXT','tender','Хугацаа сунгалт','Deadline extension')
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO tender_type(code, name_mn, name_en, has_items) VALUES
    ('EOI','Сонирхол илэрхийлэх (EOI)','Expression of Interest', false),
    ('RFQ','Үнийн санал (RFQ Goods)','Request for Quotation — Goods', true),
    ('RFQ_SERVICE','Үйлчилгээний үнийн санал','RFQ — Service', true),
    ('OEM','OEM худалдан авалт','OEM procurement', true),
    ('TRAVEL','Аялал, зочид буудал','Travel', false),
    ('FREIGHT','Тээвэрлэлт','Freight', true),
    ('AUCTION','Урвуу дуудлага худалдаа','Reverse auction', false)
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO app_setting(key, value, description) VALUES
    ('session_idle_minutes','15','Idle session timeout'),
    ('max_categories_per_supplier','20','SECT code limit'),
    ('negotiation_price_increase','blocked','Default negotiation price increase policy'),
    ('known_issue_banner','','Known issue banner text'),
    ('feature_reverse_auction','on','Feature flag: reverse auction'),
    ('feature_report_ai','on','Feature flag: AI report summary')
    ON CONFLICT DO NOTHING`);

  // ---------- ХУР mock registry ----------
  await q(`INSERT INTO khur_registry(registry_no, name_mn, name_en, legal_form, state_reg_no, established, director, address) VALUES
    ('5029342','Монгол Машин Механизм ХХК','Mongol Machinery LLC','ХХК','9019023001','2008-04-12','Б.Батбаяр','УБ, ХУД, 3-р хороо'),
    ('2887101','Говь Логистик ХХК','Gobi Logistics LLC','ХХК','9011002200','2012-09-01','Д.Энхтуяа','УБ, СБД, 8-р хороо'),
    ('6110234','Оюуны Түлхүүр ХХК','Oyunii Tulkhuur LLC','ХХК','9014405060','2015-02-20','С.Мөнхзул','Өмнөговь, Даланзадгад'),
    ('3341190','Хангай Трейд ХХК','Khangai Trade LLC','ХХК','9017708090','2010-11-05','Т.Ганзориг','УБ, БЗД, 26-р хороо'),
    ('7208856','Эрдэнэс Сервис ХХК','Erdenes Service LLC','ХХК','9020103040','2018-06-15','Н.Оюунчимэг','Өмнөговь, Ханбогд'),
    ('1112223','Далайван Импекс ХХК','Dalaivan Impex LLC','ХХК','9022204450','2019-01-10','Ж.Тэмүүлэн','УБ, ЧД, 1-р хороо')
    ON CONFLICT DO NOTHING`);

  // ---------- internal users ----------
  const internals = [
    ['admin@oasis.mn', 'Б.Админ', 'SystemAdmin', 'IT', 'System administrator', null],
    ['buyer@oasis.mn', 'Д.Батжаргал', 'Buyer', 'Procurement', 'Senior Buyer', null],
    ['buyer2@oasis.mn', 'Г.Сарнай', 'Buyer', 'Procurement', 'Buyer', null],
    ['enduser@oasis.mn', 'С.Төмөрбаатар', 'EndUser', 'Maintenance', 'Reliability engineer', null],
    ['compliance@oasis.mn', 'Н.Наранцэцэг', 'Compliance', 'Compliance', 'Compliance reviewer', null],
    ['screening@oasis.mn', 'О.Билгүүн', 'Screening', 'Compliance', 'Qualification analyst', null],
    ['dd@oasis.mn', 'Х.Мөнхтуяа', 'DDAnalyst', 'Compliance', 'DD/COI analyst', null],
    ['approver@oasis.mn', 'Л.Эрдэнэбат', 'Approver', 'Procurement', 'Procurement lead', 100000000],
    ['approver2@oasis.mn', 'Ц.Амартүвшин', 'Approver', 'Finance', 'Department head', 500000000],
    ['approver3@oasis.mn', 'П.Золбоо', 'Approver', 'Executive', 'DFA authority', 5000000000],
    ['support@oasis.mn', 'Э.Ууганбаяр', 'Support', 'IT', 'Support agent', null],
    ['content@oasis.mn', 'М.Сувдаа', 'ContentAdmin', 'IT', 'Content/translation admin', null],
    ['auditor@oasis.mn', 'Р.Батзул', 'Auditor', 'Audit', 'Security auditor', null],
  ];
  const uid: Record<string, number> = {};
  for (const [email, name, role, dept, pos, limit] of internals) {
    const row = (await q(
      `INSERT INTO app_user(email, password_hash, display_name, user_type, role, status, department, position, approval_limit, language)
       VALUES ($1,$2,$3,'internal',$4,'active',$5,$6,$7,'mn') RETURNING id`,
      [email, hash, name, role, dept, pos, limit]))[0];
    uid[email as string] = row.id;
  }

  // ---------- supplier organizations + users ----------
  async function mkOrg(o: any): Promise<number> {
    const org = (await q(
      `INSERT INTO organization(org_type, residency, registry_no, state_reg_no, vendor_no, name_mn, name_en, status, risk_level, khur_verified, khur_verified_at, completion_percent, submitted_at, country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $10 THEN now() END, $11, CASE WHEN $8 <> 'draft' THEN now() END, $12) RETURNING id`,
      [o.type || 'company', o.residency || 'national', o.reg || null, o.stateReg || null, o.vendor || null,
       o.mn, o.en, o.status, o.risk || 'low', o.khur ?? true, o.completion ?? 90, o.country || 'MN']))[0];
    await q(
      `INSERT INTO org_profile(organization_id, address_country, address_province, address_district, address_line1, phone, website,
         established_year, legal_form, total_employees, mongolian_employees, umnugovi_employees, tax_number, intro_mn)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [org.id, o.country || 'MN', o.province || 'Улаанбаатар', o.district || 'Сүхбаатар', o.address || 'Оюуны гудамж 1',
       o.phone || '+976 7700' + String(1000 + org.id), o.web || null, o.year || 2012, 'ХХК',
       o.emp || 120, o.empMn ?? (o.emp || 120), o.empUg || 15, 'TT' + (o.reg || org.id), o.intro || null]);
    await q(`INSERT INTO org_contact(organization_id, contact_type, full_name, position, email, phone1, receives_email)
             VALUES ($1,'primary',$2,$3,$4,$5,true)`,
      [org.id, o.contact || 'Захирал', 'Гүйцэтгэх захирал', o.email, o.phone || '+976 99110011']);
    if (o.categories) for (const code of o.categories) {
      const cat = await q1('SELECT id FROM ref_category WHERE code=$1', [code]);
      if (cat) await q('INSERT INTO org_category VALUES ($1,$2) ON CONFLICT DO NOTHING', [org.id, cat.id]);
    }
    if (o.shareholders) for (const s of o.shareholders) {
      await q(`INSERT INTO org_shareholder(organization_id, name, owner_type, ownership_percent, country, beneficial_owner)
               VALUES ($1,$2,'individual',$3,'MN',$4)`, [org.id, s[0], s[1], s[1] >= 25]);
    }
    if (o.permits) for (const p of o.permits) {
      await q(`INSERT INTO org_permit(organization_id, permit_type, number, issuer, issued_on, expires_on)
               VALUES ($1,$2,$3,$4,$5,$6)`, [org.id, p[0], p[1], p[2], p[3], p[4]]);
    }
    const u = (await q(
      `INSERT INTO app_user(email, password_hash, display_name, user_type, role, status, organization_id, language)
       VALUES ($1,$2,$3,'supplier','SupplierPrimary','active',$4,'mn') RETURNING id`,
      [o.email, hash, o.contact || o.mn, org.id]))[0];
    uid[o.email] = u.id;
    return org.id;
  }

  const org1 = await mkOrg({
    mn: 'Монгол Машин Механизм ХХК', en: 'Mongol Machinery LLC', reg: '5029342', stateReg: '9019023001', vendor: 'V100234',
    status: 'approved', email: 'supplier@test.mn', contact: 'Б.Батбаяр', year: 2008, emp: 240, empMn: 236, empUg: 40,
    categories: ['SECT-01', 'SECT-02', 'SECT-10'], shareholders: [['Б.Батбаяр', 60], ['Д.Сүхбат', 40]],
    permits: [['Импортын тусгай зөвшөөрөл', 'IMP-2024-118', 'АМГТГ', '2024-01-10', '2027-01-10']],
    intro: 'Уул уурхайн тоног төхөөрөмж, сэлбэгийн албан ёсны нийлүүлэгч.',
  });
  const org2 = await mkOrg({
    mn: 'Говь Логистик ХХК', en: 'Gobi Logistics LLC', reg: '2887101', stateReg: '9011002200', vendor: 'V100501',
    status: 'approved', email: 'gobi@test.mn', contact: 'Д.Энхтуяа', year: 2012, emp: 85, empMn: 85, empUg: 30,
    categories: ['SECT-05', 'SECT-03'], shareholders: [['Д.Энхтуяа', 100]],
    permits: [['Тээврийн тусгай зөвшөөрөл', 'TRN-2023-090', 'ЗТХЯ', '2023-05-01', '2026-05-01']],
  });
  const org3 = await mkOrg({
    mn: 'Оюуны Түлхүүр ХХК', en: 'Oyunii Tulkhuur LLC', reg: '6110234', vendor: 'V100777',
    status: 'approved', email: 'ot@test.mn', contact: 'С.Мөнхзул', province: 'Өмнөговь', district: 'Даланзадгад',
    emp: 45, empMn: 45, empUg: 42, categories: ['SECT-07', 'SECT-09'], shareholders: [['С.Мөнхзул', 51], ['Б.Түвшин', 49]],
  });
  const org4 = await mkOrg({
    mn: 'Хангай Трейд ХХК', en: 'Khangai Trade LLC', reg: '3341190',
    status: 'submitted', email: 'khangai@test.mn', contact: 'Т.Ганзориг', completion: 75,
    categories: ['SECT-02', 'SECT-04'],
  });
  const org5 = await mkOrg({
    mn: 'Эрдэнэс Сервис ХХК', en: 'Erdenes Service LLC', reg: '7208856',
    status: 'approved', email: 'erdenes@test.mn', contact: 'Н.Оюунчимэг', province: 'Өмнөговь', district: 'Ханбогд',
    emp: 160, empMn: 158, empUg: 120, categories: ['SECT-03', 'SECT-05'], risk: 'medium',
    shareholders: [['Н.Оюунчимэг', 70], ['Х.Батсайхан', 30]],
  });
  const org6 = await mkOrg({
    mn: 'Global Mining Supplies Pte', en: 'Global Mining Supplies Pte Ltd', residency: 'international', country: 'SG',
    status: 'approved', email: 'global@test.mn', contact: 'John Tan', khur: false, province: 'Singapore', district: '—',
    emp: 300, empMn: 0, empUg: 0, categories: ['SECT-01', 'SECT-02'],
  });
  const org7 = await mkOrg({
    mn: 'Далайван Импекс ХХК', en: 'Dalaivan Impex LLC', reg: '1112223',
    status: 'draft', email: 'dalaivan@test.mn', contact: 'Ж.Тэмүүлэн', completion: 40, khur: true,
  });

  // extra supplier employee
  await q(`INSERT INTO app_user(email, password_hash, display_name, user_type, role, status, organization_id, language)
           VALUES ('employee@test.mn',$1,'Б.Ажилтан','supplier','SupplierEmployee','active',$2,'mn')`, [hash, org1]);

  // ---------- qualification programs ----------
  async function mkProgram(code: string, ptype: string, nameMn: string, nameEn: string, sections: any[]) {
    const p = (await q(`INSERT INTO qual_program(code, ptype, name_mn, name_en) VALUES ($1,$2,$3,$4) RETURNING id`,
      [code, ptype, nameMn, nameEn]))[0];
    let so = 0;
    for (const s of sections) {
      const sec = (await q(`INSERT INTO qual_section(program_id, code, order_no, title_mn, title_en) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [p.id, s.code, so++, s.mn, s.en]))[0];
      let qo = 0;
      for (const qq of s.questions) {
        await q(
          `INSERT INTO qual_question(section_id, code, order_no, qtype, label_mn, label_en, required, options_json, guidance_mn, evidence_required)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [sec.id, `${s.code}-Q${qo + 1}`, qo++, qq.t, qq.mn, qq.en, qq.req ?? true,
           qq.opts ? JSON.stringify(qq.opts) : null, qq.g || null, qq.ev ?? false]);
      }
    }
    return p.id;
  }

  const preqId = await mkProgram('PREQ', 'prequalification', 'Урьдчилсан үнэлгээ', 'Pre-Qualification', [
    { code: 'FIN', mn: 'Санхүү', en: 'Finance', questions: [
      { t: 'money', mn: 'Сүүлийн жилийн борлуулалтын орлого (MNT)', en: 'Last year revenue (MNT)' },
      { t: 'yesno', mn: 'Сүүлийн 3 жилд аудит хийлгэсэн үү?', en: 'Audited in last 3 years?', ev: true },
      { t: 'yesno', mn: 'Татварын өргүй тодорхойлолттой юу?', en: 'Tax clearance available?', ev: true },
      { t: 'number', mn: 'Нийт ажилтны тоо', en: 'Total employees' },
    ]},
    { code: 'ETH', mn: 'Бизнесийн ёс зүй ба Хүний нөөц', en: 'Business ethics & HR', questions: [
      { t: 'yesno', mn: 'Ёс зүйн дүрэмтэй юу?', en: 'Code of conduct in place?' },
      { t: 'yesno', mn: 'Авлигын эсрэг бодлоготой юу?', en: 'Anti-corruption policy?' },
      { t: 'text', mn: 'Хөдөлмөрийн маргааны түүх (сүүлийн 3 жил)', en: 'Labour disputes (last 3 years)', req: false },
      { t: 'yesno', mn: 'Хүүхдийн хөдөлмөр ашигладаггүйгээ баталгаажуулна уу', en: 'No child labour confirmation' },
    ]},
    { code: 'ENV', mn: 'Байгаль орчны менежмент', en: 'Environment management', questions: [
      { t: 'yesno', mn: 'Байгаль орчны менежментийн системтэй юу (ISO 14001)?', en: 'EMS (ISO 14001)?', req: false, ev: true },
      { t: 'text', mn: 'Хог хаягдлын менежментийн тойм', en: 'Waste management overview', req: false },
    ]},
    { code: 'HSE', mn: 'ХАБЭА', en: 'HSE', questions: [
      { t: 'yesno', mn: 'ХАБЭА бодлого баримт бичигтэй юу?', en: 'HSE policy documented?', ev: true },
      { t: 'number', mn: 'Сүүлийн жилийн LTIFR үзүүлэлт', en: 'LTIFR last year', req: false },
      { t: 'single', mn: 'ХАБЭА сургалтын давтамж', en: 'HSE training frequency',
        opts: [{ v: 'monthly', mn: 'Сар бүр', en: 'Monthly' }, { v: 'quarterly', mn: 'Улирал бүр', en: 'Quarterly' }, { v: 'yearly', mn: 'Жил бүр', en: 'Yearly' }] },
    ]},
  ]);
  await mkProgram('DD', 'due_diligence', 'Due Diligence асуулга', 'Due Diligence questionnaire', [
    { code: 'OWN', mn: 'Эзэмшил', en: 'Ownership', questions: [
      { t: 'text', mn: 'Эцсийн өмчлөгчдийн мэдээлэл', en: 'Beneficial owners' },
      { t: 'yesno', mn: 'Төрийн өндөр албан тушаалтантай холбоотой юу?', en: 'PEP connection?' },
    ]},
  ]);

  // qualification submissions: org1 approved, org3 submitted, org5 needs_improvement
  async function mkQual(orgId: number, status: string, opts: any = {}) {
    const sub = (await q(
      `INSERT INTO qual_submission(organization_id, program_id, status, submitted_at, decided_at, reviewer_id, risk_score, decision_comment, expires_on)
       VALUES ($1,$2,$3, now() - interval '20 days', $4, $5, $6, $7, $8) RETURNING id`,
      [orgId, preqId, status,
       ['approved', 'rejected', 'needs_improvement'].includes(status) ? new Date() : null,
       ['approved', 'rejected', 'needs_improvement'].includes(status) ? uid['screening@oasis.mn'] : null,
       opts.risk || null, opts.comment || null, status === 'approved' ? '2027-08-31' : null]))[0];
    const questions = await q(`SELECT qq.* FROM qual_question qq JOIN qual_section s ON s.id=qq.section_id WHERE s.program_id=$1`, [preqId]);
    for (const qq of questions) {
      const vals: any = { value_text: null, value_number: null, value_bool: null };
      if (qq.qtype === 'money' || qq.qtype === 'number') vals.value_number = qq.qtype === 'money' ? 2500000000 : 240;
      else if (qq.qtype === 'yesno') vals.value_bool = true;
      else if (qq.qtype === 'single') vals.value_text = 'monthly';
      else vals.value_text = 'Тайлбар мэдээлэл — демо өгөгдөл';
      await q(`INSERT INTO qual_answer(submission_id, question_id, value_text, value_number, value_bool) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT DO NOTHING`, [sub.id, qq.id, vals.value_text, vals.value_number, vals.value_bool]);
    }
    return sub.id;
  }
  await mkQual(org1, 'approved', { risk: 20, comment: 'Бүх шалгуур хангасан.' });
  await mkQual(org2, 'approved', { risk: 35, comment: 'Батлагдсан.' });
  await mkQual(org3, 'submitted');
  await mkQual(org5, 'needs_improvement', { risk: 60, comment: 'Аудитын тайлан хавсаргана уу. ХАБЭА бодлогын нотолгоо дутуу.' });
  await mkQual(org6, 'approved', { risk: 30, comment: 'Approved.' });

  // ---------- tenders ----------
  const typeRow = async (code: string) => (await q1('SELECT id FROM tender_type WHERE code=$1', [code]))!.id;
  const catId = async (code: string) => (await q1('SELECT id FROM ref_category WHERE code=$1', [code]))?.id;

  // 1) Open EOI
  const eoi = (await q(
    `INSERT INTO tender(tender_no, type_id, title_mn, title_en, description_mn, description_en, department, category_id, buyer_id, end_user_id,
       status, publish_at, close_at, currency_policy, is_public, email_subject, email_body, created_by, published_version)
     VALUES ('EOI-2026-00001',$1,'Кэмпийн хоол үйлдвэрлэлийн үйлчилгээ — сонирхол илэрхийлэх',
       'Camp catering services — Expression of Interest',
       'Оюу Толгойн кэмпийн хоол үйлдвэрлэлийн үйлчилгээ үзүүлэх сонирхолтой байгууллагуудыг урьж байна. Туршлага, хүчин чадал, ХАБЭА үзүүлэлтээ ирүүлнэ үү.',
       'Interested caterers are invited to express interest for OT camp catering.',
       'Site Services',$2,$3,$4,'published', now() - interval '5 days', now() + interval '10 days','any', true,
       'OASIS: EOI урилга — Кэмпийн хоол үйлдвэрлэл','Танай байгууллагыг EOI-д оролцохыг урьж байна.',$3,1) RETURNING id`,
    [await typeRow('EOI'), await catId('SECT-04'), uid['buyer@oasis.mn'], uid['enduser@oasis.mn']]))[0];
  await q(`INSERT INTO tender_requirement(tender_id, line_no, label_mn, label_en, required, attachment_required) VALUES
    ($1,1,'Байгууллагын танилцуулга','Company profile', true, true),
    ($1,2,'Ижил төстэй ажлын туршлага (сүүлийн 3 жил)','Similar experience (last 3 years)', true, true),
    ($1,3,'Хоол үйлдвэрлэлийн тусгай зөвшөөрөл','Catering license', true, true),
    ($1,4,'ХАБЭА статистик','HSE statistics', false, false)`, [eoi.id]);
  for (const oid of [org1, org2, org3, org4, org5]) {
    await q(`INSERT INTO tender_invitation(tender_id, organization_id, status, sent_at) VALUES ($1,$2,'sent', now() - interval '5 days')`, [eoi.id, oid]);
  }

  // 2) Open RFQ with items (supplier can bid now)
  const rfq = (await q(
    `INSERT INTO tender(tender_no, type_id, title_mn, title_en, description_mn, department, category_id, buyer_id, end_user_id,
       status, publish_at, close_at, currency_policy, partial_allowed, alternative_allowed, qualification_required,
       email_subject, email_body, created_by, published_version)
     VALUES ('RFQ-2026-00002',$1,'Конвейерийн сэлбэг хэрэгсэл нийлүүлэх','Conveyor spare parts supply',
       'Баяжуулах үйлдвэрийн конвейерийн сэлбэг хэрэгслийг техникийн үзүүлэлтийн дагуу нийлүүлэх.',
       'Concentrator',$2,$3,$4,'published', now() - interval '3 days', now() + interval '7 days','any', true, true, true,
       'OASIS: RFQ урилга — Конвейерийн сэлбэг','Үнийн санал ирүүлнэ үү.',$3,1) RETURNING id`,
    [await typeRow('RFQ'), await catId('SECT-02'), uid['buyer@oasis.mn'], uid['enduser@oasis.mn']]))[0];
  await q(`INSERT INTO tender_item(tender_id, line_no, pr_no, material_no, description, quantity, uom, manufacturer, part_no, datasheet_required, license_required) VALUES
    ($1,1,'PR-778001','MAT-30122','Conveyor belt roller 133mm x 465mm', 120,'EA','Sandvik','RL-133-465', true, false),
    ($1,2,'PR-778001','MAT-30123','Idler frame 3-roll 1200mm', 40,'SET','Sandvik','IF-1200-3R', true, false),
    ($1,3,'PR-778002','MAT-30500','Bearing 22220 EK spherical roller', 200,'EA','SKF','22220-EK', false, false),
    ($1,4,'PR-778002','MAT-30501','Adapter sleeve H320', 200,'EA','SKF','H320', false, false),
    ($1,5,'PR-778003','MAT-31002','Gearbox oil ISO VG220', 800,'L','Mobil','VG220', false, true)`, [rfq.id]);
  for (const oid of [org1, org3, org5, org6]) {
    await q(`INSERT INTO tender_invitation(tender_id, organization_id, status, sent_at) VALUES ($1,$2,'sent', now() - interval '3 days')`, [rfq.id, oid]);
  }

  // 3) RFQ in evaluation with 3 bids
  const rfq2 = (await q(
    `INSERT INTO tender(tender_no, type_id, title_mn, title_en, description_mn, department, category_id, buyer_id, end_user_id,
       status, publish_at, close_at, currency_policy, partial_allowed, dd_required, email_subject, created_by, published_version)
     VALUES ('RFQ-2026-00003',$1,'ХАБЭА хамгаалах хэрэгсэл нийлүүлэх','PPE supply',
       'Аюулгүй ажиллагааны хувцас, хамгаалах хэрэгсэл жилийн гэрээгээр нийлүүлэх.',
       'HSE',$2,$3,$4,'in_evaluation', now() - interval '20 days', now() - interval '3 days','any', true, true,
       'OASIS: RFQ — ХАБЭА хэрэгсэл',$3,1) RETURNING id`,
    [await typeRow('RFQ'), await catId('SECT-09'), uid['buyer@oasis.mn'], uid['enduser@oasis.mn']]))[0];
  const items2 = await q(
    `INSERT INTO tender_item(tender_id, line_no, pr_no, material_no, description, quantity, uom, datasheet_required) VALUES
     ($1,1,'PR-880001','PPE-1001','Safety helmet with OT logo', 2000,'EA', true),
     ($1,2,'PR-880001','PPE-1002','High-visibility vest class 2', 3500,'EA', false),
     ($1,3,'PR-880002','PPE-1003','Steel toe boots sz 38-46', 1800,'EA', true),
     ($1,4,'PR-880002','PPE-1004','Safety glasses anti-fog', 5000,'EA', false)
     RETURNING id, line_no, quantity`, [rfq2.id]);
  for (const oid of [org1, org3, org5]) {
    await q(`INSERT INTO tender_invitation(tender_id, organization_id, status, sent_at) VALUES ($1,$2,'participated', now() - interval '20 days')`, [rfq2.id, oid]);
  }
  const bidPrices: Record<number, number[]> = {
    [org1]: [48500, 21000, 185000, 8900],
    [org3]: [45200, 19500, 179000, 9400],
    [org5]: [51000, 22500, 191000, 8100],
  };
  const supUid: Record<number, number> = { [org1]: uid['supplier@test.mn'], [org3]: uid['ot@test.mn'], [org5]: uid['erdenes@test.mn'] };
  for (const oid of [org1, org3, org5]) {
    const resp = (await q(
      `INSERT INTO bid_response(tender_id, organization_id, status, current_revision, submitted_at, validity_days)
       VALUES ($1,$2,'evaluated',1, now() - interval '5 days', 60) RETURNING id`, [rfq2.id, oid]))[0];
    const rev = (await q(`INSERT INTO bid_revision(response_id, revision_no, submitted_by) VALUES ($1,1,$2) RETURNING id`,
      [resp.id, supUid[oid]]))[0];
    items2.forEach(async (it: any, idx: number) => {
      const price = bidPrices[oid][idx];
      await q(
        `INSERT INTO bid_item_quote(revision_id, tender_item_id, currency, unit_price, quantity, total_price, lead_time_value, incoterm, manufacturer)
         VALUES ($1,$2,'MNT',$3,$4,$5,$6,'DAP','Generic PPE Co')`,
        [rev.id, it.id, price, Number(it.quantity), price * Number(it.quantity), 30 + idx * 5]);
    });
    // consent record for demo suppliers
    await q(`INSERT INTO consent(user_id, consent_type, ref_id) VALUES ($1,'tender_disclaimer',$2)`, [supUid[oid], rfq2.id]);
  }

  // 4) Awarded tender (history)
  const rfq3 = (await q(
    `INSERT INTO tender(tender_no, type_id, title_mn, title_en, description_mn, department, buyer_id, end_user_id, status,
       publish_at, close_at, email_subject, created_by, published_version)
     VALUES ('RFQ-2026-00004',$1,'Тээврийн үйлчилгээ — УБ-ОТ чиглэл','Freight UB-OT route',
       'Улаанбаатар — Оюу Толгой чиглэлийн ачаа тээврийн үйлчилгээ.',
       'Logistics',$2,$3,'awarded', now() - interval '60 days', now() - interval '30 days','OASIS: Freight RFQ',$2,1) RETURNING id`,
    [await typeRow('FREIGHT'), uid['buyer2@oasis.mn'], uid['enduser@oasis.mn']]))[0];
  const fItem = (await q(
    `INSERT INTO tender_item(tender_id, line_no, description, quantity, uom) VALUES ($1,1,'Truck freight UB-OT (per trip, 20t)', 100,'EA') RETURNING id`,
    [rfq3.id]))[0];
  for (const [oid, price, st] of [[org2, 2850000, 'awarded'], [org5, 3100000, 'regret']] as any[]) {
    await q(`INSERT INTO tender_invitation(tender_id, organization_id, status, sent_at) VALUES ($1,$2,'participated', now() - interval '60 days')`, [rfq3.id, oid]);
    const resp = (await q(`INSERT INTO bid_response(tender_id, organization_id, status, current_revision, submitted_at)
      VALUES ($1,$2,$3,1, now() - interval '35 days') RETURNING id`, [rfq3.id, oid, st]))[0];
    const rev = (await q(`INSERT INTO bid_revision(response_id, revision_no) VALUES ($1,1) RETURNING id`, [resp.id]))[0];
    await q(`INSERT INTO bid_item_quote(revision_id, tender_item_id, currency, unit_price, quantity, total_price, lead_time_value)
             VALUES ($1,$2,'MNT',$3,100,$4,7)`, [rev.id, fItem.id, price, price * 100]);
  }
  const ev3 = (await q(
    `INSERT INTO evaluation(tender_id, etype, evaluator_id, status, recommendation, submitted_at)
     VALUES ($1,'buyer',$2,'submitted','Говь Логистик ХХК хамгийн сайн үнэ, туршлагатай тул санал болгож байна. Үнэ 2,850,000₮/рейс нь зах зээлийн дунджаас 8% хямд.', now() - interval '28 days') RETURNING id`,
    [rfq3.id, uid['buyer2@oasis.mn']]))[0];
  const q2row = await q1(`SELECT bq.id, bq.total_price FROM bid_item_quote bq JOIN bid_revision br ON br.id=bq.revision_id JOIN bid_response r ON r.id=br.response_id WHERE r.tender_id=$1 AND r.organization_id=$2`, [rfq3.id, org2]);
  await q(`INSERT INTO item_selection(evaluation_id, tender_item_id, organization_id, quote_id, selected_qty, amount, currency, justification)
           VALUES ($1,$2,$3,$4,100,$5,'MNT','Хамгийн сайн нэгж үнэ, DIFOT 96%')`,
    [ev3.id, fItem.id, org2, q2row.id, Number(q2row.total_price)]);
  const award3 = (await q(
    `INSERT INTO award(tender_id, version_no, status, total_amount, currency, issued_by, issued_at, letter_text)
     VALUES ($1,1,'issued',285000000,'MNT',$2, now() - interval '25 days','OASIS AWARD LETTER — RFQ-2026-00004') RETURNING id`,
    [rfq3.id, uid['buyer2@oasis.mn']]))[0];
  await q(`INSERT INTO award_allocation(award_id, tender_item_id, organization_id, quote_id, quantity, amount, currency)
           VALUES ($1,$2,$3,$4,100,285000000,'MNT')`, [award3.id, fItem.id, org2, q2row.id]);
  await q(`INSERT INTO regret_notice(award_id, organization_id, body) VALUES ($1,$2,'Regret letter — RFQ-2026-00004')`, [award3.id, org5]);

  // 5) Live reverse auction
  const auc = (await q(
    `INSERT INTO tender(tender_no, type_id, title_mn, title_en, description_mn, department, buyer_id, status,
       publish_at, close_at, email_subject, created_by, published_version)
     VALUES ('AUC-2026-00005',$1,'Дизель түлш нийлүүлэх — урвуу дуудлага худалдаа','Diesel supply — reverse auction',
       'АИ дизель түлш 500,000 литр нийлүүлэх урвуу дуудлага худалдаа. Хамгийн бага үнийн санал шалгарна.',
       'Energy',$2,'published', now() - interval '1 day', now() + interval '2 days','OASIS: Reverse auction',$2,1) RETURNING id`,
    [await typeRow('AUCTION'), uid['buyer@oasis.mn']]))[0];
  const aucRow = (await q(
    `INSERT INTO auction(tender_id, start_price, currency, min_decrement, starts_at, ends_at, extension_minutes, status)
     VALUES ($1, 1450000000,'MNT', 5000000, now() - interval '2 hours', now() + interval '2 days', 5,'live') RETURNING id`, [auc.id]))[0];
  for (const oid of [org1, org2, org5, org6]) {
    await q(`INSERT INTO tender_invitation(tender_id, organization_id, status, sent_at) VALUES ($1,$2,'sent', now() - interval '1 day')`, [auc.id, oid]);
  }
  await q(`INSERT INTO auction_bid(auction_id, organization_id, amount, placed_at) VALUES
    ($1,$2,1445000000, now() - interval '100 minutes'),
    ($1,$3,1438000000, now() - interval '80 minutes'),
    ($1,$2,1430000000, now() - interval '40 minutes')`, [aucRow.id, org2, org5]);

  // 6) Draft tender for wizard demo
  await q(
    `INSERT INTO tender(tender_no, type_id, title_mn, description_mn, department, buyer_id, status, created_by)
     VALUES ('RFQ-2026-00006',$1,'Оффисын тавилга нийлүүлэх (ноорог)','Даланзадгад оффисын тавилга.','Admin',$2,'draft',$2)`,
    [await typeRow('RFQ'), uid['buyer@oasis.mn']]);

  // ---------- DD case + COI ----------
  await q(`INSERT INTO dd_case(organization_id, source, risk_tier, status, decision, decision_reason, analyst_id, decided_at, expires_on)
           VALUES ($1,'award','medium','decided','cleared','Эрсдэл илрээгүй. Эцсийн өмчлөгч тодорхой.',$2, now() - interval '10 days','2027-06-30')`,
    [org1, uid['dd@oasis.mn']]);
  await q(`INSERT INTO dd_case(organization_id, source, risk_tier, status, analyst_id)
           VALUES ($1,'tender','high','screening',$2)`, [org5, uid['dd@oasis.mn']]);
  await q(`INSERT INTO coi_declaration(user_id, tender_id, has_conflict, status) VALUES ($1,$2,false,'cleared')`,
    [uid['enduser@oasis.mn'], rfq2.id]);

  // ---------- scores ----------
  for (const [oid, rows] of [
    [org1, [['2025-Q3', 92, 88], ['2025-Q4', 94, 90], ['2026-Q1', 91, 93], ['2026-Q2', 96, 95]]],
    [org2, [['2025-Q4', 88, 85], ['2026-Q1', 90, 87], ['2026-Q2', 96, 92]]],
    [org5, [['2026-Q1', 78, 80], ['2026-Q2', 83, 84]]],
  ] as any[]) {
    for (const [period, difot, qs] of rows) {
      await q(`INSERT INTO supplier_score(organization_id, period, difot, quality_score, overall, created_by)
               VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [oid, period, difot, qs, (difot + qs) / 2, uid['buyer@oasis.mn']]);
    }
  }

  // ---------- support articles (AI assistant KB) ----------
  const articles = [
    ['registration', 'Хэрхэн бүртгүүлэх вэ?', 'How to register?',
      'OASIS системд бүртгүүлэхдээ: 1) Нүүр хуудасны "Бүртгүүлэх" товч дарна. 2) Имэйл хаягаа оруулж баталгаажуулах код авна. 3) Нууц үгээ үүсгэнэ (том, жижиг үсэг, тоо орсон 8+ тэмдэгт). 4) Байгууллага/хувь хүн, дотоод/гадаад сонголтоо хийнэ. 5) Дотоодын компани бол регистрийн дугаараар ХУР системээс мэдээлэл автоматаар татагдана. 6) Профайлаа бөглөж илгээснээр Compliance баг хянан баталгаажуулна.',
      'To register: click Register, verify your email with the code, create a strong password (8+ chars with upper/lower/digit), choose company/individual and national/international, national companies are verified against the state registry (KHUR), then complete and submit your profile for compliance review.'],
    ['registration', 'ХУР баталгаажуулалт амжилтгүй боллоо', 'KHUR verification failed',
      'Регистрийн дугаар ХУР системд олдохгүй бол: регистрийн дугаараа дахин шалгана уу; байгууллагын шинэчилсэн бүртгэлтэй эсэхээ Улсын бүртгэлийн газраас лавлана уу; асуудал хэвээр бол дэмжлэгийн тасалбар үүсгэвэл манай баг гар аргаар баталгаажуулна.',
      'If your registry number is not found in KHUR: double-check the number; confirm your state registration is current; if the issue persists create a support ticket and our team will verify manually.'],
    ['tender', 'Тендерт хэрхэн оролцох вэ?', 'How to participate in a tender?',
      'Тендерт оролцохдоо: 1) Тендер цэснээс нээлттэй урилгуудаа харна. 2) Дэлгэрэнгүйг нээж disclaimer-г зөвшөөрнө. 3) EOI бол шаардлага бүрт хариу, хавсралт оруулна. RFQ бол мөр бүрт үнэ, валют, хугацаагаа бөглөнө. 4) Excel загвар татаж бөглөөд импортлох боломжтой. 5) "Шалгах" товчоор алдаагаа харж, "Илгээх" товчоор баталгаажуулна. Илгээсэн санал өөрчлөгдөхгүй, шинэ хувилбар үүсгэж дахин илгээж болно.',
      'Open the tender list, view details and accept the disclaimer, fill answers/prices (or import the Excel template), validate, then submit. Submitted revisions are immutable; resubmitting creates a new revision.'],
    ['tender', 'Datasheet шаардлагатай гэсэн алдаа гарч байна', 'Datasheet required error',
      'Тухайн бараанд үйлдвэрлэгчийн datasheet заавал хавсаргах шаардлагатай. Мөрийн хавсралт хэсэгт PDF файл оруулсны дараа илгээх боломжтой болно. Datasheet-гүй саналыг систем хүлээн авахгүй.',
      'That line item requires a manufacturer datasheet. Attach a PDF on the line, then submit. Bids without required datasheets are rejected by the server.'],
    ['qualification', 'Урьдчилсан үнэлгээ гэж юу вэ?', 'What is pre-qualification?',
      'Урьдчилсан үнэлгээ нь Санхүү, Ёс зүй/Хүний нөөц, Байгаль орчин, ХАБЭА гэсэн 4 бүлэг асуулгаас бүрдэнэ. Заавал асуултуудад бүрэн хариулж, нотлох баримт хавсаргаж илгээнэ. Батлагдсан үнэлгээ 1 жил хүчинтэй бөгөөд зарим тендерт заавал шаардагдана.',
      'Pre-qualification covers Finance, Ethics/HR, Environment and HSE. Answer all required questions with evidence. Approval is valid for one year and required for certain tenders.'],
    ['account', 'Нууц үгээ мартсан', 'Forgot password',
      'Нэвтрэх хуудасны "Нууц үг мартсан" холбоосоор имэйлээ оруулбал сэргээх код илгээгдэнэ. Кодоо ашиглан шинэ нууц үг үүсгэнэ. 5 удаа буруу оролдвол түгжигдэх тул дэмжлэгт хандана уу.',
      'Use "Forgot password" on the login page; a reset code is emailed. After 5 failed logins the account locks — contact support to unlock.'],
    ['account', 'Хоёр шатлалт баталгаажуулалт (2FA)', 'Two-factor authentication (2FA)',
      'Тохиргоо хэсгээс 2FA идэвхжүүлбэл нэвтрэх бүрт имэйлээр нэг удаагийн код ирнэ. Аюулгүй байдлын үүднээс идэвхжүүлэхийг зөвлөж байна.',
      'Enable 2FA in settings; a one-time code is emailed at each login. Strongly recommended.'],
    ['tender', 'Урвуу дуудлага худалдаа (Reverse auction)', 'Reverse auction',
      'Урвуу дуудлага худалдаанд оролцогчид үнээ бууруулж өрсөлдөнө. Таны санал өмнөх хамгийн бага үнээс дор хаяж min decrement хэмжээгээр бага байх ёстой. Дуусахаас өмнөх минутуудад санал орвол хугацаа автоматаар сунгагдана. Хамгийн бага үнэтэй оролцогч шалгарна.',
      'Bidders compete by lowering price; each bid must undercut the current best by at least the minimum decrement. Late bids auto-extend the auction. Lowest bid wins.'],
  ];
  for (const [cat, tmn, ten, bmn, ben] of articles) {
    await q(`INSERT INTO support_article(category, title_mn, title_en, body_mn, body_en) VALUES ($1,$2,$3,$4,$5)`,
      [cat, tmn, ten, bmn, ben]);
  }

  // ---------- notification templates ----------
  const templates = [
    ['registration_verify', 'Бүртгэл баталгаажуулах', 'Verify registration', 'Баталгаажуулах код: {{code}}', 'Verification code: {{code}}'],
    ['tender_invitation', 'Тендерийн урилга', 'Tender invitation', '{{tender_no}} — {{title}}. Хаагдах: {{close_at}}', '{{tender_no}} — {{title}}. Closes: {{close_at}}'],
    ['deadline_changed', 'Хугацаа өөрчлөгдлөө', 'Deadline changed', '{{tender_no}}: шинэ хугацаа {{new_date}}. Шалтгаан: {{reason}}', '{{tender_no}}: new deadline {{new_date}}. Reason: {{reason}}'],
    ['award_notice', 'Award мэдэгдэл', 'Award notice', 'Баяр хүргэе! {{tender_no}} тендерт шалгарлаа.', 'Congratulations! You won {{tender_no}}.'],
    ['regret_notice', 'Тендерийн үр дүн', 'Tender result', '{{tender_no}}: энэ удаад шалгараагүй.', '{{tender_no}}: not successful this time.'],
    ['approval_task', 'Зөвшөөрлийн ажил', 'Approval task', '{{entity}}: таны шийдвэр хүлээгдэж байна.', '{{entity}}: your decision is pending.'],
  ];
  for (const [code, smn, sen, bmn, ben] of templates) {
    await q(`INSERT INTO notification_template(code, subject_mn, subject_en, body_mn, body_en) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [code, smn, sen, bmn, ben]);
  }

  // ---------- survey ----------
  await q(
    `INSERT INTO survey(title_mn, title_en, anonymous, status, questions_json, created_by) VALUES
     ('Нийлүүлэгчийн сэтгэл ханамжийн судалгаа 2026','Supplier satisfaction survey 2026', true,'open',
      $1,$2)`,
    [JSON.stringify([
      { id: 'q1', type: 'rating', label_mn: 'OASIS системийн хэрэглээний хялбар байдал (1-5)', label_en: 'Ease of use of OASIS (1-5)' },
      { id: 'q2', type: 'rating', label_mn: 'Тендерийн мэдээллийн тодорхой байдал (1-5)', label_en: 'Clarity of tender information (1-5)' },
      { id: 'q3', type: 'text', label_mn: 'Сайжруулах санал', label_en: 'Improvement suggestions' },
    ]), uid['admin@oasis.mn']]);

  // ---------- support ticket demo ----------
  await q(
    `INSERT INTO support_ticket(ticket_no, user_id, organization_id, subject, body, severity, status, sla_due_at, assignee_id)
     VALUES ('TCK-2026-00001',$1,$2,'Хавсралт нээгдэхгүй байна','RFQ-2026-00002 тендерийн хавсралт татахад алдаа гарч байна.',2,'in_progress', now() + interval '4 hours',$3)`,
    [uid['supplier@test.mn'], org1, uid['support@oasis.mn']]);

  // ---------- catalogue demo ----------
  await q(`INSERT INTO catalogue_item(organization_id, name, manufacturer, part_no, origin_country, description, unit_price, currency, uom) VALUES
    ($1,'Conveyor roller 133mm','Sandvik','RL-133-465','SE','Standard trough roller', 47500,'MNT','EA'),
    ($1,'Spherical bearing 22220','SKF','22220-EK','SE','C3 clearance', 182000,'MNT','EA'),
    ($2,'20t truck freight UB-OT','—','FRT-UB-OT','MN','Per trip incl. fuel', 2850000,'MNT','EA')`, [org1, org2]);

  // ---------- welcome notifications ----------
  for (const email of ['supplier@test.mn', 'gobi@test.mn', 'ot@test.mn']) {
    await q(`INSERT INTO notification(user_id, ntype, title_mn, title_en, body_mn, body_en) VALUES
      ($1,'system','OASIS v2 системд тавтай морил','Welcome to OASIS v2','Шинэчлэгдсэн системийн танилцуулгыг Support Hub-аас үзнэ үү.','See the Support Hub for what is new.')`,
      [uid[email]]);
  }

  // ---------- integration configs (spec section 12) ----------
  await q(`INSERT INTO integration_config(code, name_mn, name_en, category, enabled, endpoint, username, sync_interval_min, extra_json) VALUES
    ('KHUR','ХУР систем (байгууллага)','KHUR state registry','government', true,'https://xyp.gov.mn/api/company','oasis_service', null,'{"consent_required":true,"fields":["registry_no","name","legal_form","director"]}'),
    ('DAN','ДАН нэвтрэлт','DAN authentication','government', false,'https://sso.gov.mn/oauth','', null,'{"scopes":["citizen_basic"]}'),
    ('SAP_PNOW','SAP / ProcurementNow','SAP / PNow','erp', true,'https://sap.ot.mn/api/pr','oasis_int', 60,'{"inbound":["PR","material","vendor"],"outbound":["award_summary"],"replay_protection":true}'),
    ('MSSQL_SYNC','Гуравдагч MSSQL sync','Third-party MSSQL sync','data', false,'mssql://sync.ot.mn:1433/oasis_mirror','sync_user', 240,'{"tables":["supplier","tender","award"]}'),
    ('SMTP','Имэйл (SMTP)','Email SMTP','messaging', true,'smtp://mail.ot.mn:587','noreply@oasis.ot.mn', null,'{"from":"noreply@oasis.ot.mn","retry":3}'),
    ('SMS','SMS gateway','SMS gateway','messaging', false,'https://sms.mobicom.mn/api','', null,'{}'),
    ('ANTHROPIC','Claude AI (тайлан, туслах)','Claude AI','ai', true,'https://api.anthropic.com','', null,'{"model":"claude-sonnet-4-5","features":["report_summary","hub_assistant"]}')
    ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO integration_log(code, direction, action, status, detail, duration_ms) VALUES
    ('KHUR','out','company_lookup','success','registry 5029342 → Монгол Машин Механизм ХХК', 320),
    ('KHUR','out','company_lookup','success','registry 2887101 → Говь Логистик ХХК', 298),
    ('SAP_PNOW','in','pr_import','success','PR-778001..PR-880002: 9 мөр татагдлаа', 1240),
    ('SMTP','out','send_email','success','tender invitation batch: 5 имэйл', 890),
    ('SAP_PNOW','out','award_summary','success','RFQ-2026-00004 award → SAP', 640),
    ('KHUR','out','company_lookup','failure','registry 9999999: ХУР-д олдсонгүй', 305)`);

  await q(`INSERT INTO audit_event(actor_name, action, entity_type, entity_id, after_summary)
           VALUES ('system','seed_completed','system','0','Demo data seeded')`);
}
