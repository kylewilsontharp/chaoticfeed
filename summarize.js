const Anthropic = require('@anthropic-ai/sdk');

async function summarizeArticles(articles) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !articles.length) return articles;

  const client = new Anthropic({ apiKey });

  const results = await Promise.allSettled(
    articles.map(async (article) => {
      const hasSnippet = article.summary &&
        article.summary.trim().toLowerCase() !== article.title.trim().toLowerCase();
      const snippetLine = hasSnippet ? `\nSnippet: ${article.summary}` : '';

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        system: 'You write brief summaries for a political media newsletter called Chaotic Era. Write 1-2 sentences about what the article covers — be specific, name the key angle, person, or finding. Do not start with "This article" or repeat the headline. If there is not enough information to write a meaningful summary (title only, or clearly paywalled), respond with exactly: [Paywalled]',
        messages: [{ role: 'user', content: `Title: ${article.title}${snippetLine}` }],
      });

      const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
      return { ...article, summary: text };
    })
  );

  return results.map((r, i) => r.status === 'fulfilled' ? r.value : articles[i]);
}

module.exports = { summarizeArticles };
