const axios = require('axios');
require('dotenv').config();

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const LIST_ID = process.env.MAILCHIMP_LIST_ID;
const DATACENTER = process.env.MAILCHIMP_DC;

const addToMailchimp = async (email, phone) => {
  try {
    const response = await axios.post(
      `https://${DATACENTER}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`,
      {
        email_address: email,
        status: "subscribed",
        merge_fields: {
           PHONE: cell_phone,
          FNAME: first_name,
          LNAME: last_name,
          DOB: dob,
          CITY: city,
          ADDRESS:address
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

    console.log("Mailchimp success:", response.data.id);
  } catch (err) {
    if (err.response && err.response.status === 400) {
      console.log("Mailchimp Error:", err.response.data.detail);
    } else {
      console.error("Mailchimp Sync Failed:", err.message);
    }
  }
};

module.exports = addToMailchimp;
