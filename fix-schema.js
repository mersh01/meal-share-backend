const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/meals.db');

console.log('Fixing database schema...');

db.serialize(() => {
  // Check and add missing columns to meals table
  db.run(`ALTER TABLE meals ADD COLUMN user_id INTEGER`, (err) => {
    if (err) {
      console.log('Note: user_id column may already exist in meals');
    } else {
      console.log('✓ Added user_id column to meals');
    }
  });
  
  db.run(`ALTER TABLE meals ADD COLUMN group_id INTEGER`, (err) => {
    if (err) {
      console.log('Note: group_id column may already exist in meals');
    } else {
      console.log('✓ Added group_id column to meals');
    }
  });

  // Check and add missing columns to settlements table
  db.run(`ALTER TABLE settlements ADD COLUMN user_id INTEGER`, (err) => {
    if (err) {
      console.log('Note: user_id column may already exist in settlements');
    } else {
      console.log('✓ Added user_id column to settlements');
    }
  });
  
  db.run(`ALTER TABLE settlements ADD COLUMN group_id INTEGER`, (err) => {
    if (err) {
      console.log('Note: group_id column may already exist in settlements');
    } else {
      console.log('✓ Added group_id column to settlements');
    }
  });

  // Check and add missing columns to friends table
  db.run(`ALTER TABLE friends ADD COLUMN user_id INTEGER`, (err) => {
    if (err) {
      console.log('Note: user_id column may already exist in friends');
    } else {
      console.log('✓ Added user_id column to friends');
    }
  });
  
  db.run(`ALTER TABLE friends ADD COLUMN friend_user_id INTEGER`, (err) => {
    if (err) {
      console.log('Note: friend_user_id column may already exist in friends');
    } else {
      console.log('✓ Added friend_user_id column to friends');
    }
  });

  console.log('Schema update complete!');
});

db.close();