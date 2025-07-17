const express = require('express');
const router = express.Router();
const addToMailchimp = require('../utils/mailchimp');
const db = require('../db/connection'); // Uses pool.promise()

// ✅ GET all customers
router.get('/', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM customers');
    res.json(results);
  } catch (err) {
    console.error('DB Error:', err);
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
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await db.query('INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)', [cell_phone, otp, expiresAt]);
    console.log(`✅ OTP for ${cell_phone} is: ${otp}`);

    // Step 5: Add to Mailchimp (ignore failure)
    try {
     await addToMailchimp(email, cell_phone, first_name, last_name, dob, city, address);

    } catch (mailchimpErr) {
      console.error('Mailchimp error:', mailchimpErr.message);
    }

    res.status(201).json({ message: 'Customer created and OTP sent', customer_id: customerId, otp });
  } catch (err) {
    console.error('Error creating customer:', err);
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
router.post('/save-signature', async (req, res) => {
  const { id, signature, minors = [] } = req.body;
  if (!id || !signature) return res.status(400).json({ message: 'Missing ID or signature' });

  try {
    await db.query('UPDATE customers SET signature = ?, status = 1 WHERE id = ?', [signature, id]);

    const existing = minors.filter(m => !m.isNew);
    for (let m of existing) {
      await db.query('UPDATE minors SET status = ? WHERE id = ?', [m.checked ? 1 : 0, m.id]);
    }

    const newMinors = minors.filter(m => m.isNew && m.checked);
    if (newMinors.length > 0) {
      const insertValues = newMinors.map(m => [id, m.first_name, m.last_name, m.dob, 1]);
      await db.query('INSERT INTO minors (customer_id, first_name, last_name, dob, status) VALUES ?', [insertValues]);
    }

    await db.query('INSERT INTO waiver_forms (user_id, signature_image) VALUES (?, ?)', [id, signature]);
    res.json({ message: 'Signature and waiver saved successfully' });
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

module.exports = router;
