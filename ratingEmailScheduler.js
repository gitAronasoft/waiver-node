const cron = require("node-cron");
const db = require('./db/connection');
const sendRatingEmail = require('./utils/sendRatingEmail');
const sendRatingSMS = require('./utils/sendRatingSMS');

cron.schedule("* * * * *", async () => {
  console.log("🔍 Checking for waivers that need rating messages...");

  const [waivers] = await db.query(`
    SELECT wf.id AS waiver_id, wf.*, c.* FROM waiver_forms wf
    JOIN customers c ON wf.user_id = c.id
    WHERE (wf.rating_email_sent = 0 OR wf.rating_sms_sent = 0)
    AND wf.signed_at IS NOT NULL
    AND TIMESTAMPDIFF(HOUR, wf.signed_at, NOW()) >= 3
  `);

  for (let waiver of waivers) {
    const now = new Date();

    try {
      // Email
      if (!waiver.rating_email_sent) {
        await sendRatingEmail(waiver);
        await db.query(`
          UPDATE waiver_forms 
          SET rating_email_sent = 1
          WHERE id = ?
        `, [waiver.waiver_id]);
        console.log(`📧 Email sent to ${waiver.email}`);
      }

      // SMS
      if (!waiver.rating_sms_sent) {
        await sendRatingSMS(waiver);
        await db.query(`
          UPDATE waiver_forms 
          SET rating_sms_sent = 1
          WHERE id = ?
        `, [ waiver.waiver_id]);
        console.log(`📲 SMS sent to ${waiver.cell_phone} waiver ID ${waiver.waiver_id}`);
      }

    } catch (err) {
      console.error(`❌ Failed to send rating message for waiver ID ${waiver.waiver_id}:`, err.message);
    }
  }
});
