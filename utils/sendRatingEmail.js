// utils/sendRatingEmail.js
const nodemailer = require("nodemailer");

async function sendRatingEmail(customer) {
  const ratingLink = `${process.env.REACT_LINK_BASE || 'http://localhost:3000'}/rate/${customer.id}`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port:process.env.SMTP_PORT,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
  });

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>How Was Your Visit?</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; margin:0; padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #fff; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
              <tr>
                <td style="background-color: #002244; color: white; padding: 20px; text-align: center;">
                  <h2>Skate & Play</h2>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px;">
                  <p>Hi ${customer.first_name} ${customer.last_name},</p>
                  <p>Thanks again for visiting Skate & Play (and EXIT Lounge if you stopped by)! We’d love to know how your experience was.</p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${ratingLink}" style="background-color: #007bff; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">👉 Click to Rate</a><br>
                    ⭐⭐⭐⭐⭐
                  </p>
                  <p>It only takes a moment and really helps us improve.</p>
                  <p>Thanks for being part of the fun — we hope to see you again soon!.</p>
                  <p>Cheers,<br/>The Skate & Play Team</p>
                  <p>[info@skate-play.com | www.skate-play.com</p>
                </td>
              </tr>
              <tr>
                <td style="text-align: center; background-color: #f1f1f1; padding: 10px; font-size: 12px; color: #888;">
                  &copy; 2025 Skate & Play. All rights reserved.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: customer.email,
    subject: "How Was Your Visit? ⭐",
    html: htmlTemplate
  });

  console.log(`✅ Rating email sent to ${customer.email}`);
}

module.exports = sendRatingEmail;
