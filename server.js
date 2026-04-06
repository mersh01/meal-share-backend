const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes (no db parameter needed)
const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const balanceRoutes = require('./routes/balances');
const mealRoutes = require('./routes/meals');
const settlementRoutes = require('./routes/settlements');

// Use routes
app.use('/api/auth', authRoutes());
app.use('/api/groups', groupRoutes());
app.use('/api/balances', balanceRoutes());
app.use('/api/meals', mealRoutes());
app.use('/api/settlements', settlementRoutes());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running with Supabase' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Using Supabase as database`);
});