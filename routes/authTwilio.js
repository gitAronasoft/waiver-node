const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const twilio = require('twilio');

// Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Send OTP to existing customer
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  try {
    // Check if customer exists
    const [results] = await db.query('SELECT * FROM customers WHERE cell_phone = ?', [phone]);
    if (results.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Store OTP in DB
    await db.query('INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)', [phone, otp, expiresAt]);

    // Send OTP via Twilio Messaging Service
    await client.messages.create({
      body: `Your OTP is ${otp}. It will expire in 5 minutes.`,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      to: phone // Ensure phone is in +countrycode format
    });

    console.log(`✅ OTP sent to ${phone}: ${otp}`);
    return res.json({ message: `OTP sent successfully` });
  } catch (error) {
    console.error('Error in /send-otp:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
