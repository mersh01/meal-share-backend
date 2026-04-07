const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const supabase = require('../config/supabase');
const { generateToken, authMiddleware } = require('../config/auth');

module.exports = () => {
  // Register new user
  router.post('/register', async (req, res) => {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    try {
      // Check if user exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();
      
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const { data: user, error: createError } = await supabase
        .from('users')
        .insert([{ email, password_hash: hashedPassword, name }])
        .select()
        .single();
      
      if (createError) throw createError;
      
      // Generate token
      const token = generateToken(user.id, user.email);
      
      res.json({
        message: 'Registration successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Login user
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    try {
      const { data: user, error: findError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (findError || !user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const token = generateToken(user.id, user.email);
      
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get current user
  router.get('/me', authMiddleware, async (req, res) => {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('id', req.userId)
        .single();
      
      if (error) throw error;
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Change password
  router.post('/change-password', authMiddleware, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.userId;
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required' });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    try {
      // Get user's current password hash
      const { data: user, error: findError } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', userId)
        .single();
      
      if (findError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: hashedNewPassword })
        .eq('id', userId);
      
      if (updateError) throw updateError;
      
      res.json({ message: 'Password changed successfully! Please login again.' });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/logout', authMiddleware, (req, res) => {
    res.json({ message: 'Logged out successfully' });
  });

  return router;
};