const express = require('express');
const bodyParser = require('body-parser');
const path = require("path");
const cors = require('cors');
const waiverRoutes = require('./routes/waiverRoutes');
const authRoutes = require('./routes/authRoutes');
const staffRoutes = require('./routes/staffRoutes');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(bodyParser.json());

// Allow serving uploaded images
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// Routes
app.use('/waivers', waiverRoutes);


app.use('/auth', authRoutes);


app.use('/staff', staffRoutes);





app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
