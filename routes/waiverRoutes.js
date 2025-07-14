const express = require('express');
const router = express.Router();
const addToMailchimp = require('../utils/mailchimp');
const db = require('../db/connection');

// GET all waivers
router.get('/', (req, res) => {
  db.query('SELECT * FROM customers', (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

// POST a new waiver
// router.post('/', (req, res) => {
// const {
//     first_name, last_name, middle_initial,email,dob,age,address,city,province,postal_code, home_phone,
//     cell_phone,work_phone,can_email} = req.body;

//   const sql = `
//     INSERT INTO customers (
//       first_name, last_name, middle_initial, email, dob, age, address, city,
//       province, postal_code, home_phone, cell_phone, work_phone, can_email
//     )
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//   `;

//   const values = [
//     first_name, last_name, middle_initial, email, dob, age, address, city,
//     province, postal_code, home_phone, cell_phone, work_phone, can_email
//   ];

//   db.query(sql, values, (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });

//     res.status(201).json({
//       message: 'Customer created successfully',
//       customer_id: results.insertId
//     });
//   });
// });

router.post('/', (req, res) => {
  const {
    first_name, last_name, middle_initial, email, dob, age, address, city,
    province, postal_code, home_phone, cell_phone, work_phone, can_email,
    minors
  } = req.body;

  // ✅ Step 1: Check for duplicate phone number
  const checkSql = `SELECT * FROM customers WHERE cell_phone = ?`;
  db.query(checkSql, [cell_phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length > 0) {
      return res.status(409).json({ error: 'Phone number already exists' });
    }

    // ✅ Step 2: Insert new customer
    const customerSql = `
      INSERT INTO customers (
        first_name, last_name, middle_initial, email, dob, age, address, city,
        province, postal_code, home_phone, cell_phone, work_phone, can_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const customerValues = [
      first_name, last_name, middle_initial, email, dob, age, address, city,
      province, postal_code, home_phone, cell_phone, work_phone, can_email
    ];

    db.query(customerSql, customerValues, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const customerId = result.insertId;

      // ✅ Step 3: Insert minors (if any)
      const insertMinors = () => {
        if (Array.isArray(minors) && minors.length > 0) {
          const minorSql = `
            INSERT INTO minors (customer_id, first_name, last_name, dob)
            VALUES ?
          `;
          const minorValues = minors.map(minor => [
            customerId,
            minor.first_name,
            minor.last_name,
            minor.dob,
          ]);
          return new Promise((resolve, reject) => {
            db.query(minorSql, [minorValues], (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        }
        return Promise.resolve();
      };

      // ✅ Step 4: Generate and store OTP, return it from the promise
      const sendOtp = () => {
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

        const insertOtpSql = `INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)`;
        return new Promise((resolve, reject) => {
          db.query(insertOtpSql, [cell_phone, otp, expiresAt], (err) => {
            if (err) return reject(err);
            console.log(`✅ OTP for ${cell_phone} is: ${otp}`);
            resolve(otp); // Return OTP here
          });
        });
      };

      // ✅ Step 5: Execute all steps
      insertMinors()
        .then(() => sendOtp())
           .then((otp) => {
          // ✅ Add to Mailchimp before sending response
          return addToMailchimp(email,cell_phone,first_name,last_name,dob,city,address)
            .then(() => otp)
            .catch((err) => {
              console.error("Mailchimp error:", err.message); // continue even if Mailchimp fails
              return otp;
            });
        })
        .then((otp) => {
          res.status(201).json({
            message: 'Customer created and OTP sent successfully',
            customer_id: customerId,
            otp: otp // Send OTP back in response
          });
        })
        .catch((err) => {
          console.error(err);
          res.status(500).json({ error: 'Error saving customer or minors or sending OTP' });
        });
    });
  });
});


// GET /api/waivers/customer-info?phone=XXXXXXXXXX
// router.get('/customer-info', (req, res) => {
//   const { phone } = req.query;

//   if (!phone) {
//     return res.status(400).json({ message: "Phone number is required" });
//   }

//   const sql = 'SELECT * FROM customers WHERE cell_phone = ?';
//   db.query(sql, [phone], (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });
//     if (results.length === 0) return res.status(404).json({ message: "Customer not found" });

//     return res.json({ customer: results[0] });
//   });
// });


router.get('/customer-info', (req, res) => {
  const { phone } = req.query;

  if (!phone) return res.status(400).json({ message: "Phone number is required" });

  const customerSql = 'SELECT * FROM customers WHERE cell_phone = ?';
  db.query(customerSql, [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ message: "Customer not found" });

    const customer = results[0];

    const minorsSql = 'SELECT * FROM minors WHERE customer_id = ?';
    db.query(minorsSql, [customer.id], (err2, minors) => {
      if (err2) return res.status(500).json({ error: err2.message });

      return res.json({ customer, minors });
    });
  });
});


router.post("/save-signature-old", (req, res) => {
  const { phone, fullName, date, signature } = req.body;
  console.log(req.body , 'requestdata');

  if (!signature || !phone) {
    return res.status(400).json({ message: "Missing signature or phone" });
  }

  const sql = "UPDATE customers SET signature = ?, status = 1  WHERE cell_phone = ?";
  db.query(sql, [signature, phone], (err, result) => {
    if (err) {
      console.error("Error saving signature:", err);
      return res.status(500).json({ message: "Error saving signature" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({ message: "Signature saved successfully" });
  });
});

router.post("/save-signature", (req, res) => {
  const {
    id, // customer ID
    signature,
    minors = [],
    consented = false
  } = req.body;

  if (!id || !signature) {
    return res.status(400).json({ message: "Missing customer ID or signature" });
  }

  // STEP 1: Update customer with signature
  const updateCustomerSql = `UPDATE customers SET signature = ?, status = 1 WHERE id = ?`;
  db.query(updateCustomerSql, [signature, id], (err) => {
    if (err) return res.status(500).json({ message: "Error updating customer", error: err.message });

    // STEP 2: Fetch existing minors
    db.query("SELECT id FROM minors WHERE customer_id = ?", [id], (err2, dbMinors) => {
      if (err2) return res.status(500).json({ message: "Error fetching minors", error: err2.message });

      const dbMinorIds = dbMinors.map((m) => m.id);

      // Update status for all existing minors
      const existingMinors = minors.filter((m) => !m.isNew);
      const updateStatusPromises = existingMinors.map((minor) => {
        return new Promise((resolve, reject) => {
          db.query(
            "UPDATE minors SET status = ? WHERE id = ?",
            [minor.checked ? 1 : 0, minor.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });

      // Insert new minors
      const newMinors = minors.filter((m) => m.isNew && m.checked);

      const insertNewMinors = () => {
        if (newMinors.length === 0) return Promise.resolve();

        const insertValues = newMinors.map((m) => [
          id,
          m.first_name,
          m.last_name,
          m.dob,
          1 // status = 1
        ]);

        const insertSql = "INSERT INTO minors (customer_id, first_name, last_name, dob, status) VALUES ?";
        return new Promise((resolve, reject) => {
          db.query(insertSql, [insertValues], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      };

      // Continue after updates
      Promise.all(updateStatusPromises)
        .then(insertNewMinors)
        .then(() => {
          // STEP 3: Insert waiver form
          const formSql = `
            INSERT INTO waiver_forms (user_id, signature_image)
            VALUES (?, ?)
          `;
          db.query(formSql, [id, signature], (err5) => {
            if (err5) return res.status(500).json({ message: "Error saving waiver form", error: err5.message });

            return res.json({ message: "Signature and waiver saved successfully" });
          });
        })
        .catch((err) => {
          return res.status(500).json({ message: "Error processing minors", error: err.message });
        });
    });
  });
});



router.post("/accept-rules", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: "Missing user ID" });

  const updateSql = `
    UPDATE waiver_forms 
    SET rules_accepted = 1, completed = 1 
    WHERE user_id = ?
    ORDER BY id DESC 
    LIMIT 1
  `;

  db.query(updateSql, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Failed to update waiver form", error: err.message });
    }
    return res.json({ message: "Waiver form updated successfully" });
  });
});



router.post("/update-customer", (req, res) => {
  const {
    id, // customer ID
    first_name, last_name, middle_initial, email, dob, age,
    address, city, province, postal_code, home_phone, cell_phone,
    work_phone, can_email,
    minors = [] // array of minors from frontend
  } = req.body;

  if (!id) return res.status(400).json({ message: "Missing customer ID" });

  const updateCustomerSql = `
    UPDATE customers SET 
      first_name = ?, last_name = ?, middle_initial = ?, email = ?, dob = ?, age = ?, 
      address = ?, city = ?, province = ?, postal_code = ?, 
      home_phone = ?, cell_phone = ?, work_phone = ?, can_email = ?
    WHERE id = ?
  `;

  const values = [
    first_name, last_name, middle_initial, email, dob, age,
    address, city, province, postal_code,
    home_phone, cell_phone, work_phone, can_email ? 1 : 0,
    id
  ];

  db.query(updateCustomerSql, values, (err) => {
    if (err) return res.status(500).json({ error: err.message });

    // Step 2: Fetch existing minors for this customer
    db.query("SELECT id FROM minors WHERE customer_id = ?", [id], (err2, dbMinors) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const dbMinorIds = dbMinors.map((m) => m.id);

      // Step 3: Update status for all existing minors
      const existingMinorsToUpdate = minors.filter((m) => !m.isNew);

      const statusUpdatePromises = existingMinorsToUpdate.map((minor) => {
        return new Promise((resolve, reject) => {
          db.query(
            "UPDATE minors SET status = ? WHERE id = ?",
            [minor.checked ? 1 : 0, minor.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });

      // Step 4: After updating statuses, insert new minors
      Promise.all(statusUpdatePromises)
        .then(() => {
          const newMinors = minors.filter((m) => m.isNew && m.checked);

          if (newMinors.length > 0) {
            const insertValues = newMinors.map((m) => [
              id,
              m.first_name,
              m.last_name,
              m.dob
            ]);

            const insertSql = "INSERT INTO minors (customer_id, first_name, last_name, dob) VALUES ?";
            db.query(insertSql, [insertValues], (err4) => {
              if (err4) return res.status(500).json({ error: err4.message });

              return res.json({ message: "Customer and minors updated successfully" });
            });
          } else {
            return res.json({ message: "Customer and minors updated successfully (no new minors)" });
          }
        })
        .catch((err) => {
          return res.status(500).json({ error: err.message });
        });
    });
  });
});



// router.post("/update-customer", (req, res) => {
//   const {
//     id, // assuming customer ID is included in formData
//     first_name, last_name, middle_initial, email, dob, age,
//     address, city, province, postal_code, home_phone, cell_phone,
//     work_phone, can_email,
//     minors = [] // array from frontend
//   } = req.body;

//   console.log(req.body);

//   if (!id) return res.status(400).json({ message: "Missing customer ID" });

//   const updateCustomerSql = `
//     UPDATE customers SET 
//       first_name = ?, last_name = ?, middle_initial = ?, email = ?, dob = ?, age = ?, 
//       address = ?, city = ?, province = ?, postal_code = ?, 
//       home_phone = ?, cell_phone = ?, work_phone = ?, can_email = ?
//     WHERE id = ?
//   `;

//   const values = [
//     first_name, last_name, middle_initial, email, dob, age,
//     address, city, province, postal_code,
//     home_phone, cell_phone, work_phone, can_email ? 1 : 0,
//     id
//   ];

//   db.query(updateCustomerSql, values, (err) => {
//     if (err) return res.status(500).json({ error: err.message });

//     // Step 2: Fetch existing minors for this customer
//     db.query("SELECT id FROM minors WHERE customer_id = ?", [id], (err2, dbMinors) => {
//       if (err2) return res.status(500).json({ error: err2.message });

//       const dbMinorIds = dbMinors.map((m) => m.id);

//       // Find which minors to keep, delete, and insert
//       const checkedExistingMinors = minors.filter((m) => !m.isNew && m.checked);
//       const uncheckedMinors = dbMinorIds.filter((dbId) => {
//         return !checkedExistingMinors.find((m) => m.id === dbId);
//       });

//       // // Delete unchecked minors
//       // if (uncheckedMinors.length > 0) {
//       //   db.query("DELETE FROM minors WHERE id IN (?)", [uncheckedMinors], (err3) => {
//       //     if (err3) return res.status(500).json({ error: err3.message });
//       //   });
//       // }

//       // Set status = 0 for unchecked minors
//         if (uncheckedMinors.length > 0) {
//           db.query("UPDATE minors SET status = 0 WHERE id IN (?)", [uncheckedMinors], (err3) => {
//             if (err3) return res.status(500).json({ error: err3.message });
//           });
//         }

//       // Insert new minors
//       const newMinors = minors.filter((m) => m.isNew && m.checked);

//       if (newMinors.length > 0) {
//         const insertValues = newMinors.map((m) => [
//           id,
//           m.first_name,
//           m.last_name,
//           m.dob
//         ]);

//         const insertSql = "INSERT INTO minors (customer_id, first_name, last_name, dob) VALUES ?";
//         db.query(insertSql, [insertValues], (err4) => {
//           if (err4) return res.status(500).json({ error: err4.message });

//           return res.json({ message: "Customer and minors updated successfully" });
//         });
//       } else {
//         return res.json({ message: "Customer and minors updated successfully (no new minors)" });
//       }
//     });
//   });
// });


// GET /api/customers/getminors
router.get('/getminors', (req, res) => {
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ message: "Phone number is required" });
  }

  // Query customer based on phone number
  const customerSql = 'SELECT * FROM customers WHERE cell_phone = ?';
  db.query(customerSql, [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ message: "Customer not found" });

    const customer = results[0];

    // Fetch minors for the customer where status = 1
    const minorsSql = 'SELECT * FROM minors WHERE customer_id = ? AND status = 1';
    db.query(minorsSql, [customer.id], (err2, minors) => {
      if (err2) return res.status(500).json({ error: err2.message });

      return res.json({ ...customer, minors });
    });
  });
});


// GET /api/waivers - Fetch unverified customers + their minors
// router.get('/getAllCustomers', (req, res) => {
//   const customerSql = 'SELECT * FROM customers WHERE status = 0 ORDER BY created_at DESC';

//   db.query(customerSql, (err, customerResults) => {
//     if (err) {
//       console.error("Error fetching customers:", err);
//       return res.status(500).json({ message: "Server error" });
//     }

//     if (customerResults.length === 0) {
//       return res.json([]); // No waivers yet
//     }

//     // Counter for when all minors are fetched
//     let completed = 0;

//     customerResults.forEach((customer, index) => {
//       const minorsSql = 'SELECT * FROM minors WHERE customer_id = ? AND status = 1';

//       db.query(minorsSql, [customer.id], (err2, minorsResults) => {
//         if (err2) {
//           console.error("Error fetching minors:", err2);
//           return res.status(500).json({ message: "Server error" });
//         }

//         customerResults[index].minors = minorsResults;
//         completed++;

//         if (completed === customerResults.length) {
//           return res.json(customerResults);
//         }
//       });
//     });
//   });
// });

router.get('/getAllCustomers', (req, res) => {
const customerSql = `
  SELECT 
    c.*, 
    w.id AS waiver_id,
    w.signed_at, 
    w.rules_accepted, 
    w.completed, 
    w.verified_by_staff
  FROM customers c
  INNER JOIN waiver_forms w ON c.id = w.user_id
  WHERE 
     w.completed = 1 
    AND w.rules_accepted = 1
    AND w.verified_by_staff = 0
    AND DATE(w.signed_at) = CURDATE()  -- ✅ Only today
  ORDER BY c.created_at DESC
`;

  db.query(customerSql, (err, customerResults) => {
    if (err) {
      console.error("Error fetching customers:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (customerResults.length === 0) {
      return res.json([]); // No waivers to verify
    }

    // Fetch minors for each customer
    let completed = 0;

    customerResults.forEach((customer, index) => {
      const minorsSql = 'SELECT * FROM minors WHERE customer_id = ? AND status = 1';

      db.query(minorsSql, [customer.id], (err2, minorsResults) => {
        if (err2) {
          console.error("Error fetching minors:", err2);
          return res.status(500).json({ message: "Server error" });
        }

        customerResults[index].minors = minorsResults;
        completed++;

        if (completed === customerResults.length) {
          return res.json(customerResults);
        }
      });
    });
  });
});


// POST /api/waivers/verify/:id - Mark customer as verified
// router.post('/verify/:id', (req, res) => {
//   const customerId = req.params.id;
//   const updateSql = 'UPDATE customers SET status = 1 WHERE id = ?';

//   db.query(updateSql, [customerId], (err, result) => {
//     if (err) {
//       console.error("Error verifying customer:", err);
//       return res.status(500).json({ message: 'Server error' });
//     }

//     return res.json({ message: 'Customer verified successfully' });
//   });
// });

router.post('/verify/:waiverId', (req, res) => {
  const waiverId = req.params.waiverId;

  const updateWaiverSql = `
    UPDATE waiver_forms 
    SET verified_by_staff = 1 
    WHERE id = ?
  `;

  db.query(updateWaiverSql, [waiverId], (err) => {
    if (err) {
      console.error('Verification failed:', err);
      return res.status(500).json({ error: err.message });
    }
    return res.json({ message: 'Waiver verified successfully' });
  });
});



// GET all waivers (confirmed + unconfirmed) with minors
router.get('/getallwaivers', (req, res) => {
  const customerSql = `
    SELECT 
      c.*, 
      w.id AS waiver_id,
      w.signed_at,
      w.verified_by_staff AS status
    FROM customers c
    JOIN waiver_forms w ON w.user_id = c.id
    ORDER BY w.signed_at DESC
  `;

  db.query(customerSql, (err, customerResults) => {
    if (err) {
      console.error('Error fetching waivers:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    if (customerResults.length === 0) return res.json([]);

    let completed = 0;
    customerResults.forEach((customer, index) => {
      const minorsSql = 'SELECT * FROM minors WHERE customer_id = ? AND status = 1';
      db.query(minorsSql, [customer.id], (err2, minors) => {
        customerResults[index].minors = err2 ? [] : minors;
        completed++;
        if (completed === customerResults.length) {
          res.json(customerResults);
        }
      });
    });
  });
});


// router.get('/waiver-details/:id', (req, res) => {
//   const customerId = req.params.id;

//   const customerSql = 'SELECT * FROM customers WHERE id = ?';
//   db.query(customerSql, [customerId], (err, customerRes) => {
//     if (err) return res.status(500).json({ error: err.message });
//     if (customerRes.length === 0) return res.status(404).json({ message: 'Customer not found' });

//     const customer = customerRes[0];

//     const minorsSql = 'SELECT * FROM minors WHERE customer_id = ? AND status = 1';
//     db.query(minorsSql, [customerId], (err2, minors) => {
//       if (err2) return res.status(500).json({ error: err2.message });

//       res.json({ customer, minors });
//     });
//   });
// });

router.get('/waiver-details/:id', (req, res) => {
  const customerId = req.params.id;

  const customerSql = 'SELECT * FROM customers WHERE id = ?';
  const minorsSql = 'SELECT * FROM minors WHERE customer_id = ? AND status = 1';
  const historySql = `
    SELECT 
      c.first_name, c.last_name, 
      DATE_FORMAT(w.signed_at, '%b %d, %Y at %h:%i %p') AS date,
      s.name AS markedBy
    FROM waiver_forms w
    JOIN customers c ON c.id = w.user_id
    LEFT JOIN staff s ON s.id = w.staff_id
    WHERE w.user_id = ?
    ORDER BY w.signed_at DESC
  `;

  db.query(customerSql, [customerId], (err, customerRes) => {
    if (err) return res.status(500).json({ error: err.message });
    if (customerRes.length === 0) return res.status(404).json({ message: 'Customer not found' });

    const customer = customerRes[0];

    db.query(minorsSql, [customerId], (err2, minorsRes) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.query(historySql, [customerId], (err3, waiverRows) => {
        if (err3) return res.status(500).json({ error: err3.message });

        const waiverHistory = waiverRows.map(row => ({
          name: `${row.first_name} ${row.last_name}`,
          date: row.date,
          markedBy: row.markedBy || ""
        }));

        res.json({
          customer,
          minors: minorsRes,
          waiverHistory
        });
      });
    });
  });
});


module.exports = router;
