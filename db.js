const dns = require("dns");
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const path = require("path");
const bcrypt = require("bcryptjs");

const isPostgres = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let pool;
let raw;

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { ...options, family: 4 }, callback);
}

if (isPostgres) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: {
      rejectUnauthorized: false
    },
    lookup: ipv4Lookup
  });
} else {
  const sqlite3 = require("sqlite3").verbose();
  const runtimeDir = process.env.VERCEL ? "/tmp" : __dirname;
  const dbPath = process.env.DATABASE_PATH || path.join(runtimeDir, "portal.db");
  raw = new sqlite3.Database(dbPath);
}

function convertQuery(sql) {
  if (!isPostgres) return sql;
  
  // 1. Translate SQLite column types/definitions to PostgreSQL equivalents
  let converted = sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
    .replace(/REAL/gi, "DOUBLE PRECISION")
    .replace(/TEXT DEFAULT CURRENT_TIMESTAMP/gi, "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    .replace(/expire INTEGER/gi, "expire BIGINT");
    
  // 2. Convert ? placeholders to PostgreSQL $1, $2, $3...
  let count = 1;
  converted = converted.replace(/\?/g, () => `$${count++}`);
  
  return converted;
}

async function run(sql, params = []) {
  if (isPostgres) {
    let converted = convertQuery(sql);
    const isInsert = sql.trim().toUpperCase().startsWith("INSERT");
    // Only append RETURNING id for tables that actually have an id column.
    // The sessions table uses 'sid' as its primary key — appending RETURNING id
    // would cause "column id does not exist" and break every session.save() call.
    const targetsSessionsTable = /INTO\s+sessions\b/i.test(sql);
    if (isInsert && !converted.toUpperCase().includes("RETURNING") && !targetsSessionsTable) {
      converted += " RETURNING id";
    }
    const res = await pool.query(converted, params);
    const lastID = isInsert && !targetsSessionsTable ? (res.rows[0]?.id || null) : null;
    return { lastID, changes: res.rowCount };
  } else {
    return new Promise((resolve, reject) => {
      raw.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

async function get(sql, params = []) {
  if (isPostgres) {
    const converted = convertQuery(sql);
    const res = await pool.query(converted, params);
    return res.rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      raw.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }
}

async function all(sql, params = []) {
  if (isPostgres) {
    const converted = convertQuery(sql);
    const res = await pool.query(converted, params);
    return res.rows || [];
  } else {
    return new Promise((resolve, reject) => {
      raw.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }
}

async function seedDefaultUsers() {
  const superHash = await bcrypt.hash("Admin@123", 10);
  const accountsHash = await bcrypt.hash("Accounts@123", 10);
  const teamHash = await bcrypt.hash("Team@123", 10);

  const defaultUsers = [
    { username: 'superadmin', hash: superHash, role: 'SUPER_ADMIN', team_name: null },
    { username: 'accounts', hash: accountsHash, role: 'ACCOUNTS', team_name: null },
    { username: 'Moiz Shaikh', hash: teamHash, role: 'HEAD', team_name: 'Jhalak Moiz' },
    { username: 'Jhalak Tated', hash: teamHash, role: 'HEAD', team_name: 'Jhalak Moiz' },
    { username: 'Harshal Mehta', hash: teamHash, role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Khushee Bagtharia', hash: teamHash, role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Disha Jain', hash: teamHash, role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Atharva Shinde', hash: teamHash, role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Om Sawant', hash: teamHash, role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Nidhi Parsekar', hash: teamHash, role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Riti Tated', hash: teamHash, role: 'HEAD', team_name: 'Team Riti' },
    { username: 'Nirav Pipalia', hash: teamHash, role: 'TEAM', team_name: 'Team Riti' },
    { username: 'Navneet Dehad', hash: teamHash, role: 'TEAM', team_name: 'Team Riti' },
    { username: 'Bhumisha Rajgar', hash: teamHash, role: 'HEAD', team_name: 'Team Bhumisha' },
    { username: 'Navya Jain', hash: teamHash, role: 'TEAM', team_name: 'Team Bhumisha' },
    { username: 'Tauqir Khan', hash: teamHash, role: 'TEAM', team_name: 'Team Bhumisha' },
    { username: 'Krisha Modi', hash: teamHash, role: 'TEAM', team_name: 'Team Bhumisha' },
    { username: 'Deepak Lokhande', hash: accountsHash, role: 'ACCOUNTS', team_name: null },
    { username: 'Priya Vasani', hash: teamHash, role: 'HEAD', team_name: 'Team Priya' },
    { username: 'Dhruven Gosia', hash: teamHash, role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Siddhi Gala', hash: teamHash, role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Priyal Gada', hash: teamHash, role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Rishita Soni', hash: teamHash, role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Deep Shah', hash: superHash, role: 'SUPER_ADMIN', team_name: null },
    { username: 'Rahil Shah', hash: superHash, role: 'SUPER_ADMIN', team_name: null },
    { username: 'Shubh Shah', hash: superHash, role: 'SUPER_ADMIN', team_name: null },
    { username: 'Sanjana Mehta', hash: teamHash, role: 'HEAD', team_name: 'Talents' },
    { username: 'Sakshi Pumniya', hash: teamHash, role: 'HEAD', team_name: 'Talents' },
    { username: 'Shweta Shinde', hash: accountsHash, role: 'ACCOUNTS', team_name: null },
    { username: 'Shreya Nakarja', hash: teamHash, role: 'TEAM', team_name: 'Talents' },
    { username: 'Kreena Kothari', hash: teamHash, role: 'TEAM', team_name: 'Talents' },
    { username: 'Vrushti Jain', hash: teamHash, role: 'TEAM', team_name: 'Talents' },
    { username: 'Krishna Talati', hash: teamHash, role: 'TEAM', team_name: 'Talents' }
  ];

  for (const u of defaultUsers) {
    const existing = await get("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))", [u.username]);
    if (!existing) {
      await run("INSERT INTO users (username, password_hash, role, team_name) VALUES (?, ?, ?, ?)", [
        u.username,
        u.hash,
        u.role,
        u.team_name
      ]);
    } else {
      await run("UPDATE users SET password_hash = ? WHERE id = ?", [u.hash, existing.id]);
    }
  }
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

  await run(`CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire INTEGER NOT NULL
  )`);

  // Migration: upgrade sessions.expire from 32-bit INTEGER to BIGINT on PostgreSQL.
  // The original schema stored Unix timestamps in milliseconds (~1.7 trillion) which
  // overflows a PostgreSQL INTEGER (max ~2.1 billion), causing session.save() to fail.
  // We now store timestamps in seconds, so existing millisecond-based rows are stale
  // and should be removed. This block is a no-op on SQLite.
  if (isPostgres) {
    try {
      await pool.query(`ALTER TABLE sessions ALTER COLUMN expire TYPE BIGINT`);
    } catch (_) { /* already BIGINT — ignore */ }
    // Delete stale sessions that were saved with millisecond timestamps (values > year 3000 in seconds)
    await pool.query(`DELETE FROM sessions WHERE expire > 32503680000`);
  }

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
    invoice_type TEXT NOT NULL DEFAULT 'non_gst',
    full_name TEXT NOT NULL,
    address TEXT,
    pan TEXT,
    email TEXT,
    invoice_no TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    payment_mode TEXT,
    poc_name TEXT,
    other_references TEXT,
    po_number TEXT,
    creator_gstin TEXT,
    taxable_amount REAL,
    gst_rate REAL,
    cgst_rate REAL,
    sgst_rate REAL,
    igst_rate REAL,
    cgst_amount REAL,
    sgst_amount REAL,
    igst_amount REAL,
    gst_amount REAL,
    final_amount REAL,
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
    revision_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    pdf_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER,
    campaign_id INTEGER,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id),
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  )`);

  let hasCreatorAmount = false;
  let hasInvoiceType = false;
  let hasPoNumber = false;
  let hasCreatorGstin = false;
  let hasTaxableAmount = false;
  let hasGstRate = false;
  let hasCgstRate = false;
  let hasSgstRate = false;
  let hasIgstRate = false;
  let hasCgstAmount = false;
  let hasSgstAmount = false;
  let hasIgstAmount = false;
  let hasGstAmount = false;
  let hasFinalAmount = false;
  let hasLockedAmount = false;
  let hasRevisionCount = false;
  let hasRejectionReason = false;
  let hasUtr = false;

  if (isPostgres) {
    const checkColumn = async (table, column) => {
      const res = await get(
        "SELECT column_name FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
        [table, column]
      );
      return !!res;
    };
    hasCreatorAmount = await checkColumn("campaign_creators", "amount");
    hasInvoiceType = await checkColumn("invoices", "invoice_type");
    hasPoNumber = await checkColumn("invoices", "po_number");
    hasCreatorGstin = await checkColumn("invoices", "creator_gstin");
    hasTaxableAmount = await checkColumn("invoices", "taxable_amount");
    hasGstRate = await checkColumn("invoices", "gst_rate");
    hasCgstRate = await checkColumn("invoices", "cgst_rate");
    hasSgstRate = await checkColumn("invoices", "sgst_rate");
    hasIgstRate = await checkColumn("invoices", "igst_rate");
    hasCgstAmount = await checkColumn("invoices", "cgst_amount");
    hasSgstAmount = await checkColumn("invoices", "sgst_amount");
    hasIgstAmount = await checkColumn("invoices", "igst_amount");
    hasGstAmount = await checkColumn("invoices", "gst_amount");
    hasFinalAmount = await checkColumn("invoices", "final_amount");
    hasLockedAmount = await checkColumn("invoices", "locked_amount");
    hasRevisionCount = await checkColumn("invoices", "revision_count");
    hasRejectionReason = await checkColumn("invoices", "rejection_reason");
    hasUtr = await checkColumn("invoices", "utr");
  } else {
    const creatorColumns = await all("PRAGMA table_info(campaign_creators)");
    hasCreatorAmount = creatorColumns.some((c) => c.name === "amount");

    const invoiceColumns = await all("PRAGMA table_info(invoices)");
    hasInvoiceType = invoiceColumns.some((c) => c.name === "invoice_type");
    hasPoNumber = invoiceColumns.some((c) => c.name === "po_number");
    hasCreatorGstin = invoiceColumns.some((c) => c.name === "creator_gstin");
    hasTaxableAmount = invoiceColumns.some((c) => c.name === "taxable_amount");
    hasGstRate = invoiceColumns.some((c) => c.name === "gst_rate");
    hasCgstRate = invoiceColumns.some((c) => c.name === "cgst_rate");
    hasSgstRate = invoiceColumns.some((c) => c.name === "sgst_rate");
    hasIgstRate = invoiceColumns.some((c) => c.name === "igst_rate");
    hasCgstAmount = invoiceColumns.some((c) => c.name === "cgst_amount");
    hasSgstAmount = invoiceColumns.some((c) => c.name === "sgst_amount");
    hasIgstAmount = invoiceColumns.some((c) => c.name === "igst_amount");
    hasGstAmount = invoiceColumns.some((c) => c.name === "gst_amount");
    hasFinalAmount = invoiceColumns.some((c) => c.name === "final_amount");
    hasLockedAmount = invoiceColumns.some((c) => c.name === "locked_amount");
    hasRevisionCount = invoiceColumns.some((c) => c.name === "revision_count");
    hasRejectionReason = invoiceColumns.some((c) => c.name === "rejection_reason");
    hasUtr = invoiceColumns.some((c) => c.name === "utr");
  }

  if (!hasCreatorAmount) {
    await run("ALTER TABLE campaign_creators ADD COLUMN amount REAL NOT NULL DEFAULT 0");
  }
  if (!hasInvoiceType) {
    await run("ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'non_gst'");
  }
  if (!hasPoNumber) {
    await run("ALTER TABLE invoices ADD COLUMN po_number TEXT");
  }
  if (!hasCreatorGstin) {
    await run("ALTER TABLE invoices ADD COLUMN creator_gstin TEXT");
  }
  if (!hasTaxableAmount) {
    await run("ALTER TABLE invoices ADD COLUMN taxable_amount REAL");
  }
  if (!hasGstRate) {
    await run("ALTER TABLE invoices ADD COLUMN gst_rate REAL");
  }
  if (!hasCgstRate) {
    await run("ALTER TABLE invoices ADD COLUMN cgst_rate REAL");
  }
  if (!hasSgstRate) {
    await run("ALTER TABLE invoices ADD COLUMN sgst_rate REAL");
  }
  if (!hasIgstRate) {
    await run("ALTER TABLE invoices ADD COLUMN igst_rate REAL");
  }
  if (!hasCgstAmount) {
    await run("ALTER TABLE invoices ADD COLUMN cgst_amount REAL");
  }
  if (!hasSgstAmount) {
    await run("ALTER TABLE invoices ADD COLUMN sgst_amount REAL");
  }
  if (!hasIgstAmount) {
    await run("ALTER TABLE invoices ADD COLUMN igst_amount REAL");
  }
  if (!hasGstAmount) {
    await run("ALTER TABLE invoices ADD COLUMN gst_amount REAL");
  }
  if (!hasFinalAmount) {
    await run("ALTER TABLE invoices ADD COLUMN final_amount REAL");
  }
  if (!hasLockedAmount) {
    await run("ALTER TABLE invoices ADD COLUMN locked_amount REAL NOT NULL DEFAULT 0");
    await run("UPDATE invoices SET locked_amount = total_amount WHERE locked_amount = 0");
  }
  if (!hasRevisionCount) {
    await run("ALTER TABLE invoices ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasRejectionReason) {
    await run("ALTER TABLE invoices ADD COLUMN rejection_reason TEXT");
  }
  if (!hasUtr) {
    await run("ALTER TABLE invoices ADD COLUMN utr TEXT");
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
