const cron = require('node-cron');
const { sendBriefing } = require('./briefing');

function initScheduler() {
  const hour = process.env.BRIEFING_HOUR || '6';
  const tz = process.env.BRIEFING_TIMEZONE || 'America/New_York';

  cron.schedule(`0 ${hour} * * *`, async () => {
    try {
      await sendBriefing();
    } catch (err) {
      console.error('[scheduler] Briefing failed:', err);
    }
  }, { timezone: tz });

  console.log(`[scheduler] Daily briefing scheduled at ${hour}:00 ${tz}`);
}

module.exports = { initScheduler };
