const bcrypt = require('bcrypt');
const db = require('../db/connection'); // ✅ pool.promise()
require('dotenv').config();

const name = 'Admin User';
const email = 'joe@gmail.com';
const plainPassword = 'Arona1@1';

(async () => {
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Insert admin user
    const query = 'INSERT INTO staff (name, email, password) VALUES (?, ?, ?)';
    const [result] = await db.query(query, [name, email, hashedPassword]);


    process.exit(0);
  } catch (err) {
 
    process.exit(1);
  }
})();
