const https = require('https');
const { buildFeed, clearCache, fetchTopicArticles, normalizeTitle } = require('./feed');
const { filterByVerifiedDate } = require('./verifyDate');

const TZ = process.env.BRIEFING_TIMEZONE || 'America/New_York';

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

function articleCard(a) {
  return `
    <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f4f4f5;">
      <a href="${esc(a.url)}" style="display:block;font-size:15px;font-weight:700;color:#0a0a0a;text-decoration:none;line-height:1.4;margin-bottom:5px;">${esc(a.title)}</a>
      <div style="font-size:12px;color:#a1a1aa;">
        ${a.author ? `<span>${esc(a.author)}</span> &middot; ` : ''}<span style="font-weight:500;color:#71717a;">${esc(a.publication)}</span> &middot; <span>${formatDateShort(a.date)}</span>
      </div>
    </div>`;
}

function greetingBlock() {
  return `<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#1f2937;">Good morning, Kyle! Here are stories you may have missed this week.</p>`;
}

function buildEmailHTML(journalistArticles, chaosArticles, dateStr, total) {
  const journalistHTML = journalistArticles.length
    ? journalistArticles.map(articleCard).join('')
    : '<p style="font-size:14px;color:#a1a1aa;margin:0 0 20px;">No new articles from tracked journalists in the past 24 hours.</p>';

  const chaosHTML = chaosArticles.length
    ? chaosArticles.map(articleCard).join('')
    : '<p style="font-size:14px;color:#a1a1aa;margin:0;">Nothing new to report.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Extra Chaotic</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Inter',system-ui,-apple-system,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <div style="background:#419EFF;padding:24px 32px 28px;border-radius:8px 8px 0 0;">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="https://www.chaoticera.news/logo.png" alt="Chaotic Era" width="52" height="52" style="display:block;border-radius:10px;flex-shrink:0;">
      <div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.15em;color:rgba(255,255,255,0.75);margin-bottom:8px;">Chaotic Era</div>
        <h1 style="margin:0 0 5px;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;font-family:'IBM Plex Serif',Georgia,serif;">Extra Chaotic</h1>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.85);">${esc(dateStr)}&nbsp;&middot;&nbsp;${total} ${total === 1 ? 'story' : 'stories'} from tracked journalists</p>
      </div>
    </div>
  </div>

  <div style="background:#ffffff;padding:28px 32px 20px;border-radius:0 0 8px 8px;border:1px solid #e4e4e7;border-top:0;">

    ${greetingBlock()}

    <h2 style="margin:0 0 20px;font-size:18px;font-weight:800;color:#0a0a0a;letter-spacing:-0.02em;">From Priority Journalists</h2>
    ${journalistHTML}

    <div style="border-top:2px solid #0a0a0a;margin:32px 0 28px;"></div>

    <h2 style="margin:0 0 20px;font-size:18px;font-weight:800;color:#0a0a0a;letter-spacing:-0.02em;">More things you should read</h2>
    ${chaosHTML}

    <div style="padding-top:20px;border-top:1px solid #f4f4f5;margin-top:12px;">
      <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.7;">
        Delivered by ChaoticFeed for <a href="https://www.chaoticera.news" style="color:#71717a;text-decoration:none;">Chaotic Era</a>.
      </p>
    </div>
  </div>

</div>
</body>
</html>`;
}

function buildPlainText(journalistArticles, chaosArticles, dateStr, total) {
  const lines = [
    'EXTRA CHAOTIC',
    dateStr,
    '',
    'Good morning, Kyle! Here are stories you may have missed this week.',
    '',
    '--- FROM PRIORITY JOURNALISTS ---',
    '',
  ];
  for (const a of journalistArticles) {
    lines.push(
      a.title,
      `${a.author ? a.author + ' · ' : ''}${a.publication} · ${formatDateShort(a.date)}`,
      a.url,
      '',
    );
  }

  if (chaosArticles.length) {
    lines.push('--- MORE THINGS YOU SHOULD READ ---', '');
    for (const a of chaosArticles) {
      lines.push(
        a.title,
        `${a.publication} · ${formatDateShort(a.date)}`,
        a.url,
        '',
      );
    }
  }

  lines.push('chaoticera.news');
  return lines.join('\n');
}

async function sendEmail(journalistArticles, chaosArticles, dateStr, total) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BRIEFING_TO;

  if (!apiKey || !to) {
    console.log('[briefing] Email skipped — set RESEND_API_KEY and BRIEFING_TO to enable');
    return;
  }

  const payload = JSON.stringify({
    from: process.env.BRIEFING_FROM || 'Extra Chaotic <onboarding@resend.dev>',
    to: [to],
    subject: `Extra Chaotic — ${dateStr}`,
    html: buildEmailHTML(journalistArticles, chaosArticles, dateStr, total),
    text: buildPlainText(journalistArticles, chaosArticles, dateStr, total),
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

async function sendSMS(journalistArticles) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token,
          TWILIO_FROM_NUMBER: from, TWILIO_TO_NUMBER: to } = process.env;

  if (!sid || !token || !from || !to) {
    console.log('[briefing] SMS skipped — set TWILIO_* env vars to enable');
    return;
  }

  const top = journalistArticles.slice(0, 5);
  const body = [
    `Extra Chaotic — ${journalistArticles.length} stories today:`,
    '',
    ...top.map((a, i) => `${i + 1}. ${a.title} (${a.publication})`),
    ...(journalistArticles.length > 5 ? ['...and more. Check your email.'] : []),
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
  console.log('[briefing] Generating Extra Chaotic briefing...');

  clearCache();
  let allArticles;
  try {
    allArticles = await buildFeed();
  } catch (err) {
    console.error('[briefing] Failed to fetch journalist feed:', err.message);
    return;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentFromRss = allArticles.filter(a => new Date(a.date) >= oneDayAgo);
  console.log(`[briefing] ${recentFromRss.length} journalist articles from RSS (last 24h), verifying page dates...`);
  const journalistArticles = await filterByVerifiedDate(recentFromRss, 1);
  console.log(`[briefing] ${journalistArticles.length} journalist articles after page-date verification`);

  const seenUrls = new Set(journalistArticles.map(a => a.url));
  const seenTitles = new Set(journalistArticles.map(a => normalizeTitle(a.title)));
  let chaosArticles = [];
  try {
    const rawChaos = await fetchTopicArticles(seenUrls, seenTitles);
    console.log(`[briefing] ${rawChaos.length} More Chaos from RSS — verifying page dates...`);
    chaosArticles = await filterByVerifiedDate(rawChaos, 2);
    console.log(`[briefing] ${chaosArticles.length} More Chaos after verification`);
  } catch (err) {
    console.error('[briefing] Failed to fetch topic articles:', err.message);
  }

  const dateStr = formatDateLong(new Date());
  const results = await Promise.allSettled([
    sendEmail(journalistArticles, chaosArticles, dateStr, journalistArticles.length),
    sendSMS(journalistArticles),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('[briefing] Delivery error:', r.reason);
  }
}

module.exports = { sendBriefing };
