// routes/staff.js
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const multer = require("multer");

const path = require("path");
require('dotenv').config();
const authenticateToken = require("../middleware/auth"); // JWT Auth Middleware

const JWT_SECRET = process.env.JWT_SECRET;


// Ensure the upload folder exists
const fs = require("fs");
const uploadDir = path.join(__dirname, "../public/uploads/profile");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, "profile_" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Update Admin Profile
router.post("/update-profile", upload.single("profileImage"), async (req, res) => {
  const { id, name, email } = req.body;



  if (!id || !name || !email) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/profile/${req.file.filename}`;
    }

    let query = "UPDATE staff SET name = ?, email = ?";
    const params = [name, email];
    if (imagePath) {
      query += ", profile_image = ?";
      params.push(imagePath);
    }
    query += " WHERE id = ?";
    params.push(id);

    await db.query(query, params);

    const [updatedAdmin] = await db.query(
      "SELECT id, name, email, profile_image FROM staff WHERE id = ?",
      [id]
    );

    return res.json({
      message: "Profile updated successfully",
      staff: updatedAdmin[0],
    });
  } catch (err) {
  
    return res.status(500).json({ error: "Server error" });
  }
});


// Staff Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const [results] = await db.query('SELECT * FROM staff WHERE email = ?', [email]);

    if (results.length === 0) {
      return res.status(401).json({ message: 'Email not found' });
    }

    const staff = results[0];
    const isMatch = await bcrypt.compare(password, staff.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // Determine role: 1 = admin, else staff
    const userRole = staff.role === 1 ? 'admin' : 'staff';

    // Create JWT with role
    const token = jwt.sign(
      { id: staff.id, email: staff.email, role: userRole },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send response with profile image
    res.json({
      message: 'Login successful',
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: userRole,
        status: staff.status,
        profile_image: staff.profile_image || null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// Forgot Password
router.post('/forget-password', async (req, res) => {
  const { email } = req.body;

  try {
    const [results] = await db.query('SELECT * FROM staff WHERE email = ?', [email]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const user = results[0];
    const encodedId = Buffer.from(user.id.toString()).toString('base64');
    const encodedEmail = Buffer.from(user.email).toString('base64');
    const resetBase = process.env.REACT_LINK_BASE || 'http://localhost:3000';
    const resetLink = `${resetBase}/admin/reset-password?id=${encodedId}&email=${encodedEmail}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
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
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Reset Your Admin Password - Skate & Play',
      html: htmlTemplate
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) {
   
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset Password using token
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE staff SET password = ? WHERE email = ?', [hashedPassword, email]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    
    res.status(400).json({ message: 'Invalid or expired token' });
  }
});

