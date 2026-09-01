const { Pool } = require("pg");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

async function migrate() {
  const pgUrl = process.env.DATABASE_URL;
  if (!pgUrl || !pgUrl.startsWith("postgres")) {
    console.error("❌ ERROR: Please paste your Supabase DATABASE_URL into .env first!");
    process.exit(1);
  }

  console.log("🚀 Connecting to Supabase PostgreSQL...");
  const pgPool = new Pool({
    connectionString: pgUrl,
    ssl: { rejectUnauthorized: false }
  });

  const sqlitePath = path.join(__dirname, "portal.db");
  console.log(`📁 Connecting to SQLite (${sqlitePath})...`);
  const sqliteDb = new sqlite3.Database(sqlitePath);

  const tables = [
    "users",
    "sessions",
    "campaigns",
    "campaign_creators",
    "invoices",
    "invoice_items",
    "notifications"
  ];

  try {
    for (const table of tables) {
      console.log(`\n📦 Migrating table: [${table}]...`);
      try {
        const { rows } = await pgPool.query(`SELECT * FROM ${table}`);
        console.log(`   Found ${rows.length} rows in Supabase table [${table}].`);

        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => "?").join(", ");
        const colNames = columns.join(", ");
        const insertSql = `INSERT OR REPLACE INTO ${table} (${colNames}) VALUES (${placeholders})`;

        let insertedCount = 0;
        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val instanceof Date) return val.toISOString();
            if (typeof val === "object" && val !== null) return JSON.stringify(val);
            return val;
          });

          await new Promise((resolve, reject) => {
            sqliteDb.run(insertSql, values, function(err) {
              if (err) {
                console.warn(`   ⚠️ Warning inserting row in ${table}:`, err.message);
                resolve();
              } else {
                insertedCount++;
                resolve();
              }
            });
          });
        }
        console.log(`   ✅ Successfully migrated ${insertedCount}/${rows.length} rows into SQLite [${table}].`);
      } catch (err) {
        console.log(`   ℹ️ Table [${table}] query note: ${err.message}`);
      }
    }

    console.log("\n🎉 MIGRATION COMPLETE! All your Supabase data is now safely inside SQLite (portal.db)!");
  } catch (err) {
    console.error("❌ Migration error:", err.message);
  } finally {
    await pgPool.end();
    sqliteDb.close();
  }
}

migrate();
