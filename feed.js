const Parser = require('rss-parser');
const NodeCache = require('node-cache');
const journalists = require('./journalists');

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChaoticFeed/1.0)' },
});

const cache = new NodeCache({ stdTTL: 900 });

const PUBLICATION_COLORS = {
  'New York Times': '#000000',
  'Semafor': '#0066cc',
  'Axios': '#ff6d00',
  'UserMag': '#7c3aed',
  'Garbage Day': '#16a34a',
  'Status': '#0369a1',
  'Puck': '#b45309',
  'POLITICO': '#c40000',
  'The Bulwark': '#1d4ed8',
  'NOTUS': '#0891b2',
  'Washington Post': '#231f20',
  'Freelance': '#6b7280',
  'Bloomberg': '#0065ff',
  'New York Magazine': '#d4002a',
  'The Atlantic': '#0f172a',
  'Silver Bulletin': '#6366f1',
  'CNN': '#cc0000',
  'The New Yorker': '#d40000',
  'The Information': '#1a56db',
};

function cleanTitle(raw) {
  if (!raw) return 'Untitled';
  return raw.replace(/\s+[-–]\s+[A-Z][^-–]{1,50}$/, '').trim() || raw;
}

function extractSource(raw) {
  const match = raw.match(/[-–]\s*([A-Z][^-–]{1,50})$/);
  return match ? match[1].trim() : '';
}

// Applies to all feeds
function isExcluded(title) {
  if (/latest\s+(?:\d{4}\s+)?polls/i.test(title)) return true;
  return false;
}

// Additional exclusions only for the More Chaos topic feed
function isExcludedFromChaos(title, publication) {
  const pub = publication.toLowerCase();
  const t = title.toLowerCase();

  // Excluded outlets
  if (pub.includes('new york times') || pub.includes('nytimes')) return true;
  if (pub.includes('nbc news') || pub === 'nbc') return true;

  // Trackers, aggregators, interactive tools (no bylined author)
  if (/\btracker\b/i.test(t)) return true;
  if (/poll(ing)?\s+(average|aggregate|tracker)/i.test(t)) return true;
  if (/\blive\s+(blog|updates?|results?|feed)\b/i.test(t)) return true;
  if (/\binteractive\b/i.test(t)) return true;
  if (/\belection\s+results?\b/i.test(t)) return true;
  if (/\brolling\s+average\b/i.test(t)) return true;
  if (/\bdatabank\b|\bscorecard\b/i.test(t)) return true;

  return false;
}

async function fetchArticlesForAuthor(author) {
  const query = encodeURIComponent(`"${author.name}"`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const feed = await parser.parseURL(url);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const articles = [];
  for (const item of feed.items) {
    const pubDate = new Date(item.pubDate);
    if (isNaN(pubDate.getTime()) || pubDate < sevenDaysAgo) continue;
    const title = cleanTitle(item.title || 'Untitled');
    if (isExcluded(title)) continue;
    articles.push({
      title,
      url: item.link || '',
      date: pubDate.toISOString(),
      author: author.name,
      publication: author.publication,
      color: PUBLICATION_COLORS[author.publication] || '#6b7280',
      snippet: item.contentSnippet || '',
    });
  }
  return articles;
}

async function buildFeed() {
  const cached = cache.get('feed');
  if (cached) return cached;

  const results = await Promise.allSettled(journalists.map(fetchArticlesForAuthor));
  const allArticles = [];
  const seen = new Set();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const article of result.value) {
        if (!seen.has(article.url)) {
          seen.add(article.url);
          allArticles.push(article);
        }
      }
    }
  }

  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
  cache.set('feed', allArticles);
  return allArticles;
}

const CHAOS_QUERIES = [
  '"partisan media"',
  '"conservative media"',
  '"political advertising"',
  'midterm election polling 2026',
  '"political data"',
  '"campaign technology"',
  '"media consumption"',
  'site:pewresearch.org',
  'site:mediamatters.org',
  '"news media" trust OR habits OR consumption',
  '"political influencer"',
  '"influencer marketing" politics',
];

const OUTLET_PRIORITY = new Map([
  ['Axios', 10], ['POLITICO', 10], ['Semafor', 10],
  ['Washington Post', 10], ['Wall Street Journal', 10], ['Bloomberg', 10],
  ['New York Magazine', 9], ['The Atlantic', 9], ['The New Yorker', 9],
  ['NPR', 9], ['Pew Research Center', 9], ['Media Matters', 9],
  ['Reuters', 9], ['Associated Press', 9],
  ['The Hill', 8], ['Slate', 8], ['Vox', 8], ['The Bulwark', 8],
  ['Wired', 8], ['The Guardian', 8], ['Politico Magazine', 8],
  ['NOTUS', 8], ['Garbage Day', 8], ['Status', 8],
]);

