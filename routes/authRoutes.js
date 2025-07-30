const express = require('express');
const router = express.Router();
 require("dotenv").config();
const db = require('../db/connection'); // pool.promise() from your db config
const twilio = require('twilio');

// Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Send OTP to existing customer
// router.post('/send-otp', async (req, res) => {
//   const { phone } = req.body;

//   if (!phone) {
//     return res.status(400).json({ message: 'Phone number is required' });
//   }

//   try {
//     // Check if customer exists
//     const [results] = await db.query('SELECT * FROM customers WHERE cell_phone = ?', [phone]);
//     if (results.length === 0) {
//       return res.status(404).json({ message: 'Customer not found' });
//     }

//     // Generate 4-digit OTP
//     const otp = Math.floor(1000 + Math.random() * 9000).toString();
//     const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

//     // Store OTP in DB
//     await db.query('INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)', [phone, otp, expiresAt]);


//     //return res.json({ message: `✅ OTP sent successfully`, otp });
//     return res.json({ message: `✅ OTP sent successfully: ${otp}` }); 
//   } catch (error) {

//     return res.status(500).json({ error: 'Internal server error' });
//   }
// });

router.post('/send-otp', async (req, res) => {
  // Just in case
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  try {
    const [results] = await db.query('SELECT * FROM customers WHERE cell_phone = ?', [phone]);
    if (results.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.query('INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)', [phone, otp, expiresAt]);

    let formattedPhone = phone;
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+1${phone}`; // Change +1 to your country code
    }

    const message = await client.messages.create({
      body: `Your OTP for completing the waiver is ${otp}. It is valid for 5 minutes.`,

      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      to: formattedPhone
    });

    // console.log(`✅ OTP sent to ${formattedPhone}. Twilio SID: ${message.sid}`);
    return res.json({ message: `OTP sent successfully` });
  } catch (error) {
    console.error('❌ Error in /send-otp:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// ✅ Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;


  if (!phone || !otp) {
    return res.status(400).json({ message: 'Phone and OTP are required' });
  }

  try {
    // Get latest OTP for this phone
    const [results] = await db.query(
      'SELECT * FROM otps WHERE phone = ? ORDER BY created_at DESC LIMIT 1',
      [phone]
    );

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

    // Optionally delete OTP after verification
    // await db.query('DELETE FROM otps WHERE id = ?', [savedOtp.id]);

    return res.json({ message: 'OTP verified successfully', authenticated: true });
  } catch (error) {
  
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
