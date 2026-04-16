const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../config/auth');

module.exports = () => {
  router.get('/', authMiddleware, async (req, res) => {
    const { groupId } = req.query;
    const userId = req.userId;
    
    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }
    
    try {
      // Verify user is a member of this group
      const { data: access, error: accessError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();
      
      if (accessError || !access) {
        return res.status(403).json({ error: 'You do not have access to this group' });
      }
      
      // Get all members
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select(`
          user_id,
          users!inner(
            name,
            phone,
            account_number,
            email
          )
        `)
        .eq('group_id', groupId)
        .order('users(name)');
      
      if (membersError) throw membersError;
      
      const formattedMembers = members.map(m => ({
        user_id: m.user_id,
        name: m.users.name,
        phone: m.users.phone,
        account_number: m.users.account_number,
        email: m.users.email
      }));
      
      // ============================================
      // PART 1: Calculate BALANCES FROM MEALS ONLY
      // ============================================
      let mealBalances = {};
      formattedMembers.forEach(member => {
        mealBalances[member.user_id] = 0;
      });
      
      const { data: meals, error: mealsError } = await supabase
        .from('meals')
        .select('id, payer_id, total_amount')
        .eq('group_id', groupId);
      
      if (mealsError) throw mealsError;
      
      if (meals && meals.length > 0) {
        const mealIds = meals.map(m => m.id);
        
        const { data: participants, error: participantsError } = await supabase
          .from('meal_participants')
          .select('meal_id, friend_id, share_amount')
          .in('meal_id', mealIds);
        
        if (participantsError) throw participantsError;
        
        const mealMap = {};
        meals.forEach(meal => {
          mealMap[meal.id] = meal;
        });
        
        participants?.forEach(participant => {
          const meal = mealMap[participant.meal_id];
          if (meal) {
            // Participant owes their share
            mealBalances[participant.friend_id] -= participant.share_amount;
            // Payer is owed that share
            mealBalances[meal.payer_id] += participant.share_amount;
          }
        });
      }
      
      // ============================================
      // PART 2: Get SETTLEMENTS (pending and confirmed)
      // ============================================
      const { data: settlements, error: settlementsError } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', groupId);
      
      if (settlementsError) throw settlementsError;
      
      const pendingSettlements = settlements?.filter(s => s.confirmed === 0) || [];
      const confirmedSettlements = settlements?.filter(s => s.confirmed === 1) || [];
      
      // ============================================
      // PART 3: Calculate FINAL BALANCES (meal + confirmed settlements)
      // ============================================
      let finalBalances = { ...mealBalances };
      
      // Only confirmed settlements affect final balance
      confirmedSettlements.forEach(settlement => {
        finalBalances[settlement.from_friend_id] += settlement.amount;
        finalBalances[settlement.to_friend_id] -= settlement.amount;
      });
      
      // Round final balances
      const roundedFinalBalances = {};
      Object.keys(finalBalances).forEach(key => {
        roundedFinalBalances[key] = Math.round(finalBalances[key] * 100) / 100;
      });
      
      // Prepare balance array for display
      const balanceArray = formattedMembers.map(member => ({
        id: member.user_id,
        name: member.name,
        balance: roundedFinalBalances[member.user_id] || 0,
        phone: member.phone,
        account_number: member.account_number,
        email: member.email
      }));
      
      // ============================================
      // PART 4: Calculate SUGGESTED PAYMENTS
      // Only show debts that are NOT already covered by pending settlements
      // ============================================
      const currentUserBalance = balanceArray.find(b => b.id === userId);
      let suggestions = [];
      
      if (currentUserBalance && currentUserBalance.balance < -0.01) {
        const userOwes = -currentUserBalance.balance;
        const creditors = balanceArray.filter(p => p.balance > 0.01);
        
        let remainingOwe = userOwes;
        for (const creditor of creditors) {
          if (remainingOwe <= 0) break;
          
          // Check if there's already a pending settlement for this debt
          const hasPending = pendingSettlements.some(p => 
            p.from_friend_id === userId && p.to_friend_id === creditor.id
          );
          
          if (!hasPending) {
            const amount = Math.min(remainingOwe, creditor.balance);
            if (amount > 0.01) {
              suggestions.push({
                from: userId,
                from_name: currentUserBalance.name,
                to: creditor.id,
                to_name: creditor.name,
                amount: Math.round(amount * 100) / 100,
                to_phone: creditor.phone,
                to_account: creditor.account_number,
                to_email: creditor.email
              });
              remainingOwe -= amount;
            }
          }
        }
      }
      
      // ============================================
      // PART 5: Format PENDING SETTLEMENTS for display
      // ============================================
      const pendingDisplay = pendingSettlements
        .filter(p => p.from_friend_id === userId || p.to_friend_id === userId)
        .map(p => {
          const fromMember = formattedMembers.find(m => m.user_id === p.from_friend_id);
          const toMember = formattedMembers.find(m => m.user_id === p.to_friend_id);
          return {
            from: p.from_friend_id,
            to: p.to_friend_id,
            amount: p.amount,
            from_name: fromMember?.name || 'Unknown',
            to_name: toMember?.name || 'Unknown',
            from_phone: fromMember?.phone,
            to_phone: toMember?.phone,
            isPayer: p.from_friend_id === userId,
            isReceiver: p.to_friend_id === userId
          };
        });
      
      res.json({
        balances: balanceArray,
        suggestedPayments: suggestions,
        pendingSettlements: pendingDisplay
      });
      
    } catch (error) {
      console.error('Error in GET /balances:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};