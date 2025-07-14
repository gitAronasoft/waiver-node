const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// ✅ Send OTP to existing customer
router.post('/send-otp', (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  // Check if customer exists
  const checkQuery = 'SELECT * FROM customers WHERE cell_phone = ?';
  db.query(checkQuery, [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Store OTP in DB
    const insertQuery = 'INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)';
    db.query(insertQuery, [phone, otp, expiresAt], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      console.log(`✅ OTP for ${phone} is: ${otp}`); // Replace with SMS service in production

      //return res.json({ message: 'OTP sent successfully' });
      return res.json({ message: `✅ OTP for ${phone} is: ${otp}` });
    });
  });
});

// ✅ Verify OTP
router.post('/verify-otp', (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ message: 'Phone and OTP are required' });
  }

  // Get latest OTP for this phone
  const query = 'SELECT * FROM otps WHERE phone = ? ORDER BY created_at DESC LIMIT 1';
  db.query(query, [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length === 0) {
      return res.status(400).json({ message: 'No OTP found for this phone' });
    }

    const savedOtp = results[0];

    if (savedOtp.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > new Date(savedOtp.expires_at)) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // Delete used OTP
    // db.query('DELETE FROM otps WHERE id = ?', [savedOtp.id]);

    return res.json({ message: 'OTP verified successfully', authenticated: true });
  });
});

module.exports = router;
