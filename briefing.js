const https = require('https');
const { buildFeed, clearCache } = require('./feed');

const MEDIA_KEYWORDS = [
  'media', 'journalism', 'journalist', 'newspaper', 'magazine', 'publisher',
  'newsletter', 'substack', 'newsroom', 'broadcast', 'reporter', 'editor',
  'new york times', 'washington post', 'wall street journal', 'the atlantic',
  'new yorker', 'wired', 'axios', 'semafor', 'politico', 'cable news',
  'fox news', 'cnn', 'msnbc', 'nbc news', 'abc news', 'cbs news', 'npr',
  'buzzfeed', 'vice', 'huffpost', 'media company', 'news outlet', 'podcast',
  'layoffs', 'paywall', 'subscription news', 'press freedom',
];

const SOCIAL_KEYWORDS = [
  'twitter', 'x.com', 'elon musk', 'facebook', 'meta', 'instagram',
  'tiktok', 'threads', 'youtube', 'social media', 'platform', 'algorithm',
  'content moderation', 'viral', 'bluesky', 'mastodon', 'reddit',
  'snapchat', 'linkedin', 'big tech', 'mark zuckerberg', 'bytedance',
  'social network', 'influencer', 'creator economy',
];

const TZ = process.env.BRIEFING_TIMEZONE || 'America/New_York';

function categorize(article) {
  const text = (article.title + ' ' + article.publication + ' ' + article.author).toLowerCase();
  if (SOCIAL_KEYWORDS.some(kw => text.includes(kw))) return 'social';
  if (MEDIA_KEYWORDS.some(kw => text.includes(kw))) return 'media';
  return 'politics';
}

function formatDateLong(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ,
  });
}

function formatDateShort(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ,
  });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SECTIONS = [
  { key: 'social', label: 'Social Media & Platforms' },
  { key: 'media', label: 'Media Industry' },
  { key: 'politics', label: 'Politics & Policy' },
];

function buildEmailHTML(categorized, dateStr, total) {
  const sectionsHTML = SECTIONS
    .filter(s => categorized[s.key].length > 0)
    .map(s => {
      const items = categorized[s.key].map(a => `
        <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f4f4f5;">
          <a href="${esc(a.url)}" style="display:block;font-size:15px;font-weight:700;color:#0a0a0a;text-decoration:none;line-height:1.4;margin-bottom:6px;">${esc(a.title)}</a>
          ${a.summary ? `<p style="margin:0 0 8px;font-size:13px;color:#52525b;line-height:1.5;">${esc(a.summary)}</p>` : ''}
          <div style="font-size:12px;color:#a1a1aa;">
            <span>${esc(a.author)}</span><br>
            <span style="font-weight:500;color:#71717a;">${esc(a.publication)}</span><br>
            <span>${formatDateShort(a.date)}</span>
          </div>
        </div>`).join('');

      return `
        <div style="margin-bottom:28px;">
          <h2 style="margin:0 0 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#a1a1aa;padding-bottom:8px;border-bottom:2px solid #f4f4f5;">${s.label}</h2>
          ${items}
        </div>`;
    }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chaotic Era Daily Briefing</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <div style="background:#0a0a0a;padding:28px 32px;border-radius:8px 8px 0 0;">
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.15em;color:#6b7280;margin-bottom:10px;">Chaotic Era</div>
    <h1 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;">Extra Chaotic</h1>
    <p style="margin:0;font-size:13px;color:#9ca3af;">${esc(dateStr)}&nbsp;&middot;&nbsp;${total} ${total === 1 ? 'story' : 'stories'} from the last 24 hours</p>
  </div>

  <div style="background:#ffffff;padding:28px 32px 20px;border-radius:0 0 8px 8px;border:1px solid #e4e4e7;border-top:0;">
    ${sectionsHTML || '<p style="font-size:14px;color:#a1a1aa;margin:0;">No new articles in the past 24 hours.</p>'}
    <div style="padding-top:20px;border-top:1px solid #f4f4f5;">
      <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.7;">
        Delivered by ChaoticFeed for <a href="https://www.chaoticera.news" style="color:#71717a;text-decoration:none;">Chaotic Era</a>.
      </p>
    </div>
  </div>

</div>
</body>
</html>`;
}

function buildPlainText(categorized, dateStr, total) {
  const lines = [
    'EXTRA CHAOTIC',
    dateStr,
    `${total} ${total === 1 ? 'story' : 'stories'} from the last 24 hours`,
    '',
  ];

  for (const s of SECTIONS) {
    if (!categorized[s.key].length) continue;
    lines.push(`--- ${s.label.toUpperCase()} ---`, '');
    for (const a of categorized[s.key]) {
      lines.push(
        a.title,
        ...(a.summary ? [a.summary] : []),
        a.author,
        a.publication,
        formatDateShort(a.date),
        a.url,
        '',
      );
    }
  }

  lines.push('chaoticera.news');
  return lines.join('\n');
}

async function sendEmail(categorized, dateStr, total) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BRIEFING_TO;

  if (!apiKey || !to) {
    console.log('[briefing] Email skipped — set RESEND_API_KEY and BRIEFING_TO to enable');
    return;
  }

  const payload = JSON.stringify({
    from: process.env.BRIEFING_FROM || 'Chaotic Era Briefing <onboarding@resend.dev>',
    to: [to],
    subject: `Extra Chaotic — ${dateStr}`,
    html: buildEmailHTML(categorized, dateStr, total),
    text: buildPlainText(categorized, dateStr, total),
  });

  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Resend ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  console.log(`[briefing] Email sent to ${to}`);
}

async function sendSMS(articles) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token,
          TWILIO_FROM_NUMBER: from, TWILIO_TO_NUMBER: to } = process.env;

  if (!sid || !token || !from || !to) {
    console.log('[briefing] SMS skipped — set TWILIO_* env vars to enable');
    return;
  }

  const top = articles.slice(0, 5);
  const body = [
    `Chaotic Era briefing — ${articles.length} ${articles.length === 1 ? 'story' : 'stories'} today:`,
    '',
    ...top.map((a, i) => `${i + 1}. ${a.title} (${a.publication})`),
    ...(articles.length > 5 ? [`...and ${articles.length - 5} more. Check your email.`] : []),
    '',
    'chaoticera.news',
  ].join('\n');

  await new Promise((resolve, reject) => {
    const params = new URLSearchParams({ To: to, From: from, Body: body }).toString();
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const req = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${sid}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(params),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Twilio ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(params);
    req.end();
  });

  console.log(`[briefing] SMS sent to ${to}`);
}

async function sendBriefing() {
  console.log('[briefing] Generating daily briefing...');

  clearCache();
  let articles;
  try {
    articles = await buildFeed();
  } catch (err) {
    console.error('[briefing] Failed to fetch feed:', err.message);
    return;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = articles.filter(a => new Date(a.date) >= oneDayAgo);
  console.log(`[briefing] ${recent.length} articles in the last 24h`);

  const categorized = { social: [], media: [], politics: [] };
  for (const a of recent) categorized[categorize(a)].push(a);

  const dateStr = formatDateLong(new Date());
  const results = await Promise.allSettled([
    sendEmail(categorized, dateStr, recent.length),
    sendSMS(recent),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('[briefing] Delivery error:', r.reason);
  }
}

module.exports = { sendBriefing };
