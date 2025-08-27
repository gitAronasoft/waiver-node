const cron = require("node-cron");
const db = require("./db/connection");
const sendRatingEmail = require("./utils/sendRatingEmail");
const sendRatingSMS = require("./utils/sendRatingSMS");

// Run every hour at 0 minutes
cron.schedule("0 * * * *", async () => {
  console.log("🔍 Checking for waivers that need rating messages...");

  try {
    const [waivers] = await db.query(`
      SELECT wf.id AS waiver_id, wf.*, c.* 
      FROM waiver_forms wf
      JOIN customers c ON wf.user_id = c.id
      WHERE wf.signed_at IS NOT NULL
      AND TIMESTAMPDIFF(HOUR, wf.signed_at, UTC_TIMESTAMP()) >= 3
      AND (wf.rating_email_sent = 0 OR wf.rating_sms_sent = 0)
    `);

    console.log("Found waivers:", waivers.length);

    if (waivers.length === 0) {
      console.log("✅ No waivers pending for rating messages.");
      return;
    }

    for (let waiver of waivers) {
      // 📧 Email sending
      if (!waiver.rating_email_sent) {
        try {
          if (waiver.email && waiver.email.trim() !== "") {
            await sendRatingEmail(waiver);
            await db.query(
              `UPDATE waiver_forms SET rating_email_sent = 1 WHERE id = ?`,
              [waiver.waiver_id]
            );
            console.log(`📧 Email sent to ${waiver.email}`);
          } else {
            await db.query(
              `UPDATE waiver_forms SET rating_email_sent = 2 WHERE id = ?`,
              [waiver.waiver_id]
            );
            console.warn(
              `⚠️ No valid email for waiver ID ${waiver.waiver_id}, marked as failed.`
            );
          }
        } catch (err) {
          console.error(
            `❌ Email failed for waiver ID ${waiver.waiver_id}:`,
            err.message
          );
          await db.query(
            `UPDATE waiver_forms SET rating_email_sent = 2 WHERE id = ?`,
            [waiver.waiver_id]
          );
        }
      }

      // 📲 SMS sending
      if (!waiver.rating_sms_sent) {
        try {
          if (waiver.cell_phone && waiver.cell_phone.trim() !== "") {
            await sendRatingSMS(waiver);
            await db.query(
              `UPDATE waiver_forms SET rating_sms_sent = 1 WHERE id = ?`,
              [waiver.waiver_id]
            );
            console.log(
              `📲 SMS sent to ${waiver.cell_phone} (waiver ID ${waiver.waiver_id})`
            );
          } else {
            await db.query(
              `UPDATE waiver_forms SET rating_sms_sent = 2 WHERE id = ?`,
              [waiver.waiver_id]
            );
            console.warn(
              `⚠️ No valid phone for waiver ID ${waiver.waiver_id}, marked as failed.`
            );
          }
        } catch (err) {
          console.error(
            `❌ SMS failed for waiver ID ${waiver.waiver_id}:`,
            err.message
          );
          await db.query(
            `UPDATE waiver_forms SET rating_sms_sent = 2 WHERE id = ?`,
            [waiver.waiver_id]
          );
        }
      }
    }
  } catch (err) {
    console.error("🚨 Query failed:", err);
  }
});
