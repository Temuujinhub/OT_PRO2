# OASIS v2 — Oyu Advanced Supplier Integrated System (vNext)

Шинэчлэгдсэн OASIS систем — нийлүүлэгчийн бүртгэл, урьдчилсан үнэлгээ, тендер (EOI/RFQ/Auction),
үнийн санал, үнэлгээ, олон шатлалт зөвшөөрөл, award, DD/COI, мессеж, тайлан, AI туслах.

Гэрээ **CW2182142** ба **OASIS vNext SRS v1.0** (2026-08-31) баримт бичгийн дагуу бүтээв.
Гэрээний нэмэлт (Table C5) модулиуд: **Supplier Hub (AI туслахтай), Reverse Auction,
Due Diligence & COI, Report AI, Translation, Design upgrade** — бүгд хэрэгжсэн.

## Архитектур

| Хэсэг | Технологи |
|---|---|
| Backend API | Node.js 22 + Express + TypeScript (`/api/v1`, JWT auth, RBAC) |
| Database | PostgreSQL 16 (money `numeric(19,4)`, append-only audit, immutable bid revisions) |
| Frontend | React 18 + TypeScript + Vite (MN/EN хоёл хэл, OT design system) |
| AI | Anthropic Claude (Report summary + Supplier Hub assistant, ANTHROPIC_API_KEY) |
| Deploy | Docker Compose (db + api + nginx web), GitHub Actions → droplet |

> Тэмдэглэл: SRS-д .NET/MSSQL чиглэл заасан боловч тест орчны хязгаарлалтаас шалтгаалан
> ижил архитектурын зарчмуудыг (modular monolith, typed import, outbox-style notification,
> versioned workflow, append-only audit) Node/PostgreSQL дээр хэрэгжүүлэв. Azure App Service /
> Container Apps дээр шууд ажиллана; Azure SQL руу шилжих бол data layer-ийг солиход бэлэн.

## Ажиллуулах

```bash
docker compose up -d --build
# эсвэл хөгжүүлэлтийн орчинд:
cd backend && npm i && npm run dev     # API :4000 (postgres шаардана)
cd frontend && npm i && npm run dev    # UI  :5173 (proxy /api → :4000)
```

Анхны ачаалалтаар өгөгдлийн сан автоматаар үүсч, демо өгөгдөл suulгагдана.

## Демо хэрэглэгчид (нууц үг: `Oasis@2026`)

| Имэйл | Дүр |
|---|---|
| supplier@test.mn | Нийлүүлэгч (Монгол Машин Механизм ХХК, batlagdsan) |
| gobi@test.mn, ot@test.mn, erdenes@test.mn, global@test.mn | Бусад нийлүүлэгчид |
| khangai@test.mn | Профайл хянагдаж буй нийлүүлэгч |
| admin@oasis.mn | System Admin |
| buyer@oasis.mn, buyer2@oasis.mn | Procurement Buyer |
| enduser@oasis.mn | End User / Reviewer |
| compliance@oasis.mn | Compliance reviewer |
| screening@oasis.mn | Qualification analyst |
| dd@oasis.mn | DD/COI analyst |
| approver@oasis.mn, approver2@oasis.mn, approver3@oasis.mn | Олон шатлалт DFA батлагчид |
| support@oasis.mn | Support agent |

ХУР демо регистрүүд: `3341190`, `1112223`, `7208856` (шинэ бүртгэлд туршина).

## Гол хяналтууд (SRS DEF-01..20-ийн хариу)

- Валют/дүн: exchange-rate snapshot + reporting currency хөрвүүлэлт (DEF-01)
- Typed Excel import, мөр бүрийн алдааны тайлан, manufacturer text coercion (DEF-02)
- Datasheet/license шаардлагыг сервер талд шалгаж submit блоклоно (DEF-03)
- Clarification thread + хавсралт, дотоод тэмдэглэл нийлүүлэгчид үл харагдана (DEF-04)
- Хугацааны өөрчлөлт мэдэгдэлгүйгээр commit болохгүй (DEF-08)
- Original/negotiated үнийн түүх immutable revision-ээр (DEF-09)
- Negotiation-д үнэ өсгөх default блоктой, exception нь scope шалтгаан шаардана (DEF-10)
- Award cancel/re-award: dual approval + анхны award immutable (DEF-11)
- Зөвлөмж хоосон бол submit болохгүй (DEF-13)
- Одоогийн батлагч жагсаалт бүрт харагдана (DEF-07), SoD: өөрийн хүсэлтээ батлахгүй
- Append-only audit, файлын checksum + orphan илрүүлэлт (DEF-05), .exe блок, хэмжээний бодлого

## Deploy (тест сервер)

GitHub Actions (`.github/workflows/deploy.yml`) нь `main` руу push хийгдмэгц
droplet руу SSH-ээр орж `docker compose up -d --build` ажиллуулна.
Шаардлагатай secrets: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_PASSWORD`,
`JWT_SECRET`, `DB_PASSWORD`, `ANTHROPIC_API_KEY`.

## Тест

- `e2e` API тест: бүртгэл → профайл → үнэлгээ → тендер → санал → тохиролцоо → үнэлгээ → зөвшөөрөл → award → cancel/re-award → auction → тайлан (70+ шалгалт)
- Playwright UI тест: нэвтрэлт, бүх үндсэн хуудас, bid editor, comparison grid, wizard (29 шалгалт)
