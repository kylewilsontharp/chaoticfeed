const express = require('express');
const Parser = require('rss-parser');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChaoticFeed/1.0)' },
});
const cache = new NodeCache({ stdTTL: 900 }); // 15-minute cache
const PORT = process.env.PORT || 3000;

const AUTHORS = [
  { name: 'Shane Goldmacher', publication: 'New York Times' },
  { name: 'Theodore Schleifer', publication: 'New York Times' },
  { name: 'Max Tani', publication: 'Semafor' },
  { name: 'Ben Smith', publication: 'Semafor' },
  { name: 'Jessica Piper', publication: 'POLITICO' },
  { name: 'Zach Montellaro', publication: 'POLITICO' },
  { name: 'Issie Lapowsky', publication: 'Freelance' },
  { name: 'Nancy Scola', publication: 'Freelance' },
  { name: 'Alex Thompson', publication: 'Axios' },
  { name: 'Sara Fischer', publication: 'Axios' },
];

const PUBLICATION_COLORS = {
  'New York Times': '#000000',
  'Semafor': '#0066cc',
  'POLITICO': '#c40000',
  'Axios': '#ff6d00',
  'Freelance': '#6b7280',
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

    // Clean up Google News redirect URLs and get the actual article URL
    let articleUrl = item.link || '';

    // Extract a clean title (Google News sometimes appends " - Publication Name")
    const title = item.title || 'Untitled';

    articles.push({
      title,
      url: articleUrl,
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

  const results = await Promise.allSettled(AUTHORS.map(fetchArticlesForAuthor));

  const allArticles = [];
  const seen = new Set();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const article of result.value) {
        // Deduplicate by URL
        const key = article.url;
        if (!seen.has(key)) {
          seen.add(key);
          allArticles.push(article);
        }
      }
    }
  }

  // Sort newest first
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  cache.set('feed', allArticles);
  return allArticles;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/feed', async (req, res) => {
  try {
    const articles = await buildFeed();
    res.json({ articles, cachedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Failed to fetch feed', articles: [] });
  }
});

app.get('/api/refresh', async (req, res) => {
  cache.del('feed');
  try {
    const articles = await buildFeed();
    res.json({ articles, cachedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh feed', articles: [] });
  }
});

app.listen(PORT, () => {
  console.log(`ChaoticFeed running at http://localhost:${PORT}`);
});
