const axios = require('axios');
require('dotenv').config();

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const LIST_ID = process.env.MAILCHIMP_LIST_ID;
const DATACENTER = process.env.MAILCHIMP_DC;

/**
 * Add a user to Mailchimp list with additional fields
 * @param {string} email
 * @param {string} phone
 * @param {string} first_name
 * @param {string} last_name
 * @param {string} dob
 * @param {string} city
 * @param {string} address
 */
const addToMailchimp = async (email, phone, first_name, last_name, dob, city, address) => {
  try {
    const response = await axios.post(
      `https://${DATACENTER}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`,
      {
        email_address: email,
        status: "subscribed",
        merge_fields: {
          PHONE: phone,
          FNAME: first_name,
          LNAME: last_name,
          DOB: dob,
          CITY: city,
          ADDRESS: address
        },
        tags: ["waiver-visit", new Date().toISOString().split('T')[0]]
      },
      {
        auth: {
          username: "anystring", // Mailchimp requires this, use any string
          password: MAILCHIMP_API_KEY
        }
      }
    );

    console.log("✅ Mailchimp success:", response.data.id);
  } catch (err) {
    if (err.response && err.response.status === 400) {
      console.log("Mailchimp Error:", err.response.data.detail);
    } else {
      console.error("Mailchimp Sync Failed:", err.message);
    }
  }
};

module.exports = addToMailchimp;
