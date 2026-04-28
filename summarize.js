const Anthropic = require('@anthropic-ai/sdk');

async function generateNarrative(journalistArticles, chaosArticles) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return '';

  const client = new Anthropic({ apiKey });

  const journalistList = journalistArticles.length
    ? journalistArticles.map(a => `- "${a.title}" (${a.author}, ${a.publication})`).join('\n')
    : '(none today)';

  const chaosList = chaosArticles.length
    ? chaosArticles.map(a => `- "${a.title}" (${a.publication})`).join('\n')
    : '(none today)';

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are an editorial assistant for Chaotic Era (chaoticera.news), a newsletter covering the intersection of politics, media, and digital culture — specifically: political media, conservative media ecosystems, campaign technology, political advertising, media consumption habits, and political influencers.

Write in Axios "Smart Brevity" style: short declarative sentences, no throat-clearing, no filler. Structure your response exactly like this:

**[One punchy headline summarizing the day's dominant theme]**

The big picture: [1-2 sentences on what's driving the day's news cycle.]

Why it matters: [1-2 sentences on the stakes for the politics/media industry.]

- **[Bold lead-in phrase]:** [One sentence of supporting detail.]
- **[Bold lead-in phrase]:** [One sentence of supporting detail.]
- **[Bold lead-in phrase]:** [One sentence of supporting detail.]

**Story angles worth chasing this week:** [1-2 specific, actionable newsletter ideas for Chaotic Era, written as brief bullets.]

No paragraphs of prose. Every line should earn its place.`,
      messages: [{
        role: 'user',
        content: `Based on today's news articles below, write the Smart Brevity morning briefing for the Chaotic Era newsletter author.

FROM TRACKED JOURNALISTS:
${journalistList}

MORE CHAOS — TOPIC STORIES:
${chaosList}`,
      }],
    });

    return message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
  } catch (err) {
    console.error('[briefing] Narrative generation failed:', err.message);
    return '';
  }
}

module.exports = { generateNarrative };
