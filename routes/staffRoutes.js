const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET; // Move to environment variable in production

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const query = 'SELECT * FROM staff WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Email not found' });
    }

    const staff = results[0];

    // In production, staff.password should be a hashed password
    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // Create JWT
    const token = jwt.sign(
      { id: staff.id, email: staff.email, role: 'staff' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    

    res.json({
      message: 'Login successful',
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email
      }
    });
  });
});


// 🔐 Forgot Password
// POST /api/staff/forget-password
router.post("/forget-password", async (req, res) => {
  const { email } = req.body;

  try {
    const query = "SELECT * FROM staff WHERE email = ?";
    db.query(query, [email], async (err, results) => {
      if (err) return res.status(500).json({ error: "Database error" });

      if (results.length === 0) {
        return res.status(404).json({ error: "Staff not found" });
      }

      const user = results[0];
      const encodedId = Buffer.from(user.id.toString()).toString("base64");
      const encodedEmail = Buffer.from(user.email).toString("base64");

  const resetBase = process.env.REACT_LINK_BASE || "http://localhost:3000";
const resetLink = `${resetBase}/admin/reset-password?id=${encodedId}&email=${encodedEmail}`;

      const transporter = nodemailer.createTransport({
        host: "smtp.hostinger.com",
        port: 465,
        secure: true,
        auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,// ⚠️ move to .env
        },
        tls: {
          rejectUnauthorized: false, // ✅ Fix for self-signed cert
        },
      });

      const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reset Your Admin Password</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 0; margin: 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #fff; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background-color: #002244; color: white; padding: 20px; text-align: center;">
                    <h2>Skate & Play Admin Portal</h2>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px;">
                    <p>Hi ${user.name || "Admin"},</p>
                    <p>We received a request to reset your admin portal password.</p>
                    <p style="text-align: center; margin: 30px 0;">
                      <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">Reset Your Password</a>
                    </p>
                    <p>If you didn’t request this, you can safely ignore this email.</p>
                    <p>Stay safe,<br/>Skate & Play Admin Team</p>
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

      const mailOptions = {
        from: "manjeet@aronasoft.com",
        to: email,
        subject: "Reset Your Admin Password - Skate & Play",
        html: htmlTemplate,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Email sending error:", error);
          return res.status(500).json({ error: "Failed to send email" });
        }

        return res.json({ message: "Password reset link sent to your email" });
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 🔐 Reset Password
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const query = 'UPDATE staff SET password = ? WHERE email = ?';
    db.query(query, [hashedPassword, email], (err, results) => {
      if (err) return res.status(500).json({ message: 'Server error' });
      res.json({ message: 'Password reset successfully' });
    });
  } catch (err) {
    return res.status(400).json({ message: 'Invalid or expired token' });
  }
});




// POST /api/staff/update-password
router.post("/update-password", async (req, res) => {
  const { password, confirmPassword, email, id } = req.body;

  // Step 1: Input validation
  if (!email || !id) return res.status(400).send("Invalid reset data.");
  if (!password || !confirmPassword) return res.status(400).send("Both password fields are required.");
  if (password !== confirmPassword) return res.status(400).send("Passwords do not match.");

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const minLength = password.length >= 8;

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !minLength) {
    return res.status(400).send("Password must be at least 8 characters with an uppercase letter, lowercase letter, and number.");
  }

  try {
    // Step 2: Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Step 3: Update the password in the DB
    const sql = "UPDATE staff SET password = ? WHERE id = ? AND email = ?";
    db.query(sql, [hashedPassword, id, email], (err, result) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).send("Failed to update password.");
      }

      // Step 4: Fetch updated staff info to return
      const getUserQuery = "SELECT id, name, email FROM staff WHERE id = ? AND email = ?";
      db.query(getUserQuery, [id, email], (err, rows) => {
        if (err || rows.length === 0) {
          console.error("Error fetching updated staff info:", err);
          return res.status(500).send("Password updated but failed to retrieve staff info.");
        }

        const user = rows[0];

        // Step 5: Generate JWT
        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
          expiresIn: "1d",
        });

        const staffInfo = {
          id: user.id,
          email: user.email,
          name: user.name,
        };

        // Step 6: Send response with token & staff info
        return res.json({
          message: "Password updated successfully.",
          token,
          staff: staffInfo,
        });
      });
    });
  } catch (err) {
    console.error("Hashing error:", err);
    res.status(500).send("Server error.");
  }
});

module.exports = router;
