const dns = require("dns");
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const path = require("path");
const bcrypt = require("bcryptjs");

function cleanDatabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  return String(rawUrl).trim().replace(/:\[([^\]]+)\]@/, (m, p1) => ":" + p1 + "@");
}

const rawDbUrl = cleanDatabaseUrl(process.env.DATABASE_URL || process.env.POSTGRES_URL);
let isPostgres = !!rawDbUrl;
let pool = null;
let raw = null;

function initSqlite() {
  if (raw) return;
  const sqlite3 = require("sqlite3").verbose();
  const runtimeDir = process.env.VERCEL ? "/tmp" : __dirname;
  const dbPath = process.env.DATABASE_PATH || path.join(runtimeDir, "portal.db");
  raw = new sqlite3.Database(dbPath);
}

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { ...options, family: 4 }, callback);
}

if (isPostgres) {
  try {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: rawDbUrl,
      ssl: {
        rejectUnauthorized: false
      },
      lookup: ipv4Lookup,
      connectionTimeoutMillis: 5000
    });
  } catch (err) {
    console.warn("⚠️ Failed to initialize PostgreSQL pool:", err.message);
    isPostgres = false;
    initSqlite();
  }
} else {
  initSqlite();
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
function getDefaultPassword(username) {
  const parts = username.trim().split(/\s+/);
  if (parts.length === 1) {
    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + "@3fm";
  }
  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  const lastInitial = parts[1].charAt(0).toUpperCase();
  return `${firstName}${lastInitial}@3fm`;
}

async function seedDefaultUsers() {
  const rawUsers = [
    { username: 'superadmin', role: 'SUPER_ADMIN', team_name: null },
    { username: 'accounts', role: 'ACCOUNTS', team_name: null },
    { username: 'Moiz Shaikh', role: 'HEAD', team_name: 'Jhalak Moiz' },
    { username: 'Jhalak Tated', role: 'HEAD', team_name: 'Jhalak Moiz' },
    { username: 'Harshal Mehta', role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Khushee Bagtharia', role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Disha Jain', role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Atharva Shinde', role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Om Sawant', role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Nidhi Parsekar', role: 'TEAM', team_name: 'Jhalak Moiz' },
    { username: 'Riti Tated', role: 'HEAD', team_name: 'Team Riti' },
    { username: 'Nirav Pipalia', role: 'TEAM', team_name: 'Team Riti' },
    { username: 'Navneet Dehad', role: 'TEAM', team_name: 'Team Riti' },
    { username: 'Bhumisha Rajgar', role: 'HEAD', team_name: 'Team Bhumisha' },
    { username: 'Navya Jain', role: 'TEAM', team_name: 'Team Bhumisha' },
    { username: 'Tauqir Khan', role: 'TEAM', team_name: 'Team Bhumisha' },
    { username: 'Krisha Modi', role: 'TEAM', team_name: 'Team Bhumisha' },
    { username: 'Deepak Lokhande', role: 'ACCOUNTS', team_name: null },
    { username: 'Priya Vasani', role: 'HEAD', team_name: 'Team Priya' },
    { username: 'Dhruven Gosia', role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Siddhi Gala', role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Priyal Gada', role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Rishita Soni', role: 'TEAM', team_name: 'Team Priya' },
    { username: 'Deep Shah', role: 'SUPER_ADMIN', team_name: null },
    { username: 'Rahil Shah', role: 'SUPER_ADMIN', team_name: null },
    { username: 'Shubh Shah', role: 'SUPER_ADMIN', team_name: null },
    { username: 'Sanjana Mehta', role: 'HEAD', team_name: 'Talents' },
    { username: 'Sakshi Pumniya', role: 'HEAD', team_name: 'Talents' },
    { username: 'Shweta Shinde', role: 'ACCOUNTS', team_name: null },
    { username: 'Shreya Nakarja', role: 'TEAM', team_name: 'Talents' },
    { username: 'Kreena Kothari', role: 'TEAM', team_name: 'Talents' },
    { username: 'Vrushti Jain', role: 'TEAM', team_name: 'Talents' },
    { username: 'Krishna Talati', role: 'TEAM', team_name: 'Talents' }
  ];

  for (const u of rawUsers) {
    const plainPassword = getDefaultPassword(u.username);
    const hash = await bcrypt.hash(plainPassword, 10);
    const existing = await get("SELECT id, password_hash FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))", [u.username]);
    if (!existing) {
      await run("INSERT INTO users (username, password_hash, role, team_name) VALUES (?, ?, ?, ?)", [
        u.username,
        hash,
        u.role,
        u.team_name
      ]);
    } else {
      const isOldDefault = (
        await bcrypt.compare("Admin@123", existing.password_hash) ||
        await bcrypt.compare("Accounts@123", existing.password_hash) ||
        await bcrypt.compare("Team@123", existing.password_hash)
      );
      if (isOldDefault) {
        await run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, existing.id]);
      }
    }
  }
}

async function init() {
  if (isPostgres && rawDbUrl) {
    try {
      const parsedUrl = new URL(rawDbUrl);
      const origHost = parsedUrl.hostname;
      if (origHost && !origHost.match(/^[0-9.]+$/)) {
        const ips = await dns.promises.resolve4(origHost);
        if (ips && ips.length) {
          const { Pool } = require("pg");
          parsedUrl.hostname = ips[0];
          pool = new Pool({
            connectionString: parsedUrl.toString(),
            ssl: {
              rejectUnauthorized: false,
              servername: origHost
            },
            connectionTimeoutMillis: 5000
          });
        }
      }
    } catch (err) {
      // Ignore resolution fallback
    }

    try {
      await pool.query("SELECT 1");
      console.log("✅ Successfully connected to PostgreSQL database!");
    } catch (err) {
      console.warn("⚠️ PostgreSQL connection failed (" + err.message + "). Falling back to SQLite database.");
      isPostgres = false;
      initSqlite();
    }
  }

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
    external_budget REAL DEFAULT 0,
    brand_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS campaign_creators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    creator_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    live_link TEXT,
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
  let hasLiveLink = false;
  let hasExternalBudget = false;
  let hasBrandName = false;
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
  let hasIsHrUpload = false;
  let hasHrInvoiceType = false;
  let hasFilePath = false;

  if (isPostgres) {
    const checkColumn = async (table, column) => {
      const res = await get(
        "SELECT column_name FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
        [table, column]
      );
      return !!res;
    };
    hasCreatorAmount = await checkColumn("campaign_creators", "amount");
    hasLiveLink = await checkColumn("campaign_creators", "live_link");
    hasExternalBudget = await checkColumn("campaigns", "external_budget");
    hasBrandName = await checkColumn("campaigns", "brand_name");
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
    hasIsHrUpload = await checkColumn("invoices", "is_hr_upload");
    hasHrInvoiceType = await checkColumn("invoices", "hr_invoice_type");
    hasFilePath = await checkColumn("invoices", "file_path");
  } else {
    const creatorColumns = await all("PRAGMA table_info(campaign_creators)");
    hasCreatorAmount = creatorColumns.some((c) => c.name === "amount");
    hasLiveLink = creatorColumns.some((c) => c.name === "live_link");

    const campaignColumns = await all("PRAGMA table_info(campaigns)");
    hasExternalBudget = campaignColumns.some((c) => c.name === "external_budget");
    hasBrandName = campaignColumns.some((c) => c.name === "brand_name");

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
    hasIsHrUpload = invoiceColumns.some((c) => c.name === "is_hr_upload");
    hasHrInvoiceType = invoiceColumns.some((c) => c.name === "hr_invoice_type");
    hasFilePath = invoiceColumns.some((c) => c.name === "file_path");
  }

  if (!hasCreatorAmount) {
    await run("ALTER TABLE campaign_creators ADD COLUMN amount REAL NOT NULL DEFAULT 0");
  }
  if (!hasLiveLink) {
    await run("ALTER TABLE campaign_creators ADD COLUMN live_link TEXT");
  }
  if (!hasExternalBudget) {
    await run("ALTER TABLE campaigns ADD COLUMN external_budget REAL DEFAULT 0");
  }
  if (!hasBrandName) {
    await run("ALTER TABLE campaigns ADD COLUMN brand_name TEXT");
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
  if (!hasIsHrUpload) {
    await run("ALTER TABLE invoices ADD COLUMN is_hr_upload INTEGER DEFAULT 0");
  }
  if (!hasHrInvoiceType) {
    await run("ALTER TABLE invoices ADD COLUMN hr_invoice_type TEXT");
  }
  if (!hasFilePath) {
    await run("ALTER TABLE invoices ADD COLUMN file_path TEXT");
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

  await run("UPDATE invoices SET status = 'SUBMITTED' WHERE is_hr_upload = 1 AND status = 'ACCEPTED'");
  await seedDefaultUsers();
}

module.exports = {
  init,
  run,
  get,
  all
};
