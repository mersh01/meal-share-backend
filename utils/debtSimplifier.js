function simplifyDebts(balances) {
  // Separate debtors and creditors
  const debtors = [];
  const creditors = [];
  
  balances.forEach(person => {
    if (person.balance < -0.01) {
      debtors.push({ 
        id: person.id, 
        name: person.name, 
        amount: Math.round((-person.balance) * 100) / 100 
      });
    } else if (person.balance > 0.01) {
      creditors.push({ 
        id: person.id, 
        name: person.name, 
        amount: Math.round(person.balance * 100) / 100 
      });
    }
  });
  
  // Sort by amount (largest first) for efficient matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  
  const transactions = [];
  let i = 0, j = 0;
  
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    
    // Calculate the amount to transfer (minimum of what's owed and what's due)
    const amount = Math.min(debtor.amount, creditor.amount);
    
    if (amount > 0.01) {
      // Check if we already have a transaction between these two people
      const existingTransaction = transactions.find(t => 
        t.from === debtor.id && t.to === creditor.id
      );
      
      if (existingTransaction) {
        // Merge with existing transaction
        existingTransaction.amount = Math.round((existingTransaction.amount + amount) * 100) / 100;
      } else {
        // Add new transaction
        transactions.push({
          from: debtor.id,
          from_name: debtor.name,
          to: creditor.id,
          to_name: creditor.name,
          amount: amount
        });
      }
    }
    
    // Reduce amounts
    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;
    
    // Move to next if settled
    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }
  
  // Final cleanup: ensure no duplicate or circular payments
  const uniqueTransactions = [];
  const paymentMap = new Map();
  
  transactions.forEach(t => {
    const key = `${t.from}-${t.to}`;
    if (paymentMap.has(key)) {
      const existing = paymentMap.get(key);
      existing.amount = Math.round((existing.amount + t.amount) * 100) / 100;
    } else {
      paymentMap.set(key, { ...t });
    }
  });
  
  // Convert map back to array and sort
  const finalTransactions = Array.from(paymentMap.values());
  
  // Verify no one pays more than they owe
  const totalPaid = {};
  finalTransactions.forEach(t => {
    totalPaid[t.from] = (totalPaid[t.from] || 0) + t.amount;
  });
  
  // Get original debt amounts
  const originalDebts = {};
  debtors.forEach(d => {
    originalDebts[d.id] = d.amount;
  });
  
  // Check for overpayment (should not happen with correct algorithm)
  for (const [debtorId, paid] of Object.entries(totalPaid)) {
    const originalOwed = originalDebts[parseInt(debtorId)] || 0;
    if (Math.abs(paid - originalOwed) > 0.01) {
      console.warn(`Warning: ${debtorId} paid ${paid} but owes ${originalOwed}`);
    }
  }
  
  return finalTransactions;
}

module.exports = { simplifyDebts };