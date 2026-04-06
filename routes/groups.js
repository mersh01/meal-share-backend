const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../config/auth');

module.exports = () => {
  // Get all groups for logged-in user
  router.get('/', authMiddleware, async (req, res) => {
    try {
      // Get groups where user is owner
      const { data: ownedGroups, error: ownedError } = await supabase
        .from('groups')
        .select(`
          id,
          name,
          user_id,
          created_at
        `)
        .eq('user_id', req.userId);
      
      if (ownedError) throw ownedError;
      
      // Get groups where user is member (not owner)
      const { data: memberGroups, error: memberError } = await supabase
        .from('group_members')
        .select(`
          group_id,
          groups!inner(
            id,
            name,
            user_id,
            created_at
          )
        `)
        .eq('user_id', req.userId);
      
      if (memberError) throw memberError;
      
      // Get creator names for all groups
      const allGroups = [];
      
      // Process owned groups
      for (const group of ownedGroups || []) {
        // Get creator name
        const { data: creator, error: creatorError } = await supabase
          .from('users')
          .select('name')
          .eq('id', group.user_id)
          .single();
        
        // Get member count
        const { count, error: countError } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);
        
        allGroups.push({
          id: group.id,
          name: group.name,
          created_by: group.user_id,
          creator_name: creator?.name || 'Unknown',
          member_count: count || 0,
          is_owner: true
        });
      }
      
      // Process member groups (where user is not owner)
      for (const mg of memberGroups || []) {
        const group = mg.groups;
        
        // Skip if user is owner (already added)
        if (group.user_id === req.userId) continue;
        
        // Get creator name
        const { data: creator, error: creatorError } = await supabase
          .from('users')
          .select('name')
          .eq('id', group.user_id)
          .single();
        
        // Get member count
        const { count, error: countError } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);
        
        allGroups.push({
          id: group.id,
          name: group.name,
          created_by: group.user_id,
          creator_name: creator?.name || 'Unknown',
          member_count: count || 0,
          is_owner: false
        });
      }
      
      res.json(allGroups);
    } catch (error) {
      console.error('Error in GET /groups:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new group
  router.post('/', authMiddleware, async (req, res) => {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    try {
      // Check if group name already exists for this user
      const { data: existing, error: checkError } = await supabase
        .from('groups')
        .select('id')
        .eq('user_id', req.userId)
        .eq('name', name)
        .maybeSingle();
      
      if (existing) {
        return res.status(400).json({ error: 'You already have a group with this name' });
      }
      
      // Create group
      const { data: group, error: createError } = await supabase
        .from('groups')
        .insert([{ name, user_id: req.userId }])
        .select()
        .single();
      
      if (createError) throw createError;
      
      // Get user's name
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.userId)
        .single();
      
      if (userError) throw userError;
      
      // Add creator as member
      const { error: memberError } = await supabase
        .from('group_members')
        .insert([{ group_id: group.id, user_id: req.userId, member_name: user.name }]);
      
      if (memberError) throw memberError;
      
      res.json({ 
        id: group.id, 
        name, 
        is_owner: true,
        message: 'Group created successfully' 
      });
    } catch (error) {
      console.error('Error in POST /groups:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get group members
  router.get('/:groupId/members', authMiddleware, async (req, res) => {
    const { groupId } = req.params;
    
    try {
      // Check if user is a member
      const { data: isMember, error: memberCheckError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', req.userId)
        .maybeSingle();
      
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }
      
      // Get all members with their emails
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select(`
          id,
          group_id,
          user_id,
          member_name,
          added_at
        `)
        .eq('group_id', groupId);
      
      if (membersError) throw membersError;
      
      // Get emails for each member
      const membersWithEmail = [];
      for (const member of members || []) {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('email')
          .eq('id', member.user_id)
          .single();
        
        membersWithEmail.push({
          id: member.id,
          group_id: member.group_id,
          user_id: member.user_id,
          member_name: member.member_name,
          email: user?.email || '',
          added_at: member.added_at
        });
      }
      
      res.json(membersWithEmail);
    } catch (error) {
      console.error('Error in GET /groups/:groupId/members:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add member to group (only group owner can add)
  router.post('/:groupId/members', authMiddleware, async (req, res) => {
    const { groupId } = req.params;
    const { email } = req.body;
    
    try {
      // Check if user is owner
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('user_id')
        .eq('id', groupId)
        .single();
      
      if (groupError || !group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      if (group.user_id !== req.userId) {
        return res.status(403).json({ error: 'Only the group owner can add members' });
      }
      
      // Find user by email
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name')
        .eq('email', email)
        .maybeSingle();
      
      if (userError || !user) {
        return res.status(404).json({ error: 'User not found. They need to register first.' });
      }
      
      // Check if already a member
      const { data: existing, error: existingError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (existing) {
        return res.status(400).json({ error: 'User is already a member of this group' });
      }
      
      // Add member
      const { error: insertError } = await supabase
        .from('group_members')
        .insert([{ group_id: groupId, user_id: user.id, member_name: user.name }]);
      
      if (insertError) throw insertError;
      
      res.json({ 
        user_id: user.id,
        member_name: user.name,
        message: 'Member added successfully' 
      });
    } catch (error) {
      console.error('Error in POST /groups/:groupId/members:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove member from group (only group owner can remove)
  router.delete('/:groupId/members/:memberId', authMiddleware, async (req, res) => {
    const { groupId, memberId } = req.params;
    
    try {
      // Check if user is owner
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('user_id')
        .eq('id', groupId)
        .single();
      
      if (groupError || !group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      if (group.user_id !== req.userId) {
        return res.status(403).json({ error: 'Only the group owner can remove members' });
      }
      
      // Cannot remove yourself
      if (parseInt(memberId) === req.userId) {
        return res.status(400).json({ error: 'You cannot remove yourself as the group owner' });
      }
      
      // Remove member
      const { error: deleteError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', memberId);
      
      if (deleteError) throw deleteError;
      
      res.json({ message: 'Member removed successfully' });
    } catch (error) {
      console.error('Error in DELETE /groups/:groupId/members/:memberId:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete group (only group owner can delete)
  router.delete('/:groupId', authMiddleware, async (req, res) => {
    const { groupId } = req.params;
    
    try {
      const { error: deleteError } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId)
        .eq('user_id', req.userId);
      
      if (deleteError) throw deleteError;
      
      res.json({ message: 'Group deleted successfully' });
    } catch (error) {
      console.error('Error in DELETE /groups/:groupId:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};