// Update Password manually
router.post('/update-password', async (req, res) => {
  const { password, confirmPassword, email, id } = req.body;

  if (!email || !id) return res.status(400).send('Invalid reset data.');
  if (!password || !confirmPassword) return res.status(400).send('Both password fields are required.');
  if (password !== confirmPassword) return res.status(400).send('Passwords do not match.');

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const minLength = password.length >= 8;

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !minLength) {
    return res.status(400).send('Password must be at least 8 characters with an uppercase letter, lowercase letter, and number.');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
          await db.query(
          'UPDATE staff SET status = 1, password = ? WHERE id = ? AND email = ?',
          [hashedPassword, id, email]
        );

    const [rows] = await db.query('SELECT id, name, email FROM staff WHERE id = ? AND email = ?', [id, email]);
    if (rows.length === 0) return res.status(404).send('Staff not found.');

    const user = rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

    res.json({
      message: 'Password updated successfully.',
      token,
      staff: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    
    res.status(500).send('Server error.');
  }
});

// Change Password
// Change Password for logged-in staff
router.post("/change-password", async (req, res) => {
  const { id, email, currentPassword, newPassword, confirmPassword } = req.body;

  // Basic validations
  if (!id || !email)
    return res.status(400).json({ error: "Invalid request. Missing user details." });

  if (!currentPassword || !newPassword || !confirmPassword)
    return res.status(400).json({ error: "All fields are required." });

  if (newPassword !== confirmPassword)
    return res.status(400).json({ error: "New password and confirm password do not match." });

  // Password strength validation
  const hasUpperCase = /[A-Z]/.test(newPassword);
  const hasLowerCase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const minLength = newPassword.length >= 8;

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !minLength) {
    return res.status(400).json({
      error:
        "Password must be at least 8 characters long and include uppercase, lowercase, and a number.",
    });
  }

  try {
    // Find staff by ID and email
    const [staffRows] = await db.query(
      "SELECT * FROM staff WHERE id = ? AND email = ?",
      [id, email]
    );

    if (staffRows.length === 0)
      return res.status(404).json({ error: "Staff not found." });

    const staff = staffRows[0];

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, staff.password);
    if (!isMatch)
      return res.status(400).json({ error: "Current password is incorrect." });

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query("UPDATE staff SET password = ? WHERE id = ?", [
      hashedPassword,
      id,
    ]);

    // Generate new JWT token
    const token = jwt.sign(
      { id: staff.id, email: staff.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Password updated successfully.",
      token,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
      },
    });
  } catch (err) {
  
    return res.status(500).json({ error: "Server error." });
  }
});



// Get all staff members (excluding admin)
router.get('/getstaff', async (req, res) => {
  try {
    const [staff] = await db.query(
      "SELECT id, name, email, role, status, created_at, updated_at FROM staff WHERE role != 1"
    );
    res.json(staff);
  } catch (error) {
   
    res.status(500).json({ error: 'Failed to fetch staff data' });
  }
});




// router.post("/addstaff", async (req, res) => {
//   try {
//     const { name, email, role } = req.body;
//     if (!name || !email || !role) {
//       return res.status(400).json({ error: "Name, email, and role are required" });
//     }

//     // Check if email already exists
//     const [existing] = await db.query("SELECT id FROM staff WHERE email = ?", [email]);
//     if (existing.length > 0) {
//       return res.status(400).json({ error: "Email already exists" });
//     }

//     // Generate a temporary password
//     const tempPassword = Math.random().toString(36).slice(-8); // Example: ab12cd34
//     const hashedPassword = await bcrypt.hash(tempPassword, 10);

//     // Insert staff into database
//     await db.query(
//       "INSERT INTO staff (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)",
//       [name, email, hashedPassword, role, 0]
//     );

//     // Send invitation email
//     const loginBase = process.env.REACT_LINK_BASE || "http://localhost:3000";
//     const loginLink = `${loginBase}/admin/login`;

//     const transporter = nodemailer.createTransport({
//       host: process.env.SMTP_HOST,
//       port:  process.env.SMTP_PORT,
//       secure: true,
//       auth: {
//         user: process.env.SMTP_USER,
//         pass: process.env.SMTP_PASS,
//       },
//       tls: { rejectUnauthorized: false },
//     });

//     const htmlTemplate = `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <title>Welcome to Skate & Play</title>
//       </head>
//       <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 0; margin: 0;">
//         <table width="100%" cellpadding="0" cellspacing="0">
//           <tr>
//             <td align="center" style="padding: 40px 0;">
//               <table width="600" cellpadding="0" cellspacing="0" style="background-color: #fff; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
//                 <tr>
//                   <td style="background-color: #002244; color: white; padding: 20px; text-align: center;">
//                     <h2>Skate & Play Admin Portal</h2>
//                   </td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 30px;">
//                     <p>Hi ${name},</p>
//                     <p>You have been invited to join the Skate & Play admin portal as <b>${role == 1 ? "Admin" : "Staff"}</b>.</p>
//                     <p>Your login details are:</p>
//                     <ul>
//                       <li><b>Email:</b> ${email}</li>
//                       <li><b>Temporary Password:</b> ${tempPassword}</li>
//                     </ul>
//                     <p style="text-align: center; margin: 30px 0;">
//                       <a href="${loginLink}" style="background-color: #007bff; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">Login Now</a>
//                     </p>
//                     <p>Please change your password after first login for security purposes.</p>
//                     <p>Welcome aboard!<br/>Skate & Play Admin Team</p>
//                   </td>
//                 </tr>
//                 <tr>
//                   <td style="text-align: center; background-color: #f1f1f1; padding: 10px; font-size: 12px; color: #888;">
//                     &copy; 2025 Skate & Play. All rights reserved.
//                   </td>
//                 </tr>
//               </table>
//             </td>
//           </tr>
//         </table>
//       </body>
//       </html>
//     `;

