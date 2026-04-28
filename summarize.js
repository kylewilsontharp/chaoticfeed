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
      max_tokens: 500,
      system: `You are an editorial assistant for Chaotic Era (chaoticera.news), a newsletter covering the intersection of politics, media, and digital culture — specifically: political media, conservative media ecosystems, campaign technology, political advertising, media consumption habits, and political influencers. Write in a smart, direct editorial voice. No fluff, no bullet points.`,
      messages: [{
        role: 'user',
        content: `Based on today's news articles below, write a 1-2 paragraph morning briefing for the newsletter author. Identify which stories are getting traction and why they matter for the politics and media industry. End with 1-2 specific story angles that could make a compelling Chaotic Era newsletter issue this week.

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
