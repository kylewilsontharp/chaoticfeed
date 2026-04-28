require('dotenv').config();
const express = require('express');
const path = require('path');
const { buildFeed, clearCache } = require('./feed');
const { initScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

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
  clearCache();
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
  initScheduler();
});
