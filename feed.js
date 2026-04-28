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
};

// Google News appends " - Publication Name" to titles — strip it
function cleanTitle(raw) {
  if (!raw) return 'Untitled';
  return raw.replace(/\s+[-–]\s+[A-Z][^-–]{1,50}$/, '').trim() || raw;
}

// Extract the publication name from a raw Google News title
function extractSource(raw) {
  const match = raw.match(/[-–]\s*([A-Z][^-–]{1,50})$/);
  return match ? match[1].trim() : '';
}

function extractSummary(raw) {
  if (!raw) return '';
  const cleaned = raw.replace(/\s*[-–]\s*[A-Z][^-–\n]*$/, '').trim();
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  if (match && match[0].length > 25) return match[0].trim();
  return cleaned.length > 160 ? cleaned.slice(0, 157) + '...' : cleaned;
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
    articles.push({
      title: cleanTitle(item.title || 'Untitled'),
      url: item.link || '',
      date: pubDate.toISOString(),
      author: author.name,
      publication: author.publication,
      color: PUBLICATION_COLORS[author.publication] || '#6b7280',
      summary: extractSummary(item.contentSnippet || item.content || ''),
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

// Topic queries for the "More Chaos" section
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
];

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
        articles.push({
          title: cleanTitle(item.title || 'Untitled'),
          url: item.link || '',
          date: pubDate.toISOString(),
          author: '',
          publication: source,
          color: PUBLICATION_COLORS[source] || '#6b7280',
          summary: extractSummary(item.contentSnippet || item.content || ''),
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

  articles.sort((a, b) => new Date(b.date) - new Date(a.date));
  return articles;
}

function clearCache() {
  cache.del('feed');
}

module.exports = { buildFeed, clearCache, fetchArticlesForAuthor, fetchTopicArticles, PUBLICATION_COLORS };
