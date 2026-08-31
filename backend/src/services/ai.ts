/**
 * AI service — Report AI summary + Supplier Hub assistant (Table C5 items 4 & 1).
 * If ANTHROPIC_API_KEY is set, calls Claude (claude-sonnet-4-5). Otherwise a
 * deterministic rule-based fallback keeps every feature fully functional.
 */
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

async function callClaude(system: string, user: string): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data?.content?.[0]?.text || null;
  } catch {
    return null;
  }
}

export async function reportSummary(reportName: string, lang: string, rows: any[]): Promise<{ text: string; source: 'claude' | 'builtin' }> {
  const sample = JSON.stringify(rows.slice(0, 50));
  const ai = await callClaude(
    `You are the OASIS v2 procurement analytics assistant for Oyu Tolgoi. Summarize report data concisely in ${lang === 'mn' ? 'Mongolian' : 'English'}. Give 3-5 key findings and 1-2 recommendations. Use plain text with short paragraphs.`,
    `Report: ${reportName}\nRows (JSON): ${sample}`
  );
  if (ai) return { text: ai, source: 'claude' };
  // Built-in analytical fallback
  const n = rows.length;
  const cols = n ? Object.keys(rows[0]) : [];
  const numericCols = cols.filter(c => rows.some(r => typeof r[c] === 'number' || (!isNaN(Number(r[c])) && r[c] !== null && r[c] !== '')));
  const stats: string[] = [];
  for (const c of numericCols.slice(0, 4)) {
    const vals = rows.map(r => Number(r[c])).filter(v => isFinite(v));
    if (!vals.length) continue;
    const sum = vals.reduce((a, b) => a + b, 0);
    stats.push(lang === 'mn'
      ? `• «${c}» нийт: ${sum.toLocaleString()} (дундаж ${(sum / vals.length).toLocaleString(undefined, { maximumFractionDigits: 1 })}, макс ${Math.max(...vals).toLocaleString()})`
      : `• "${c}" total: ${sum.toLocaleString()} (avg ${(sum / vals.length).toLocaleString(undefined, { maximumFractionDigits: 1 })}, max ${Math.max(...vals).toLocaleString()})`);
  }
  const statusCol = cols.find(c => /status|төлөв/i.test(c));
  if (statusCol) {
    const byStatus: Record<string, number> = {};
    rows.forEach(r => { const s = String(r[statusCol] ?? '—'); byStatus[s] = (byStatus[s] || 0) + 1; });
    const top = Object.entries(byStatus).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `${k}: ${v}`).join(', ');
    stats.push(lang === 'mn' ? `• Төлөвийн задаргаа — ${top}` : `• Status breakdown — ${top}`);
  }
  const text = lang === 'mn'
    ? `«${reportName}» тайлангийн хураангуй (нийт ${n} мөр):\n${stats.join('\n')}\n\nЗөвлөмж: Гол үзүүлэлтүүдийн өөрчлөлтийг өмнөх үетэй харьцуулан хянаж, хазайлттай бичлэгүүдийг шүүлтүүрээр нарийвчлан шалгана уу. (ANTHROPIC_API_KEY тохируулбал Claude AI дэлгэрэнгүй дүгнэлт гаргана.)`
    : `Summary of "${reportName}" (${n} rows):\n${stats.join('\n')}\n\nRecommendation: compare key indicators against the previous period and drill into outliers using filters. (Set ANTHROPIC_API_KEY to enable full Claude AI analysis.)`;
  return { text, source: 'builtin' };
}

export async function hubAssistant(question: string, lang: string, articles: { title: string; body: string }[]): Promise<{ text: string; source: 'claude' | 'builtin' }> {
  const kb = articles.map(a => `## ${a.title}\n${a.body}`).join('\n\n').slice(0, 12000);
  const ai = await callClaude(
    `You are the OASIS v2 Supplier Hub assistant for Oyu Tolgoi suppliers. Answer in ${lang === 'mn' ? 'Mongolian' : 'English'}, briefly and helpfully, based on this knowledge base:\n${kb}\nIf the answer is not in the knowledge base, advise creating a support ticket.`,
    question
  );
  if (ai) return { text: ai, source: 'claude' };
  // keyword match fallback
  const qwords = question.toLowerCase().split(/[^a-zа-яөүё0-9]+/i).filter(w => w.length > 2);
  let best: any = null; let bestScore = 0;
  for (const a of articles) {
    const t = (a.title + ' ' + a.body).toLowerCase();
    const score = qwords.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { best = a; bestScore = score; }
  }
  if (best && bestScore > 0) {
    const text = lang === 'mn'
      ? `Таны асуултад хамгийн ойр гарын авлага: «${best.title}»\n\n${best.body.slice(0, 600)}\n\nДэлгэрэнгүй мэдээлэл Support Hub дотор бий. Хэрэв асуудал шийдэгдэхгүй бол тасалбар (ticket) үүсгэнэ үү.`
      : `Closest guide to your question: "${best.title}"\n\n${best.body.slice(0, 600)}\n\nSee the Support Hub for more. If this doesn't resolve your issue, please create a ticket.`;
    return { text, source: 'builtin' };
  }
  return {
    text: lang === 'mn'
      ? 'Уучлаарай, энэ асуултад тохирох гарын авлага олдсонгүй. Дэмжлэгийн тасалбар үүсгэвэл манай баг 2 цагийн дотор (Severity 1) хариулна.'
      : "Sorry, no matching guide was found. Please create a support ticket — our team responds within the contractual SLA.",
    source: 'builtin',
  };
}
