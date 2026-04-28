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
};

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
      title: item.title || 'Untitled',
      url: item.link || '',
      date: pubDate.toISOString(),
      author: author.name,
      publication: author.publication,
      color: PUBLICATION_COLORS[author.publication] || '#6b7280',
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

function clearCache() {
  cache.del('feed');
}

module.exports = { buildFeed, clearCache, fetchArticlesForAuthor, PUBLICATION_COLORS };