//     const mailOptions = {
//       from: process.env.SMTP_USER,
//       to: email,
//       subject: "You're Invited to Skate & Play Admin Portal",
//       html: htmlTemplate,
//     };

//     await transporter.sendMail(mailOptions);

//     res.json({ message: "Staff added successfully. Invitation email sent." });
//   } catch (error) {
   
//     res.status(500).json({ error: "Failed to add staff" });
//   }
// });


router.post("/addstaff", async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: "Name, email, and role are required" });
    }

    // Check if email already exists
    const [existing] = await db.query("SELECT id FROM staff WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Insert staff into database with empty password for now
    const [result] = await db.query(
      "INSERT INTO staff (name, email,  role) VALUES (?, ?,?)",
      [name, email, role]
    );

    const insertedId = result.insertId;

    // Generate password setup link
     const encodedId = Buffer.from(insertedId.toString()).toString('base64');
    const encodedEmail = Buffer.from(email).toString('base64');
    const resetBase = process.env.REACT_LINK_BASE || 'http://localhost:3000';
    const setupLink = `${resetBase}/admin/reset-password?id=${encodedId}&email=${encodedEmail}`;


    // Setup nodemailer
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    // HTML email template with "Set Up Your Account" link
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Welcome to Skate & Play</title>
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
                    <p>Hi ${name},</p>
                    <p>You have been invited to join the Skate & Play admin portal as <b>${role == 1 ? "Admin" : "Staff"}</b>.</p>
                    <p>Click the button below to set your account password:</p>
                    <p style="text-align: center; margin: 30px 0;">
                      <a href="${setupLink}" target="_blank" style="background-color: #f19d39; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-size: 16px;">
                        Set Up Your Account
                      </a>
                    </p>
                    <p>Welcome aboard!<br/>Skate & Play Admin Team</p>
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
      from: process.env.SMTP_USER,
      to: email,
      subject: "Set Up Your Skate & Play Admin Account",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "Staff added successfully. Setup email sent." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add staff" });
  }
});


// Update staff status
router.put("/update-status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (typeof status === "undefined") {
    return res.status(400).json({ message: "Status is required" });
  }

  try {
    const [result] = await db.query(
      "UPDATE staff SET status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    res.json({ message: "Status updated successfully", id, status });
  } catch (error) {
   
    res.status(500).json({ message: "Failed to update status" });
  }
});

// Get staff details by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [staff] = await db.query("SELECT * FROM staff WHERE id = ?", [id]);
    if (staff.length === 0) return res.status(404).json({ error: "Staff not found" });
    res.json(staff[0]);
  } catch (error) {
    
    res.status(500).json({ error: "Failed to fetch staff" });
  }
});


// Update staff details
router.put("/updatestaff/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, role } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const [result] = await db.query(
      "UPDATE staff SET name = ?, email = ?, role = ? WHERE id = ?",
      [name, email, role, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ message: "Staff updated successfully" });
  } catch (error) {
   
    res.status(500).json({ error: "Failed to update staff" });
  }
});


// Delete staff by ID
router.delete("/delete-staff/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query("DELETE FROM staff WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ message: "Staff deleted successfully" });
  } catch (error) {
   
    res.status(500).json({ error: "Failed to delete staff" });
  }
});




module.exports = router;
