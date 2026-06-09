const https = require('https');
const http = require('http');
const { URL } = require('url');

const BLOCKED_DOMAINS = [
  /\bmsn\.com\b/i,
  /\bmiddle-?east-?online\.com\b/i,
  /\basiae\.co\.kr\b/i,
  /\bindiatimes\.com\b/i,
  /\bnorthdakotamonitor\.com\b/i,
  /\bbrennancenter\.org\b/i,
  /\.co\.kr(\/|$)/i,
  /\.co\.in(\/|$)/i,
  /\.com\.au(\/|$)/i,
  /\.co\.za(\/|$)/i,
  /\.com\.br(\/|$)/i,
];

function fetchPage(rawUrl, maxRedirects = 6, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const attempt = (url, remaining) => {
      let parsed;
      try { parsed = new URL(url); } catch (e) { return reject(e); }

      // Bail out early if we've landed on a blocked domain mid-redirect
      if (BLOCKED_DOMAINS.some(p => p.test(url))) {
        return resolve({ html: '', finalUrl: url, blocked: true });
      }

      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ChaoticFeed/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout,
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && remaining > 0) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          attempt(next, remaining - 1);
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 60000) {
            req.destroy();
            resolve({ html: data, finalUrl: url, blocked: false });
          }
        });
        res.on('end', () => resolve({ html: data, finalUrl: url, blocked: false }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    };
    attempt(rawUrl, maxRedirects);
  });
}

function extractDateFromHtml(html) {
  // JSON-LD blocks (handles arrays and @graph)
  const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (ldBlocks) {
    for (const block of ldBlocks) {
      try {
        const text = block.replace(/<[^>]+>/g, '').trim();
        const items = [].concat(JSON.parse(text));
        for (const item of items) {
          const graph = item['@graph'] ? [].concat(item['@graph']) : [];
          for (const node of [item, ...graph]) {
            const raw = node.datePublished || node.dateCreated;
            if (raw) {
              const d = new Date(raw);
              if (!isNaN(d.getTime())) return d;
            }
          }
        }
      } catch { /* malformed JSON, skip */ }
    }
  }

  // Meta tags — try common patterns
  const metaPatterns = [
    /property=["']article:published_time["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+property=["']article:published_time["']/i,
    /name=["']publish[_-]?date["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+name=["']publish[_-]?date["']/i,
    /name=["']pubdate["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+name=["']pubdate["']/i,
    /name=["']date["']\s+content=["']([^"']+)["']/i,
    /itemprop=["']datePublished["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+itemprop=["']datePublished["']/i,
  ];

  for (const pat of metaPatterns) {
    const m = html.match(pat);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // <time datetime="..."> — used by Substack, Ghost, and many newsletter platforms
  const timeEl = html.match(/<time[^>]+\bdatetime=["']([^"']+)["']/i);
  if (timeEl) {
    const d = new Date(timeEl[1]);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

async function isArticleRecent(url, maxAgeDays) {
  try {
    const { html, finalUrl, blocked } = await fetchPage(url);

    // Exclude blocked domains regardless of date
    if (blocked || BLOCKED_DOMAINS.some(p => p.test(finalUrl))) return false;

    const date = extractDateFromHtml(html);
    if (!date) return true; // can't determine date — keep the article
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    return date >= cutoff;
  } catch {
    return true; // fetch/parse error — keep the article
  }
}

async function filterByVerifiedDate(articles, maxAgeDays) {
  const checks = await Promise.allSettled(
    articles.map(a => isArticleRecent(a.url, maxAgeDays))
  );
  return articles.filter((_, i) => checks[i].status === 'fulfilled' && checks[i].value === true);
}

module.exports = { filterByVerifiedDate };
