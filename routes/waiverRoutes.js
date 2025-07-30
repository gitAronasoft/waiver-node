const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const addToMailchimp = require('../utils/mailchimp');
const db = require('../db/connection'); // Uses pool.promise()
const { getCurrentESTTime } = require('../utils/time');
const sendRatingEmail = require('../utils/sendRatingEmail');
const sendRatingSMS = require('../utils/sendRatingSMS');

const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);


// ✅ GET all customers
router.get('/', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM customers');
    res.json(results);
  } catch (err) {
    
    res.status(500).json({ error: 'Database error' });
  }
});

// ✅ POST: Create customer, minors, send OTP
router.post('/', async (req, res) => {
  const {
    first_name, last_name, middle_initial, email, dob, age, address, city,
    province, postal_code, home_phone, cell_phone, work_phone, can_email,
    minors = []
  } = req.body;

  try {
    // Step 1: Check duplicate phone
    const [existing] = await db.query('SELECT * FROM customers WHERE cell_phone = ?', [cell_phone]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Phone number already exists' });
    }

    // Step 2: Insert customer
    const customerSql = `
      INSERT INTO customers (
        first_name, last_name, middle_initial, email, dob, age, address, city,
        province, postal_code, home_phone, cell_phone, work_phone, can_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [customerResult] = await db.query(customerSql, [
      first_name, last_name, middle_initial, email, dob, age, address, city,
      province, postal_code, home_phone, cell_phone, work_phone, can_email ? 1 : 0
    ]);
    const customerId = customerResult.insertId;

    // Step 3: Insert minors
    if (Array.isArray(minors) && minors.length > 0) {
      const minorValues = minors.map(m => [customerId, m.first_name, m.last_name, m.dob]);
      await db.query('INSERT INTO minors (customer_id, first_name, last_name, dob) VALUES ?', [minorValues]);
    }

    // Step 4: Generate OTP
    // const otp = Math.floor(1000 + Math.random() * 9000).toString();
    // const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    // await db.query('INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)', [cell_phone, otp, expiresAt]);
    

      // Step 4: Generate OTP
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
       const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await db.query('INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)', [cell_phone, otp, expiresAt]);

      // ✅ Step 4.1: Send OTP via Twilio
      let formattedPhone = cell_phone;
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+1${cell_phone}`; // or use +91 for India
      }

      try {
        const message = await client.messages.create({
          body: `Your verification code for the Waiver App is ${otp}. It will expire in 5 minutes.`,
          messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
          to: formattedPhone
        });

        // console.log(`✅ OTP sent to ${formattedPhone}. Twilio SID: ${message.sid}`);
      } catch (twilioError) {
        console.error('❌ Twilio SMS error:', twilioError.message);
        // You can optionally fail the request or continue anyway
      }


    // Step 5: Add to Mailchimp (ignore failure)
    try {
     await addToMailchimp(email, cell_phone, first_name, last_name, dob, city, address);

    } catch (mailchimpErr) {
      console.error('Mailchimp error:', mailchimpErr.message);
    }

    res.status(201).json({ message: 'Customer created and OTP sent', customer_id: customerId, otp });
  } catch (err) {
    
    res.status(500).json({ error: 'Error saving customer or minors' });
  }
});

