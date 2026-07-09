const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "portal.db");
const raw = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function seedDefaultUsers() {
  const any = await get("SELECT id FROM users LIMIT 1");
  if (any) return;

  const superHash = await bcrypt.hash("Admin@123", 10);
  const accountsHash = await bcrypt.hash("Accounts@123", 10);
  const teamHash = await bcrypt.hash("Team@123", 10);

  await run("INSERT INTO users (username, password_hash, role, team_name) VALUES (?, ?, ?, ?)", [
    "superadmin",
    superHash,
    "SUPER_ADMIN",
    null
  ]);
  await run("INSERT INTO users (username, password_hash, role, team_name) VALUES (?, ?, ?, ?)", [
    "accounts",
    accountsHash,
    "ACCOUNTS",
    null
  ]);
  await run("INSERT INTO users (username, password_hash, role, team_name) VALUES (?, ?, ?, ?)", [
    "team1",
    teamHash,
    "TEAM",
    "TEAM_1"
  ]);
}

async function init() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    team_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_name TEXT NOT NULL,
    campaign_code TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    team_name TEXT NOT NULL,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS campaign_creators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    creator_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    creator_mobile TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    address TEXT,
    pan TEXT,
    email TEXT,
    invoice_no TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    payment_mode TEXT,
    poc_name TEXT,
    other_references TEXT,
    account_name TEXT,
    bank_name TEXT,
    account_no TEXT,
    ifsc_code TEXT,
    branch TEXT,
    upi_id TEXT,
    signature_type TEXT,
    signature_value TEXT,
    total_amount REAL NOT NULL,
    locked_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    pdf_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  )`);

  const creatorColumns = await all("PRAGMA table_info(campaign_creators)");
  if (!creatorColumns.some((c) => c.name === "amount")) {
    await run("ALTER TABLE campaign_creators ADD COLUMN amount REAL NOT NULL DEFAULT 0");
  }

  const invoiceColumns = await all("PRAGMA table_info(invoices)");
  if (!invoiceColumns.some((c) => c.name === "locked_amount")) {
    await run("ALTER TABLE invoices ADD COLUMN locked_amount REAL NOT NULL DEFAULT 0");
    await run("UPDATE invoices SET locked_amount = total_amount WHERE locked_amount = 0");
  }

  await run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id)
  )`);

  await seedDefaultUsers();
}

module.exports = {
  init,
  run,
  get,
  all
};