function outletScore(pub) {
  return OUTLET_PRIORITY.get(pub) || 5;
}

async function fetchTopicArticles(seenUrls = new Set()) {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const results = await Promise.allSettled(
    CHAOS_QUERIES.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const feed = await parser.parseURL(url);
      const articles = [];
      for (const item of feed.items) {
        const pubDate = new Date(item.pubDate);
        if (isNaN(pubDate.getTime()) || pubDate < twoDaysAgo) continue;
        const source = extractSource(item.title || '');
        const title = cleanTitle(item.title || 'Untitled');
        if (isExcluded(title) || isExcludedFromChaos(title, source)) continue;
        // Require a detectable byline (dc:creator) — skip if clearly absent
        const author = item.creator || item.author || null;
        if (author === '') continue; // empty string = explicitly no author
        articles.push({
          title,
          url: item.link || '',
          date: pubDate.toISOString(),
          author: author || '',
          publication: source,
          color: PUBLICATION_COLORS[source] || '#6b7280',
          snippet: item.contentSnippet || '',
          _score: outletScore(source),
        });
      }
      return articles;
    })
  );

  const articles = [];
  const seen = new Set(seenUrls);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const article of result.value) {
        if (article.url && !seen.has(article.url)) {
          seen.add(article.url);
          articles.push(article);
        }
      }
    }
  }

  articles.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return new Date(b.date) - new Date(a.date);
  });
  return articles.slice(0, 15).map(({ _score, ...a }) => a);
}

const OPINION_QUERIES = [
  'opinion "democratic party" future OR crisis OR strategy site:washingtonpost.com OR site:nytimes.com OR site:theatlantic.com OR site:slate.com OR site:vox.com',
  'op-ed "democratic party" future OR rebuilding OR direction',
  'opinion "partisan media" OR "media polarization" site:washingtonpost.com OR site:theatlantic.com OR site:columbia.edu',
  'site:substack.com "democratic party" future OR strategy',
  'site:substack.com "partisan media" OR "conservative media"',
  'commentary "future of the democratic party"',
];

function isOpinionPiece(item, title) {
  const t = title.toLowerCase();
  const url = (item.link || '').toLowerCase();
  if (/^opinion[:\s]|^op-ed[:\s]|^commentary[:\s]|^perspective[:\s]/i.test(title)) return true;
  if (url.includes('substack.com')) return true;
  if (url.includes('/opinion/') || url.includes('/opinions/') || url.includes('/commentary/')) return true;
  return false;
}

async function fetchOpinionArticles(seenUrls = new Set()) {
  const twoDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000); // 3 days for opinions

  const results = await Promise.allSettled(
    OPINION_QUERIES.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const feed = await parser.parseURL(url);
      const articles = [];
      for (const item of feed.items) {
        const pubDate = new Date(item.pubDate);
        if (isNaN(pubDate.getTime()) || pubDate < twoDaysAgo) continue;
        const source = extractSource(item.title || '');
        const title = cleanTitle(item.title || 'Untitled');
        if (!isOpinionPiece(item, title)) continue;
        if (isExcludedFromChaos(title, source)) continue;
        const author = item.creator || item.author || null;
        if (author === '') continue;
        articles.push({
          title,
          url: item.link || '',
          date: pubDate.toISOString(),
          author: author || '',
          publication: source,
          color: PUBLICATION_COLORS[source] || '#6b7280',
          snippet: item.contentSnippet || '',
          _score: outletScore(source),
        });
      }
      return articles;
    })
  );

  const articles = [];
  const seen = new Set(seenUrls);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const article of result.value) {
        if (article.url && !seen.has(article.url)) {
          seen.add(article.url);
          articles.push(article);
        }
      }
    }
  }

  articles.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return new Date(b.date) - new Date(a.date);
  });
  return articles.slice(0, 3).map(({ _score, ...a }) => a);
}

function clearCache() {
  cache.del('feed');
}

module.exports = { buildFeed, clearCache, fetchArticlesForAuthor, fetchTopicArticles, fetchOpinionArticles, PUBLICATION_COLORS };
