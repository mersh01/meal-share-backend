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

  // Add a settlement - ONLY the person who owes money can do this
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
      
      // Calculate current balance to verify user actually owes money
      // Get all meals in the group
      const { data: meals, error: mealsError } = await supabase
        .from('meals')
        .select('id, payer_id')
        .eq('group_id', group_id);
      
      if (mealsError) throw mealsError;
      
      let balance = 0;
      
      if (meals && meals.length > 0) {
        const mealIds = meals.map(m => m.id);
        
        const { data: participants, error: participantsError } = await supabase
          .from('meal_participants')
          .select('meal_id, friend_id, share_amount')
          .in('meal_id', mealIds);
        
        if (participantsError) throw participantsError;
        
        // Calculate balance from meals
        participants?.forEach(participant => {
          if (participant.friend_id === userId) {
            balance -= participant.share_amount;
          }
          const meal = meals.find(m => m.id === participant.meal_id);
          if (meal && meal.payer_id === userId) {
            balance += participant.share_amount;
          }
        });
      }
      
      // Get confirmed settlements
      const { data: settlements, error: settlementsError } = await supabase
        .from('settlements')
        .select('from_friend_id, to_friend_id, amount')
        .eq('group_id', group_id)
        .eq('confirmed', 1);
      
      if (settlementsError) throw settlementsError;
      
      settlements?.forEach(settlement => {
        if (settlement.from_friend_id === userId) {
          balance += settlement.amount;
        }
        if (settlement.to_friend_id === userId) {
          balance -= settlement.amount;
        }
      });
      
      // User should have a negative balance (they owe money)
      if (balance >= 0) {
        return res.status(400).json({ 
          error: 'You do not owe any money. Cannot record a payment.' 
        });
      }
      
      // Check if trying to pay more than owed
      if (amount > -balance + 0.01) {
        return res.status(400).json({ 
          error: `You only owe $${(-balance).toFixed(2)}. Cannot pay $${amount.toFixed(2)}.` 
        });
      }
      
      // Create settlement
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

  return router;
};