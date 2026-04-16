const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../config/auth');

module.exports = () => {
  // Get all settlements for a group
  router.get('/', authMiddleware, async (req, res) => {
    const { groupId } = req.query;
    
    try {
      const { data: settlements, error } = await supabase
        .from('settlements')
        .select(`
          *,
          from_user:users!settlements_from_friend_id_fkey(name),
          to_user:users!settlements_to_friend_id_fkey(name)
        `)
        .eq('group_id', groupId)
        .order('date', { ascending: false });
      
      if (error) throw error;
      
      const formatted = settlements?.map(s => ({
        id: s.id,
        from_friend_id: s.from_friend_id,
        to_friend_id: s.to_friend_id,
        amount: s.amount,
        date: s.date,
        confirmed: s.confirmed,
        from_name: s.from_user?.name,
        to_name: s.to_user?.name
      })) || [];
      
      res.json(formatted);
    } catch (error) {
      console.error('Error in GET /settlements:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a settlement - Allow manual payments (no balance check)
  router.post('/', authMiddleware, async (req, res) => {
    const { from_friend_id, to_friend_id, amount, date, group_id } = req.body;
    const userId = req.userId;
    
    if (!from_friend_id || !to_friend_id || !amount || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify that the current user is the one making the payment
    if (from_friend_id !== userId) {
      return res.status(403).json({ 
        error: 'You can only record payments that YOU are making' 
      });
    }
    
    // Validate amount is positive
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    
    try {
      // Verify user is a member of the group
      const { data: isMember, error: memberError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group_id)
        .eq('user_id', userId)
        .single();
      
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }
      
      // Verify receiver is a member of the group
      const { data: toMember, error: toMemberError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group_id)
        .eq('user_id', to_friend_id)
        .single();
      
      if (!toMember) {
        return res.status(400).json({ error: 'Receiver must be a member of this group' });
      }
      
      // Check if there's already a pending settlement between these two
      const { data: existingPending, error: pendingError } = await supabase
        .from('settlements')
        .select('id')
        .eq('group_id', group_id)
        .eq('from_friend_id', from_friend_id)
        .eq('to_friend_id', to_friend_id)
        .eq('confirmed', 0)
        .maybeSingle();
      
      if (existingPending) {
        return res.status(400).json({ error: 'A pending settlement already exists between you and this person. Please wait for confirmation or delete the existing one.' });
      }
      
      // Create settlement (NO BALANCE CHECK - allows manual payments)
      const { data: settlement, error: insertError } = await supabase
        .from('settlements')
        .insert([{
          from_friend_id,
          to_friend_id,
          amount,
          date,
          confirmed: 0,
          user_id: userId,
          group_id
        }])
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      res.json({ 
        id: settlement.id, 
        message: 'Payment recorded. Waiting for receiver confirmation.' 
      });
    } catch (error) {
      console.error('Error in POST /settlements:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Confirm a settlement - ONLY the person who is owed money can do this
  router.put('/:id/confirm', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;
    
    try {
      // Get settlement details
      const { data: settlement, error: findError } = await supabase
        .from('settlements')
        .select('from_friend_id, to_friend_id, confirmed')
        .eq('id', id)
        .single();
      
      if (findError || !settlement) {
        return res.status(404).json({ error: 'Settlement not found' });
      }
      
      if (settlement.confirmed === 1) {
        return res.status(400).json({ error: 'Settlement already confirmed' });
      }
      
      // Verify that the current user is the receiver
      if (settlement.to_friend_id !== userId) {
        return res.status(403).json({ 
          error: 'Only the person receiving the payment can confirm it' 
        });
      }
      
      // Confirm the settlement
      const { error: updateError } = await supabase
        .from('settlements')
        .update({ confirmed: 1 })
        .eq('id', id);
      
      if (updateError) throw updateError;
      
      res.json({ message: 'Payment confirmed successfully!' });
    } catch (error) {
      console.error('Error in PUT /settlements/:id/confirm:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a settlement (for corrections)
  router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;
    
    try {
      // Get settlement details
      const { data: settlement, error: findError } = await supabase
        .from('settlements')
        .select('from_friend_id, to_friend_id, confirmed')
        .eq('id', id)
        .single();
      
      if (findError || !settlement) {
        return res.status(404).json({ error: 'Settlement not found' });
      }
      
      // Allow deletion if:
      // 1. User is the payer and settlement is pending, OR
      // 2. User is the receiver and settlement is pending, OR
      // 3. User is the group owner (you can add this later)
      if (settlement.from_friend_id !== userId && settlement.to_friend_id !== userId) {
        return res.status(403).json({ error: 'You cannot delete this settlement' });
      }
      
      // Delete the settlement
      const { error: deleteError } = await supabase
        .from('settlements')
        .delete()
        .eq('id', id);
      
      if (deleteError) throw deleteError;
      
      res.json({ message: 'Settlement deleted successfully' });
    } catch (error) {
      console.error('Error in DELETE /settlements/:id:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};