// ✅ GET customer info with minors
router.get('/customer-info', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ message: 'Phone is required' });

  try {
    const [customers] = await db.query('SELECT * FROM customers WHERE cell_phone = ?', [phone]);
    if (customers.length === 0) return res.status(404).json({ message: 'Customer not found' });

    const [minors] = await db.query('SELECT * FROM minors WHERE customer_id = ?', [customers[0].id]);
    res.json({ customer: customers[0], minors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Save Signature
// router.post('/save-signature', async (req, res) => {
//   const { id, signature, minors = [] } = req.body;
//   if (!id || !signature) return res.status(400).json({ message: 'Missing ID or signature' });

//   try {
//     await db.query('UPDATE customers SET signature = ?, status = 1 WHERE id = ?', [signature, id]);

//     const existing = minors.filter(m => !m.isNew);
//     for (let m of existing) {
//       await db.query('UPDATE minors SET status = ? WHERE id = ?', [m.checked ? 1 : 0, m.id]);
//     }

//     const newMinors = minors.filter(m => m.isNew && m.checked);
//     if (newMinors.length > 0) {
//       const insertValues = newMinors.map(m => [id, m.first_name, m.last_name, m.dob, 1]);
//       await db.query('INSERT INTO minors (customer_id, first_name, last_name, dob, status) VALUES ?', [insertValues]);
//     }

//     await db.query('INSERT INTO waiver_forms (user_id, signature_image) VALUES (?, ?)', [id, signature]);
//     res.json({ message: 'Signature and waiver saved successfully' });
//   } catch (err) {
//     res.status(500).json({ message: 'Error saving signature', error: err.message });
//   }
// });



// ✅ Save Signature
// router.post('/save-signature', async (req, res) => {
//   const { id, signature, minors = [] } = req.body;
//   console.log(minors, 'minors');
//   if (!id || !signature) return res.status(400).json({ message: 'Missing ID or signature' });

//   try {
//     await db.query('UPDATE customers SET signature = ?, status = 1 WHERE id = ?', [signature, id]);

//     const existing = minors.filter(m => !m.isNew);
//     for (let m of existing) {
//       await db.query('UPDATE minors SET status = ? WHERE id = ?', [m.checked ? 1 : 0, m.id]);
//     }

//     const newMinors = minors.filter(m => m.isNew && m.checked);
//     if (newMinors.length > 0) {
//       const insertValues = newMinors.map(m => [id, m.first_name, m.last_name, m.dob, 1]);
//       await db.query(
//         'INSERT INTO minors (customer_id, first_name, last_name, dob, status) VALUES ?',
//         [insertValues]
//       );
//     }

//     // Add EST signed_at
//     const signedAtEST = getCurrentESTTime();
//     await db.query(
//       'INSERT INTO waiver_forms (user_id, signature_image, signed_at) VALUES (?, ?, ?)',
//       [id, signature, signedAtEST]
//     );

//     res.json({ message: 'Signature and waiver saved successfully', signed_at: signedAtEST });
//   } catch (err) {
//     res.status(500).json({ message: 'Error saving signature', error: err.message });
//   }
// });


// ✅ Save Signature
// router.post('/save-signature', async (req, res) => {
//   const { id, signature, minors = [] } = req.body;

//   if (!id || !signature)
//     return res.status(400).json({ message: 'Missing ID or signature' });

//   try {
//     await db.query(
//       'UPDATE customers SET signature = ?, status = 1 WHERE id = ?',
//       [signature, id]
//     );

//     // Update existing minors
//     const existing = minors.filter(m => !m.isNew && m.id);
//     for (let m of existing) {
//       await db.query(
//         'UPDATE minors SET status = ?, first_name = ?, last_name = ?, dob = ? WHERE id = ?',
//         [m.checked ? 1 : 0, m.first_name, m.last_name, m.dob, m.id]
//       );
//     }

//     // Insert new minors
//     const newMinors = minors.filter(m => (!m.id || m.isNew) && m.checked);
//     if (newMinors.length > 0) {
//       const insertValues = newMinors.map(m => [
//         id,
//         m.first_name,
//         m.last_name,
//         m.dob,
//         1,
//       ]);
//       await db.query(
//         'INSERT INTO minors (customer_id, first_name, last_name, dob, status) VALUES ?',
//         [insertValues]
//       );
//     }

//     // Save waiver form record
//     const signedAtEST = getCurrentESTTime();
//     await db.query(
//       'INSERT INTO waiver_forms (user_id, signature_image, signed_at) VALUES (?, ?, ?)',
//       [id, signature, signedAtEST]
//     );

//     res.json({
//       message: 'Signature and waiver saved successfully',
//       signed_at: signedAtEST,
//     });
//   } catch (err) {
//     res
//       .status(500)
//       .json({ message: 'Error saving signature', error: err.message });
//   }
// });


router.post('/save-signature', async (req, res) => {
  const { id, signature, minors = [] } = req.body;

  if (!id || !signature)
    return res.status(400).json({ message: 'Missing ID or signature' });

  try {
    // Existing code to save signature and waiver
    await db.query('UPDATE customers SET signature = ?, status = 1 WHERE id = ?', [signature, id]);
    const signedAtEST = getCurrentESTTime();
    await db.query('INSERT INTO waiver_forms (user_id, signature_image, signed_at) VALUES (?, ?, ?)', [id, signature, signedAtEST]);

    // Fetch customer details for automation
    const [customerRows] = await db.query('SELECT * FROM customers WHERE id=?', [id]);
    const customer = customerRows[0];

    // Add to Mailchimp
    // addToMailchimpList(customer.email, customer.first_name, customer.last_name);

    // // Schedule rating email + SMS after 3 hours
    setTimeout(async () => {
      await sendRatingEmail(customer);
      await sendRatingSMS(customer);
    }, 3 * 60 * 60 * 1000); // 3 hours in milliseconds

//     setTimeout(async () => {
//   await sendRatingEmail(customer);
//   // await sendRatingSMS(customer);
// }, 10 * 1000); // 10 seconds


    res.json({
      message: 'Signature and waiver saved successfully',
      signed_at: signedAtEST,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error saving signature', error: err.message });
  }
});

// ✅ Accept rules
router.post('/accept-rules', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'Missing userId' });

  try {
    await db.query(`
      UPDATE waiver_forms
      SET rules_accepted = 1, completed = 1
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `, [userId]);

    res.json({ message: 'Waiver form updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update waiver', error: err.message });
  }
});

// ✅ Update customer and minors
router.post('/update-customer', async (req, res) => {
  const { id, first_name, last_name, middle_initial, email, dob, age, address, city, province, postal_code, home_phone, cell_phone, work_phone, can_email, minors = [] } = req.body;

  if (!id) return res.status(400).json({ message: 'Missing customer ID' });

  try {
    await db.query(`
      UPDATE customers SET 
        first_name=?, last_name=?, middle_initial=?, email=?, dob=?, age=?,
        address=?, city=?, province=?, postal_code=?, home_phone=?, cell_phone=?, work_phone=?, can_email=?
      WHERE id=?
    `, [first_name, last_name, middle_initial, email, dob, age, address, city, province, postal_code, home_phone, cell_phone, work_phone, can_email ? 1 : 0, id]);

    for (let m of minors.filter(m => !m.isNew)) {
      await db.query('UPDATE minors SET status=? WHERE id=?', [m.checked ? 1 : 0, m.id]);
    }

    const newMinors = minors.filter(m => m.isNew && m.checked);
    if (newMinors.length > 0) {
      const insertValues = newMinors.map(m => [id, m.first_name, m.last_name, m.dob]);
      await db.query('INSERT INTO minors (customer_id, first_name, last_name, dob) VALUES ?', [insertValues]);
    }

    res.json({ message: 'Customer and minors updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get minors by phone
router.get('/getminors', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ message: 'Phone required' });

  try {
    const [customers] = await db.query('SELECT * FROM customers WHERE cell_phone = ?', [phone]);
    if (customers.length === 0) return res.status(404).json({ message: 'Customer not found' });

    const [minors] = await db.query('SELECT * FROM minors WHERE customer_id=? AND status=1', [customers[0].id]);
    res.json({ ...customers[0], minors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get waivers for today
router.get('/getAllCustomers', async (req, res) => {
  try {
    const [customers] = await db.query(`
      SELECT c.*, w.id AS waiver_id, w.signed_at, w.rules_accepted, w.completed, w.verified_by_staff
      FROM customers c
      INNER JOIN waiver_forms w ON c.id=w.user_id
      WHERE w.completed=1 AND w.rules_accepted=1 AND w.verified_by_staff=0 AND DATE(w.signed_at)=CURDATE()
      ORDER BY c.created_at DESC
    `);

    for (let c of customers) {
      const [minors] = await db.query('SELECT * FROM minors WHERE customer_id=? AND status=1', [c.id]);
      c.minors = minors;
    }

    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Verify waiver
router.post('/verify/:waiverId', async (req, res) => {
  try {
    await db.query('UPDATE waiver_forms SET verified_by_staff=1 WHERE id=?', [req.params.waiverId]);
    res.json({ message: 'Waiver verified successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all waivers
router.get('/getallwaivers', async (req, res) => {
  try {
    const [waivers] = await db.query(`
      SELECT c.*, w.id AS waiver_id, w.signed_at, w.verified_by_staff AS status
      FROM customers c
      JOIN waiver_forms w ON w.user_id=c.id
      ORDER BY w.signed_at DESC
    `);

    for (let w of waivers) {
      const [minors] = await db.query('SELECT * FROM minors WHERE customer_id=? AND status=1', [w.id]);
      w.minors = minors;
    }

    res.json(waivers);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Waiver details by ID
router.get('/waiver-details/:id', async (req, res) => {
  const customerId = req.params.id;
  try {
    const [customers] = await db.query('SELECT * FROM customers WHERE id=?', [customerId]);
    if (customers.length === 0) return res.status(404).json({ message: 'Customer not found' });

    const [minors] = await db.query('SELECT * FROM minors WHERE customer_id=? AND status=1', [customerId]);
    const [history] = await db.query(`
      SELECT c.first_name, c.last_name, DATE_FORMAT(w.signed_at, '%b %d, %Y at %h:%i %p') AS date,
             s.name AS markedBy, signature_image
      FROM waiver_forms w
      JOIN customers c ON c.id=w.user_id
      LEFT JOIN staff s ON s.id=w.staff_id
      WHERE w.user_id=?
      ORDER BY w.signed_at DESC
    `, [customerId]);

    const waiverHistory = history.map(row => ({
      name: `${row.first_name} ${row.last_name}`,
      date: row.date,
      markedBy: row.markedBy || "",
      signature_image: row.signature_image || ""
    }));

    res.json({ customer: customers[0], minors, waiverHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// In your router file
router.get('/rate/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [customers] = await db.query('SELECT first_name, last_name FROM customers WHERE id=?', [id]);
    if (customers.length === 0) return res.status(404).json({ message: 'Customer not found' });

    res.json({ 
      first_name: customers[0].first_name,
      last_name: customers[0].last_name
     });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/waivers/rate/:id
router.post('/rate/:id', async (req, res) => {
  const { rating } = req.body;
  const { id } = req.params;

  try {
    // Insert new feedback row
    await db.query('INSERT INTO feedback (user_id, rating) VALUES (?, ?)', [id, rating]);
    res.json({ message: 'Rating saved' });
  } catch (error) {
    console.error('Rating save error:', error);
    res.status(500).json({ error: 'Failed to save rating' });
  }
});



// For saving feedback
// router.post('/feedback', async (req, res) => {
//   const { id, rating, message } = req.body;
//   try {
//     await db.query('INSERT INTO feedback (user_id, rating, message) VALUES (?, ?, ?)', [id, rating, message || ""]);
//     res.json({ message: 'Feedback saved successfully' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });


// Update message only
// router.post('/feedback', async (req, res) => {
//   const { id, message } = req.body;
//   try {
//     await db.query(
//       'UPDATE feedback SET message = ? WHERE user_id = ?',
//       [message, id]
//     );
//     res.json({ message: 'Feedback message saved successfully' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });


// router.post('/send-feedback', async (req, res) => {
//   const { id, message } = req.body;
//   try {
//     const [customers] = await db.query('SELECT first_name, email FROM customers WHERE id=?', [id]);
//     if (customers.length === 0) return res.status(404).json({ message: 'Customer not found' });
//     const customer = customers[0];

//    const transporter = nodemailer.createTransport({
//         host: process.env.SMTP_HOST,
//         port: process.env.SMTP_PORT,
//         secure: true,
//         auth: {
//           user: process.env.SMTP_USER,
//           pass: process.env.SMTP_PASS
//         },
//         tls: { rejectUnauthorized: false }
//       });
//     await transporter.sendMail({
//       from: process.env.SMTP_USER,
//       // to: 'info@skate-play.com', // Your support email
//         to: process.env.SMTP_USER,
//       subject: `Customer Feedback - ${customer.first_name}`,
//       text: `Customer: ${customer.first_name} (${customer.email})\n\nFeedback:\n${message}`
//     });

//     res.json({ message: 'Feedback sent successfully' });
//   } catch (err) {
//     console.error('Feedback email error:', err.message);
//     res.status(500).json({ message: 'Failed to send feedback', error: err.message });
//   }
// });

router.post('/feedback', async (req, res) => {
  const { id, issue, staffName, message } = req.body;

  if (!id || !message) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM feedback WHERE user_id = ?',
      [id]
    );

    if (existing.length > 0) {
      // Update existing feedback
      await db.query(
        `UPDATE feedback 
         SET issue = ?, staff_name = ?, message = ?, created_at = CURRENT_TIMESTAMP 
         WHERE user_id = ?`,
        [issue || null, staffName || null, message, id]
      );

      return res.json({ message: "Feedback updated successfully." });
    } else {
      // Insert new feedback
      await db.query(
        'INSERT INTO feedback (user_id, issue, staff_name, message) VALUES (?, ?, ?, ?)',
        [id, issue || null, staffName || null, message]
      );

      return res.json({ message: "Feedback saved successfully." });
    }
  } catch (err) {
    console.error("Error saving/updating feedback:", err);
    return res.status(500).json({ error: "Failed to process feedback." });
  }
});

router.post('/send-feedback', async (req, res) => {
  const { id, message } = req.body;
  try {
    const [customers] = await db.query('SELECT first_name, last_name, email FROM customers WHERE id=?', [id]);
    if (customers.length === 0) return res.status(404).json({ message: 'Customer not found' });
    const customer = customers[0];

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
        <title>Customer Feedback</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 0; margin: 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background-color: #002244; color: white; padding: 20px; text-align: center;">
                    <h2>Customer Feedback</h2>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px;">
                    <p><strong>Customer:</strong> ${customer.first_name} ${customer.last_name}</p>
                    <p><strong>Email:</strong> ${customer.email}</p>
                    <p><strong>Feedback:</strong></p>
                    <p style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; color: #333;">${message}</p>
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
      to: process.env.SMTP_USER, // or 'info@skate-play.com'
      subject: `Customer Feedback - ${customer.first_name} ${customer.last_name}`,
      html: htmlTemplate
    });

    res.json({ message: 'Feedback sent successfully' });
  } catch (err) {
    console.error('Feedback email error:', err.message);
    res.status(500).json({ message: 'Failed to send feedback', error: err.message });
  }
});


// router.post('/send-feedback', async (req, res) => {
//   const { id, message } = req.body;
//   try {
//     const [customers] = await db.query('SELECT first_name, email FROM customers WHERE id=?', [id]);
//     if (customers.length === 0) return res.status(404).json({ message: 'Customer not found' });
//     const customer = customers[0];

//    const transporter = nodemailer.createTransport({
//         host: process.env.SMTP_HOST,
//         port: process.env.SMTP_PORT,
//         secure: true,
//         auth: {
//           user: process.env.SMTP_USER,
//           pass: process.env.SMTP_PASS
//         },
//         tls: { rejectUnauthorized: false }
//       });
//     await transporter.sendMail({
//       from: process.env.SMTP_USER,
//       // to: 'info@skate-play.com', // Your support email
//         to: process.env.SMTP_USER,
//       subject: `Customer Feedback - ${customer.first_name}`,
//       text: `Customer: ${customer.first_name} (${customer.email})\n\nFeedback:\n${message}`
//     });

//     res.json({ message: 'Feedback sent successfully' });
//   } catch (err) {
//     console.error('Feedback email error:', err.message);
//     res.status(500).json({ message: 'Failed to send feedback', error: err.message });
//   }
// });



// backend/routes/feedback.js
router.get('/getfeedback', async (req, res) => {
  try {
    const [feedback] = await db.query(`
      SELECT f.*, c.first_name, c.last_name 
      FROM feedback f 
      JOIN customers c ON f.user_id = c.id 
      ORDER BY f.created_at DESC
    `);
    res.json(feedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch feedback' });
  }
});

module.exports = router;
