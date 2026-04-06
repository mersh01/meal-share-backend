const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../config/auth');

module.exports = () => {
  // Get all friends for logged-in user
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const { data: friends, error } = await supabase
        .from('friends')
        .select(`
          *,
          users!friends_friend_user_id_fkey(id, email, name)
        `)
        .eq('user_id', req.userId)
        .order('users(name)');
      
      if (error) throw error;
      
      const formattedFriends = friends?.map(f => ({
        id: f.id,
        friend_user_id: f.friend_user_id,
        name: f.users?.name,
        email: f.users?.email
      })) || [];
      
      res.json(formattedFriends);
    } catch (error) {
      console.error('Error in GET /friends:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search for users to add as friends (by email or name)
  router.get('/search', authMiddleware, async (req, res) => {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }
    
    try {
      // Search for users
      const { data: users, error } = await supabase
        .from('users')
        .select('id, email, name')
        .neq('id', req.userId)
        .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(10);
      
      if (error) throw error;
      
      // Get existing friends
      const { data: existingFriends, error: friendsError } = await supabase
        .from('friends')
        .select('friend_user_id')
        .eq('user_id', req.userId);
      
      if (friendsError) throw friendsError;
      
      const existingIds = existingFriends?.map(f => f.friend_user_id) || [];
      const availableUsers = users?.filter(user => !existingIds.includes(user.id)) || [];
      
      res.json(availableUsers);
    } catch (error) {
      console.error('Error in GET /friends/search:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a friend by user ID
  router.post('/add', authMiddleware, async (req, res) => {
    const { friend_user_id } = req.body;
    
    if (!friend_user_id) {
      return res.status(400).json({ error: 'Friend user ID is required' });
    }
    
    try {
      // Check if already friends
      const { data: existing, error: checkError } = await supabase
        .from('friends')
        .select('id')
        .eq('user_id', req.userId)
        .eq('friend_user_id', friend_user_id)
        .single();
      
      if (existing) {
        return res.status(400).json({ error: 'Already friends with this user' });
      }
      
      // Get friend's name
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('name')
        .eq('id', friend_user_id)
        .single();
      
      if (userError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Add to friends list
      const { data: newFriend, error: insertError } = await supabase
        .from('friends')
        .insert([{
          user_id: req.userId,
          friend_user_id: friend_user_id,
          name: user.name
        }])
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      res.json({
        id: newFriend.id,
        friend_user_id: friend_user_id,
        name: user.name,
        message: 'Friend added successfully'
      });
    } catch (error) {
      console.error('Error in POST /friends/add:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a friend
  router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    
    try {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', id)
        .eq('user_id', req.userId);
      
      if (error) throw error;
      
      res.json({ message: 'Friend removed' });
    } catch (error) {
      console.error('Error in DELETE /friends/:id:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};