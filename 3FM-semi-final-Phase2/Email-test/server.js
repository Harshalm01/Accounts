const express = require('express');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const notifyRoutes = require('./routes/notify');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/notify', notifyRoutes);

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📧 Email: ${process.env.EMAIL_USER}`);
    console.log(`⏱️  OTP expires in: ${process.env.OTP_EXPIRY_MINUTES || 5} minutes\n`);
});
