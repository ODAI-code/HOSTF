const Database = require("better-sqlite3");
const path = require("path");

// Store the database in the HOSTFind project folder.
const db = new Database(
  path.join(__dirname, "hostfind.db")
);

db.pragma("foreign_keys = ON");

// Store payment transactions.
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    hostel_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    student_email TEXT NOT NULL,
    student_phone TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GHS',
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'success', 'failed')),
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_payments_hostel_status
  ON payments (hostel_id, status);

  CREATE TABLE IF NOT EXISTS hostel_private_details (
    hostel_id TEXT PRIMARY KEY,
    manager_name TEXT NOT NULL DEFAULT '',
    manager_phone TEXT NOT NULL DEFAULT '',
    manager_whatsapp TEXT NOT NULL DEFAULT '',
    manager_email TEXT NOT NULL DEFAULT '',
    momo_network TEXT NOT NULL DEFAULT '',
    momo_name TEXT NOT NULL DEFAULT '',
    momo_number TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    bank_account_name TEXT NOT NULL DEFAULT '',
    bank_account_number TEXT NOT NULL DEFAULT ''
  );




  -- Store public hostel information for dashboard management.
  CREATE TABLE IF NOT EXISTS hostels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,
    location TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    room_type TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',

    images_json TEXT NOT NULL DEFAULT '[]',
    video TEXT NOT NULL DEFAULT '',
    amenities_json TEXT NOT NULL DEFAULT '[]',

    availability_status TEXT NOT NULL DEFAULT 'not_verified'
      CHECK (
        availability_status IN (
          'available',
          'limited',
          'full',
          'not_verified'
        )
      ),

    availability_message TEXT NOT NULL DEFAULT '',

    rules_json TEXT NOT NULL DEFAULT '[]',
    landmarks TEXT NOT NULL DEFAULT '',
    distance TEXT NOT NULL DEFAULT '',

    is_published INTEGER NOT NULL DEFAULT 1
      CHECK (is_published IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_hostels_location
  ON hostels (location);

  CREATE INDEX IF NOT EXISTS idx_hostels_published
  ON hostels (is_published);
`);

// Add the verification field to existing hostel databases safely.
const hostelColumns = db.prepare("PRAGMA table_info(hostels)").all();

if (!hostelColumns.some(column => column.name === "is_verified")) {
  db.exec(`
    ALTER TABLE hostels
    ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0
    CHECK (is_verified IN (0, 1))
  `);

  console.log("HOSTFind hostel verification field added.");
}


console.log("HOSTFind SQLite database is ready.");

module.exports = db;