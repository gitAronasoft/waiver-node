const bcrypt = require('bcrypt');
const db = require('../db/connection'); // ✅ pool.promise()
require('dotenv').config();

const name = 'Admin User';
const email = 'admin@example.com';
const plainPassword = 'Arona1@1';

(async () => {
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Insert admin user
    const query = 'INSERT INTO staff (name, email, password) VALUES (?, ?, ?)';
    const [result] = await db.query(query, [name, email, hashedPassword]);

    console.log('✅ Staff inserted with ID:', result.insertId);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error inserting staff:', err.message);
    process.exit(1);
  }
})();
