const bcrypt = require('bcrypt');
const db = require('../db/connection'); // ✅ Fix path here

const name = 'Admin User';
const email = 'admin@example.com';
const plainPassword = 'Arona1@1';

bcrypt.hash(plainPassword, 10, (hashErr, hashedPassword) => {
  if (hashErr) {
    console.error('Error hashing password:', hashErr);
    process.exit(1);
  }

  const query = 'INSERT INTO staff (name, email, password) VALUES (?, ?, ?)';
  db.query(query, [name, email, hashedPassword], (err, result) => {
    if (err) {
      console.error('Error inserting staff:', err);
      process.exit(1);
    } else {
      console.log('Staff inserted with ID:', result.insertId);
      process.exit(0);
    }
  });
});
