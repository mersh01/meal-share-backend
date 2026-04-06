const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/meals.db');

console.log('Resetting all data...');

db.serialize(() => {
  // Drop all tables
  db.run('DROP TABLE IF EXISTS settlements');
  db.run('DROP TABLE IF EXISTS meal_participants');
  db.run('DROP TABLE IF EXISTS meals');
  db.run('DROP TABLE IF EXISTS friends');
  
  console.log('All tables dropped');
  
  // Recreate tables
  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      payer_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      split_type TEXT DEFAULT 'equal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(payer_id) REFERENCES friends(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS meal_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      share_amount REAL NOT NULL,
      confirmed INTEGER DEFAULT 0,
      FOREIGN KEY(meal_id) REFERENCES meals(id) ON DELETE CASCADE,
      FOREIGN KEY(friend_id) REFERENCES friends(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_friend_id INTEGER NOT NULL,
      to_friend_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      confirmed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(from_friend_id) REFERENCES friends(id),
      FOREIGN KEY(to_friend_id) REFERENCES friends(id)
    )
  `);
  
  console.log('Tables recreated successfully');
  console.log('Insert your friends and meals again');
});

db.close();