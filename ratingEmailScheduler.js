const cron = require("node-cron");
const db = require("./db/connection");
const sendRatingEmail = require("./utils/sendRatingEmail");
const sendRatingSMS = require("./utils/sendRatingSMS");

// Run every hour at 0 minutes (e.g., 01:00, 02:00, 03:00...)
cron.schedule("0 * * * *", async () => {
  console.log("🔍 Checking for waivers that need rating messages...");

  try {
    // ✅ Use MySQL UTC time (most DBs store in UTC)
    const [waivers] = await db.query(`
      SELECT wf.id AS waiver_id, wf.*, c.* 
      FROM waiver_forms wf
      JOIN customers c ON wf.user_id = c.id
      WHERE (wf.rating_email_sent = 0 OR wf.rating_sms_sent = 0)
      AND wf.signed_at IS NOT NULL
      -- check if 3 hours have passed since signing
      AND TIMESTAMPDIFF(HOUR, wf.signed_at, UTC_TIMESTAMP()) = 3
    `);

    if (waivers.length === 0) {
      console.log("✅ No waivers pending for rating messages this hour.");
      return;
    }

    for (let waiver of waivers) {
      try {
        // 📧 Send Email
        if (!waiver.rating_email_sent) {
          await sendRatingEmail(waiver);
          await db.query(
            `UPDATE waiver_forms SET rating_email_sent = 1 WHERE id = ?`,
            [waiver.waiver_id]
          );
          console.log(`📧 Email sent to ${waiver.email}`);
        }

        // 📲 Send SMS
        if (!waiver.rating_sms_sent) {
          await sendRatingSMS(waiver);
          await db.query(
            `UPDATE waiver_forms SET rating_sms_sent = 1 WHERE id = ?`,
            [waiver.waiver_id]
          );
          console.log(
            `📲 SMS sent to ${waiver.cell_phone} (waiver ID ${waiver.waiver_id})`
          );
        }
      } catch (err) {
        console.error(
          `❌ Failed for waiver ID ${waiver.waiver_id}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("🚨 Query failed:", err.message);
  }
});
