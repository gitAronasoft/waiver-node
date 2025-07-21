// utils/time.js
const moment = require('moment-timezone');

const EST_TIMEZONE = "America/New_York";

function getCurrentESTTime(format = "YYYY-MM-DD HH:mm:ss") {
  return moment().tz(EST_TIMEZONE).format(format);
}

function convertToEST(date, format = "YYYY-MM-DD HH:mm:ss") {
  return moment(date).tz(EST_TIMEZONE).format(format);
}

module.exports = { getCurrentESTTime, convertToEST };
