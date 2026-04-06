const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../config/auth');

module.exports = () => {
  // Get all meals for a group (accessible to all group members)
  router.get('/', authMiddleware, async (req, res) => {
    const { groupId } = req.query;
    
    try {
      // Check if user is a member of the group
      const { data: isMember, error: memberCheckError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', req.userId)
        .single();
      
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }
      
      // Get all meals with participants
      const { data: meals, error: mealsError } = await supabase
        .from('meals')
        .select(`
          *,
          payer:users!meals_payer_id_fkey(name)
        `)
        .eq('group_id', groupId)
        .order('date', { ascending: false });
      
      if (mealsError) throw mealsError;
      
      // Get participants for each meal
      const formattedMeals = [];
      for (const meal of meals || []) {
        const { data: participants, error: participantsError } = await supabase
          .from('meal_participants')
          .select(`
            friend_id,
            share_amount,
            users!inner(name)
          `)
          .eq('meal_id', meal.id);
        
        if (participantsError) throw participantsError;
        
        formattedMeals.push({
          id: meal.id,
          date: meal.date,
          meal_type: meal.meal_type,
          payer_id: meal.payer_id,
          payer_name: meal.payer?.name,
          total_amount: meal.total_amount,
          split_type: meal.split_type,
          participant_names: participants?.map(p => p.users.name).join(','),
          shares: participants?.map(p => p.share_amount).join(',')
        });
      }
      
      res.json(formattedMeals);
    } catch (error) {
      console.error('Error in GET /meals:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a new meal (any group member can add)
  router.post('/', authMiddleware, async (req, res) => {
    const { date, meal_type, payer_id, total_amount, split_type, participants, group_id } = req.body;
    
    if (!date || !meal_type || !payer_id || !total_amount || !participants || participants.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
      // Check if user is a member of the group
      const { data: isMember, error: memberCheckError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group_id)
        .eq('user_id', req.userId)
        .single();
      
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }
      
      // Verify that payer is a member of the group
      const { data: payerMember, error: payerCheckError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group_id)
        .eq('user_id', payer_id)
        .single();
      
      if (!payerMember) {
        return res.status(400).json({ error: 'Payer must be a member of the group' });
      }
      
      // Calculate shares
      let shareAmounts = [];
      if (split_type === 'equal') {
        const equalShare = total_amount / participants.length;
        shareAmounts = participants.map(() => equalShare);
      } else {
        shareAmounts = participants.map(p => p.amount);
      }
      
      // Insert meal
      const { data: meal, error: mealError } = await supabase
        .from('meals')
        .insert([{
          date,
          meal_type,
          payer_id,
          total_amount,
          split_type: split_type || 'equal',
          user_id: req.userId,
          group_id
        }])
        .select()
        .single();
      
      if (mealError) throw mealError;
      
      // Insert participants
      const participantsData = participants.map((p, idx) => ({
        meal_id: meal.id,
        friend_id: typeof p === 'object' ? p.friend_id : p,
        share_amount: shareAmounts[idx]
      }));
      
      const { error: participantsError } = await supabase
        .from('meal_participants')
        .insert(participantsData);
      
      if (participantsError) throw participantsError;
      
      res.json({ id: meal.id, message: 'Meal added successfully' });
    } catch (error) {
      console.error('Error in POST /meals:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a meal (only the user who added it can delete)
  router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    
    try {
      const { error } = await supabase
        .from('meals')
        .delete()
        .eq('id', id)
        .eq('user_id', req.userId);
      
      if (error) throw error;
      
      res.json({ message: 'Meal deleted' });
    } catch (error) {
      console.error('Error in DELETE /meals/:id:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};