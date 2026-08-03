const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const xlsx = require("xlsx");
let SocketIO = null;
try {
  SocketIO = require('socket.io').Server;
} catch (e) {
  console.warn("socket.io not loaded:", e.message);
}
const db = require("./db");
const { requireAuth, requireRole, isAdminArea } = require("./middleware/auth");
const { ensurePdfForInvoice, generateCreatorDossierPdf } = require("./services/pdf");

const app = express();
const START_PORT = Number(process.env.PORT || 3000);
const runtimeDir = process.env.VERCEL ? "/tmp" : __dirname;
const DELIVERABLE_OPTIONS = [
  "Collab Reel",
  "Non-Collab Reel",
  "1 Month AD Rights",
  "3 Month AD Rights",
  "Video Story",
  "Static Story",
  "Carousel Post",
  "Static Post"
];
const COMPANY_STATE_CODE = "27";
const AUTH_COOKIE_NAME = "portal_auth";
const regex = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/
};

const uploadDir = path.join(runtimeDir, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const generatedDir = path.join(runtimeDir, "generated");
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safe);
  }
});
const upload = multer({ storage });

class SqliteSessionStore extends session.Store {
  get(sid, cb) {
    // Store/compare expire as Unix epoch SECONDS to avoid PostgreSQL INTEGER overflow
    // (milliseconds ~1.7 trillion exceed the 32-bit INTEGER max of ~2.1 billion)
    const nowSec = Math.floor(Date.now() / 1000);
    db.get("SELECT sess FROM sessions WHERE sid = ? AND expire > ?", [sid, nowSec])
      .then((row) => cb(null, row ? JSON.parse(row.sess) : null))
      .catch(cb);
  }

  set(sid, sess, cb) {
    // Use epoch SECONDS so the value fits safely in a PostgreSQL INTEGER column
    const ttlSec = sess.cookie && sess.cookie.expires
      ? Math.floor(new Date(sess.cookie.expires).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 86400;
    db.run(
      `INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`,
      [sid, JSON.stringify(sess), ttlSec]
    )
      .then(() => cb && cb(null))
      .catch((error) => cb && cb(error));
  }

  destroy(sid, cb) {
    db.run("DELETE FROM sessions WHERE sid = ?", [sid])
      .then(() => cb && cb(null))
      .catch((error) => cb && cb(error));
  }
}

function todayForInvoice() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isSecureRequest(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function authCookieOptions(req) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: 1000 * 60 * 60 * 24
  };
}

function sessionCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const cookieName = part.slice(0, separatorIndex);
    if (cookieName === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1));
    }
  }
  return null;
}

function signAuthPayload(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "replace-this-in-production")
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

function verifyAuthPayload(value) {
  if (!value) return null;
  const [data, signature] = String(value).split(".");
  if (!data || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "replace-this-in-production")
    .update(data)
    .digest("base64url");

  if (signature !== expectedSignature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed || !parsed.id || !parsed.username || !parsed.role) return null;
    return {
      id: parsed.id,
      username: parsed.username,
      role: parsed.role,
      teamName: parsed.teamName || null
    };
  } catch (error) {
    return null;
  }
}

function getAuthenticatedUser(req) {
  if (req.session.user) {
    return req.session.user;
  }
  return verifyAuthPayload(readCookie(req, AUTH_COOKIE_NAME));
}

function setAuthCookie(res, req, user) {
  res.cookie(
    AUTH_COOKIE_NAME,
    signAuthPayload({
      id: user.id,
      username: user.username,
      role: user.role,
      teamName: user.teamName || null
    }),
    authCookieOptions(req)
  );
}

function clearAuthCookie(res, req) {
  const { maxAge, ...options } = authCookieOptions(req);
  res.clearCookie(AUTH_COOKIE_NAME, options);
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
}

function safeFolderName(value, fallback = "campaign") {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return safe || fallback;
}

function campaignFolderName(campaign) {
  return `${safeFolderName(campaign.campaign_name)}-${campaign.id}`;
}

function ensureCampaignFolders(campaign) {
  const folder = campaignFolderName(campaign);
  fs.mkdirSync(path.join(generatedDir, "campaigns", folder), { recursive: true });
  fs.mkdirSync(path.join(uploadDir, "campaigns", folder), { recursive: true });
  return folder;
}

async function loadCampaignFolderCards(user) {
  let campaigns;
  if (user && (user.role === "TEAM" || user.role === "HEAD") && user.teamName) {
    campaigns = await db.all(
      `SELECT c.*, COUNT(cc.id) AS creator_count, COALESCE(SUM(cc.amount),0) AS amount
       FROM campaigns c
       LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
       WHERE LOWER(TRIM(c.team_name)) = LOWER(TRIM(?))
       GROUP BY c.id
       ORDER BY c.id DESC`,
      [user.teamName]
    );
  } else {
    campaigns = await db.all(
      `SELECT c.*, COUNT(cc.id) AS creator_count, COALESCE(SUM(cc.amount),0) AS amount
       FROM campaigns c
       LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
       GROUP BY c.id
       ORDER BY c.id DESC`
    );
  }

  const folders = [];
  for (const campaign of campaigns) {
    const creators = await loadCampaignCreatorsWithInvoices(campaign.id);

    let paidCreatorsCount = 0;
    let paidPayout = 0;
    let pendingCreatorsCount = 0;
    let pendingPayout = 0;

    creators.forEach(cr => {
      const isPaid = cr.latest_invoice_status === "PAYMENT COMPLETED" ||
                     cr.latest_invoice_status === "PAID" ||
                     (cr.latest_invoice_status === "ACCEPTED" && cr.latest_invoice_utr);
      if (isPaid) {
        paidCreatorsCount++;
        paidPayout += Number(cr.amount || 0);
      } else {
        pendingCreatorsCount++;
        pendingPayout += Number(cr.amount || 0);
      }
    });

    folders.push({
      id: campaign.id,
      campaignName: campaign.campaign_name,
      campaignCode: campaign.campaign_code,
      teamName: campaign.team_name,
      brandName: campaign.brand_name || 'Campaign',
      externalBudget: Number(campaign.external_budget || 0),
      internalBudget: Number(campaign.amount || 0),
      creatorCount: Number(campaign.creator_count || 0),
      invoiceCount: creators.filter(c => c.latest_invoice_id).length,
      totalAmount: Number(campaign.amount || 0),
      paidCreatorsCount,
      paidPayout,
      pendingCreatorsCount,
      pendingPayout,
      latestInvoiceId: creators
        .map((creator) => Number(creator.latest_invoice_id || 0))
        .filter((invoiceId) => invoiceId > 0)
        .sort((a, b) => b - a)[0] || null,
      folderName: campaignFolderName(campaign),
      generatedPath: `/generated/campaigns/${campaignFolderName(campaign)}`,
      uploadPath: `/uploads/campaigns/${campaignFolderName(campaign)}`,
      creators
    });
  }

  return folders;
}

async function loadCampaignCards(user, search = "") {
  const normalizedSearch = String(search || "").trim();
  const like = `%${normalizedSearch}%`;
  let campaigns;

  // Requirement 7:
  // - SUPER_ADMIN & ACCOUNTS: see all campaigns
  // - HEAD: can see campaigns created by ANY HEAD role user across all teams
  // - TEAM: can see ONLY campaigns created by their team HEAD
  if (user && user.role === "HEAD") {
    let baseSql = `
      SELECT c.*, COUNT(cc.id) AS creator_count, COALESCE(SUM(cc.amount),0) AS amount
      FROM campaigns c
      LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE (u.role = 'HEAD' OR c.created_by IS NULL)
    `;
    let params = [];
    if (normalizedSearch) {
      baseSql += ` AND (c.campaign_name LIKE ? OR c.campaign_code LIKE ? OR c.team_name LIKE ? OR c.brand_name LIKE ?)`;
      params.push(like, like, like, like);
    }
    baseSql += ` GROUP BY c.id ORDER BY c.id DESC`;
    campaigns = await db.all(baseSql, params);

  } else if (user && user.role === "TEAM" && user.teamName) {
    let baseSql = `
      SELECT c.*, COUNT(cc.id) AS creator_count, COALESCE(SUM(cc.amount),0) AS amount
      FROM campaigns c
      LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE u.role = 'HEAD' AND LOWER(TRIM(c.team_name)) = LOWER(TRIM(?))
    `;
    let params = [user.teamName];
    if (normalizedSearch) {
      baseSql += ` AND (c.campaign_name LIKE ? OR c.campaign_code LIKE ?)`;
      params.push(like, like);
    }
    baseSql += ` GROUP BY c.id ORDER BY c.id DESC`;
    campaigns = await db.all(baseSql, params);

  } else {
    let baseSql = `
      SELECT c.*, COUNT(cc.id) AS creator_count, COALESCE(SUM(cc.amount),0) AS amount
      FROM campaigns c
      LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
    `;
    let params = [];
    if (normalizedSearch) {
      baseSql += ` WHERE c.campaign_name LIKE ? OR c.campaign_code LIKE ? OR c.team_name LIKE ? OR c.brand_name LIKE ?`;
      params.push(like, like, like, like);
    }
    baseSql += ` GROUP BY c.id ORDER BY c.id DESC`;
    campaigns = await db.all(baseSql, params);
  }

  const campaignCards = [];
  for (const campaign of campaigns) {
    const creators = await loadCampaignCreatorsWithInvoices(campaign.id);

    let paidCreatorsCount = 0;
    let paidPayout = 0;
    let pendingCreatorsCount = 0;
    let pendingPayout = 0;

    creators.forEach(cr => {
      const isPaid = cr.latest_invoice_status === "PAYMENT COMPLETED" ||
                     cr.latest_invoice_status === "PAID" ||
                     (cr.latest_invoice_status === "ACCEPTED" && cr.latest_invoice_utr);
      if (isPaid) {
        paidCreatorsCount++;
        paidPayout += Number(cr.amount || 0);
      } else {
        pendingCreatorsCount++;
        pendingPayout += Number(cr.amount || 0);
      }
    });

    campaignCards.push({
      ...campaign,
      creators,
      paidCreatorsCount,
      paidPayout,
      pendingCreatorsCount,
      pendingPayout,
      internalBudget: Number(campaign.amount || 0)
    });
  }

  return campaignCards;
}

async function loadCampaignCreatorsWithInvoices(campaignId) {
  const invoiceMatch = `i2.campaign_id = cc.campaign_id AND (
          REPLACE(REPLACE(REPLACE(TRIM(i2.creator_mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(cc.mobile), ' ', ''), '-', ''), '+91', '')
          OR LOWER(TRIM(i2.creator_name)) = LOWER(TRIM(cc.creator_name))
        )`;
  const joinMatch = `i.campaign_id = cc.campaign_id AND (
       REPLACE(REPLACE(REPLACE(TRIM(i.creator_mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(cc.mobile), ' ', ''), '-', ''), '+91', '')
       OR LOWER(TRIM(i.creator_name)) = LOWER(TRIM(cc.creator_name))
     )`;

  return db.all(
    `SELECT cc.*,
      COUNT(DISTINCT i.id) AS invoice_count,
      (
        SELECT i2.id
        FROM invoices i2
        WHERE ${invoiceMatch}
        ORDER BY i2.id DESC
        LIMIT 1
      ) AS latest_invoice_id,
      (
        SELECT i2.invoice_no
        FROM invoices i2
        WHERE ${invoiceMatch}
        ORDER BY i2.id DESC
        LIMIT 1
      ) AS latest_invoice_no,
      (
        SELECT i2.invoice_date
        FROM invoices i2
        WHERE ${invoiceMatch}
        ORDER BY i2.id DESC
        LIMIT 1
      ) AS latest_invoice_date,
      (
        SELECT i2.status
        FROM invoices i2
        WHERE ${invoiceMatch}
        ORDER BY i2.id DESC
        LIMIT 1
      ) AS latest_invoice_status,
      (
        SELECT i2.pdf_path
        FROM invoices i2
        WHERE ${invoiceMatch}
        ORDER BY i2.id DESC
        LIMIT 1
      ) AS latest_pdf_path,
      (
        SELECT i2.total_amount
        FROM invoices i2
        WHERE ${invoiceMatch}
        ORDER BY i2.id DESC
        LIMIT 1
      ) AS latest_invoice_amount,
      (
        SELECT i2.utr
        FROM invoices i2
        WHERE ${invoiceMatch}
        ORDER BY i2.id DESC
        LIMIT 1
      ) AS latest_invoice_utr
     FROM campaign_creators cc
     LEFT JOIN invoices i ON ${joinMatch}
     WHERE cc.campaign_id = ?
     GROUP BY cc.id
     ORDER BY cc.id DESC`,
    [campaignId]
  );
}

function moveUploadToCampaignFolder(file, campaign) {
  if (!file) return null;
  const folder = ensureCampaignFolders(campaign);
  const destinationDir = path.join(uploadDir, "campaigns", folder);
  const target = path.join(destinationDir, file.filename);
  if (file.path !== target) {
    fs.renameSync(file.path, target);
  }
  return `/uploads/campaigns/${folder}/${file.filename}`;
}

function gstBreakup(invoiceKind, gstin, taxableAmount) {
  const taxable = Number(taxableAmount || 0);
  if (invoiceKind !== "gst") {
    return {
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      gstAmount: 0,
      finalAmount: taxable,
      gstMode: "none"
    };
  }

  const creatorStateCode = String(gstin || "").trim().slice(0, 2);
  const isIntraState = creatorStateCode === COMPANY_STATE_CODE;
  const cgstRate = isIntraState ? 9 : 0;
  const sgstRate = isIntraState ? 9 : 0;
  const igstRate = isIntraState ? 0 : 18;
  const cgstAmount = Number((taxable * (cgstRate / 100)).toFixed(2));
  const sgstAmount = Number((taxable * (sgstRate / 100)).toFixed(2));
  const igstAmount = Number((taxable * (igstRate / 100)).toFixed(2));
  const gstAmount = Number((cgstAmount + sgstAmount + igstAmount).toFixed(2));
  return {
    gstRate: 18,
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    finalAmount: Number((taxable + gstAmount).toFixed(2)),
    gstMode: isIntraState ? "cgst_sgst" : "igst"
  };
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function itemsFromBody(body) {
  const descriptions = arrayValue(body.itemDescriptions);
  const customs = arrayValue(body.itemCustomDescriptions);
  const quantities = arrayValue(body.itemQuantities);
  const amounts = arrayValue(body.itemAmounts);

  return descriptions
    .map((desc, idx) => {
      const selected = String(desc || "").trim();
      const custom = String(customs[idx] || "").trim();
      const quantity = Number(quantities[idx] || 0);
      return {
        description: selected === "Custom" ? custom : selected,
        quantity,
        amount: Number.isFinite(Number(amounts[idx])) ? Number(amounts[idx]) : quantity
      };
    })
    .filter((x) => x.description);
}

async function notifyInvoiceSubmission(invoiceId, campaignId, creatorName, campaignName, isRegenerated) {
  const action = isRegenerated ? "re-generated" : "submitted";
  const message = `${creatorName} from ${campaignName} has ${action} the invoice.`;
  await db.run(
    "INSERT INTO notifications (invoice_id, campaign_id, message) VALUES (?, ?, ?)",
    [invoiceId, campaignId, message]
  );

  const io = app.get('io');
  if (io) {
    io.emit('new-invoice', {
      id: invoiceId,
      invoice_no: invoiceId,
      creator_name: creatorName,
      campaign_name: campaignName,
      message: message
    });
    io.emit('notification', {
      invoice_id: invoiceId,
      message: message
    });
  }
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function extractCreatorsFromSheet(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("File does not contain any sheets.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) {
    throw new Error("Uploaded file is empty.");
  }

  return rows.map((row, idx) => {
    const normalized = Object.keys(row).reduce((acc, key) => {
      acc[normalizeHeader(key)] = row[key];
      return acc;
    }, {});

    const name = String(normalized.creatorname || normalized.creator || normalized.name || "").trim();
    let mob = String(
      normalized.mobile ||
      normalized.mobilenumber ||
      normalized.contact ||
      normalized.contactnumber ||
      ""
    ).trim();

    if (!mob) {
      const sr = String(normalized.srno || normalized.sno || normalized.sr || idx + 1).replace(/\D/g, "");
      mob = `99${String(sr).padStart(8, '0')}`;
    }

    const liveLink = String(
      normalized.livelink ||
      normalized.link ||
      normalized.livelinks ||
      normalized.url ||
      normalized.live ||
      ""
    ).trim();

    return {
      creatorName: name,
      mobile: mob,
      amount: Number(normalized.amount || 0),
      live_link: liveLink || null
    };
  });
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https://vercel.live https://cdn.socket.io wss: ws: blob:; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline' https://vercel.live https://cdn.socket.io; script-src-elem 'self' 'unsafe-inline' https://vercel.live https://cdn.socket.io; worker-src 'self' blob:; frame-src 'self' https://vercel.live; child-src 'self' https://vercel.live; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'"
  );
  next();
});

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
const dbReady = db.init();
app.use(async (_, res, next) => {
  try {
    await dbReady;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).send("Database initialization failed.");
  }
});
app.use(
  session({
    store: new SqliteSessionStore(),
    secret: process.env.SESSION_SECRET || "replace-this-in-production",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: sessionCookieOptions()
  })
);

// Dynamic secure property resolution for connect.sid session cookie
app.use((req, res, next) => {
  if (req.session && req.session.cookie) {
    req.session.cookie.secure = isSecureRequest(req);
  }
  next();
});
app.use(async (req, _, next) => {
  const isImpersonating = req.session && req.session.isImpersonating;
  if (!req.session.user && !isImpersonating) {
    const authUser = getAuthenticatedUser(req);
    if (authUser) {
      req.session.user = authUser;
    }
  }
  if (req.session && req.session.user && req.session.user.id) {
    try {
      const dbUser = await db.get("SELECT id, username, role, team_name FROM users WHERE id = ?", [req.session.user.id]);
      if (dbUser) {
        req.session.user.role = dbUser.role;
        req.session.user.teamName = dbUser.team_name || null;
      }
    } catch (e) {
      // ignore
    }
  }
  next();
});
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));
// Dynamic PDF serving to handle stateless serverless instances (Vercel)
app.get("/generated/campaigns/:folder/:filename", async (req, res) => {
  try {
    const { folder, filename } = req.params;
    const localPath = path.join(runtimeDir, "generated", "campaigns", folder, filename);

    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    // Extract invoice ID and regenerate PDF on the fly if not on local disk
    const match = filename.match(/invoice-(\d+)\.pdf/i);
    if (match) {
      const invoiceId = Number(match[1]);
      await ensurePdfForInvoice(invoiceId);
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
    }

    res.status(404).send("Invoice PDF not found.");
  } catch (err) {
    console.error("Dynamic PDF serving failed:", err);
    res.status(500).send("Error rendering PDF.");
  }
});

app.use("/generated", express.static(generatedDir));
app.get("/favicon.ico", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.sendFile(path.join(__dirname, "public", "favicon.svg"));
});

// Database keep-alive endpoint for hosted setups (like Supabase free-tier)
app.get("/api/ping", async (req, res) => {
  try {
    await db.get("SELECT 1");
    res.status(200).send("pong");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Prevent dynamic routing cache (vital for correct session redirection, especially on mobile browsers)
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.error = null;
  res.locals.success = null;
  res.locals.deliverableOptions = DELIVERABLE_OPTIONS;
  res.locals.today = todayForInvoice();
  next();
});

// Middleware to dynamically inject impersonation banner into rendered views
app.use((req, res, next) => {
  if (req.session && req.session.originalUser) {
    const originalRender = res.render;
    res.render = function (view, options, fn) {
      const self = this;
      let renderOptions = options || {};
      let renderFn = fn;

      if (typeof options === "function") {
        renderFn = options;
        renderOptions = {};
      }

      originalRender.call(self, view, renderOptions, (err, html) => {
        if (err) {
          if (typeof renderFn === "function") return renderFn(err);
          return next(err);
        }

        const bannerHtml = `
          <div class="impersonation-banner" style="background: linear-gradient(135deg, #f43f5e, #e11d48); color: #fff; padding: 12px 24px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; z-index: 99999; position: sticky; top: 0; box-shadow: 0 4px 20px rgba(225, 29, 72, 0.4); font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; letter-spacing: -0.01em; border-bottom: 2px solid rgba(255, 255, 255, 0.1);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 18px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15));">🛡️</span>
              <span>Impersonating <strong style="text-decoration: underline; text-underline-offset: 2px;">${req.session.user.username}</strong> (${req.session.user.role}) &mdash; Original User: <strong>${req.session.originalUser.username}</strong></span>
            </div>
            <a href="/admin/users/stop-impersonating" style="background: rgba(255, 255, 255, 0.2); color: #fff; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 700; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid rgba(255, 255, 255, 0.5); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; text-shadow: 0 1px 2px rgba(0,0,0,0.1);" onmouseover="this.style.background='rgba(255,255,255,0.3)'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'">
              Stop Impersonating
            </a>
          </div>
        `;

        let modifiedHtml = html;
        if (html.includes('<body class="admin-page">')) {
          modifiedHtml = html.replace('<body class="admin-page">', `<body class="admin-page">\n${bannerHtml}`);
        } else if (html.includes('<body>')) {
          modifiedHtml = html.replace('<body>', `<body>\n${bannerHtml}`);
        }

        if (typeof renderFn === "function") {
          renderFn(null, modifiedHtml);
        } else {
          self.send(modifiedHtml);
        }
      });
    };
  }
  next();
});

app.get("/", async (req, res) => {
  res.render("creator_form", { error: null, success: null, form: { ...req.query } });
});

app.post("/creator/validate", async (req, res) => {
  const { campaignCode, mobile } = req.body;
  if (!campaignCode || !mobile) {
    return res.render("creator_form", {
      error: "Campaign Code and Mobile are required.",
      success: null,
      form: req.body
    });
  }

  const campaign = await db.get(
    `SELECT c.id, c.campaign_name, c.campaign_code, cc.amount AS creator_amount, cc.creator_name, cc.live_link
     FROM campaigns c
     JOIN campaign_creators cc ON cc.campaign_id = c.id
     WHERE c.campaign_code = ? AND (REPLACE(REPLACE(REPLACE(TRIM(cc.mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(?), ' ', ''), '-', ''), '+91', ''))`,
    [campaignCode.trim(), mobile.trim()]
  );

  if (!campaign) {
    return res.render("creator_form", {
      error: "Invalid campaign code or mobile number mapping.",
      success: null,
      form: req.body
    });
  }

  // Render campaign validation success animation screen first
  res.render("creator_validate_success", {
    campaignCode: campaignCode.trim(),
    mobile: mobile.trim(),
    creatorName: campaign.creator_name,
    campaignName: campaign.campaign_name
  });
});

app.post("/creator/validated_form", async (req, res) => {
  const { campaignCode, mobile } = req.body;
  if (!campaignCode || !mobile) {
    return res.render("creator_form", {
      error: "Campaign Code and Mobile are required.",
      success: null,
      form: req.body
    });
  }

  const campaign = await db.get(
    `SELECT c.id, c.campaign_name, c.campaign_code, cc.amount AS creator_amount, cc.creator_name, cc.live_link
     FROM campaigns c
     JOIN campaign_creators cc ON cc.campaign_id = c.id
     WHERE c.campaign_code = ? AND (REPLACE(REPLACE(REPLACE(TRIM(cc.mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(?), ' ', ''), '-', ''), '+91', ''))`,
    [campaignCode.trim(), mobile.trim()]
  );

  if (!campaign) {
    return res.render("creator_form", {
      error: "Invalid campaign code or mobile number mapping.",
      success: null,
      form: req.body
    });
  }

  const cleanMobile = mobile.trim().replace(/\s+|-/g, '').replace(/^\+91/, '');

  const existingInvoice = await db.get(
    `SELECT *
     FROM invoices
     WHERE campaign_id = ? 
       AND (
         creator_mobile = ? OR
         REPLACE(REPLACE(REPLACE(TRIM(creator_mobile), ' ', ''), '-', ''), '+91', '') = ?
       )
     ORDER BY id DESC
     LIMIT 1`,
    [campaign.id, mobile.trim(), cleanMobile]
  );
  const existingItems = existingInvoice
    ? await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [existingInvoice.id])
    : [];

  let autoInvoiceNo;
  if (existingInvoice && existingInvoice.invoice_no) {
    autoInvoiceNo = existingInvoice.invoice_no;
  } else {
    const countRow = await db.get(
      `SELECT COUNT(*) AS cnt FROM invoices 
       WHERE REPLACE(REPLACE(REPLACE(TRIM(creator_mobile), ' ', ''), '-', ''), '+91', '') = ?
          OR creator_mobile = ?`,
      [cleanMobile, mobile.trim()]
    );
    const prevCount = countRow ? Number(countRow.cnt || 0) : 0;
    const seqNumber = String(prevCount + 1).padStart(2, '0');
    autoInvoiceNo = `3FM-INV-${seqNumber}`;
  }

  res.render("creator_form", {
    error: null,
    success: null,
    form: {
      ...req.body,
      validated: true,
      campaignId: campaign.id,
      campaignName: campaign.campaign_name,
      amount: campaign.creator_amount,
      creatorName: campaign.creator_name,
      liveLink: campaign.live_link || null,
      invoiceNo: autoInvoiceNo,
      existingInvoice,
      existingItems
    }
  });
});

app.post("/creator/submit", upload.fields([{ name: "signatureFile", maxCount: 1 }, { name: "gstDocument", maxCount: 1 }]), async (req, res) => {
  try {
    const sigFile = req.files && req.files.signatureFile && req.files.signatureFile[0] ? req.files.signatureFile[0] : (req.file || null);
    const gstDocFile = req.files && req.files.gstDocument && req.files.gstDocument[0] ? req.files.gstDocument[0] : null;

    const {
      campaignId,
      campaignCode,
      mobile,
      invoiceType,
      fullName,
      address,
      pan,
      email,
      invoiceNo,
      paymentMode,
      pocName,
      otherReferences,
      poNumber,
      gstin,
      accountName,
      bankName,
      accountNo,
      ifscCode,
      branch,
      upiId,
      signatureDraw,
      existingInvoiceId,
      itemQuantities,
      itemAmounts
    } = req.body;
    const isDirectGstUpload = Boolean(gstDocFile);
    const invoiceKind = String(invoiceType || "non_gst").toLowerCase() === "gst" ? "gst" : "non_gst";
    const invoiceDate = todayForInvoice();

    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
    if (!campaign) {
      return res.render("creator_form", {
        error: "Campaign not found.",
        success: null,
        form: req.body
      });
    }

    const safeMobile = String(mobile || "").trim();

    const mapping = await db.get(
      `SELECT id, creator_name, amount 
       FROM campaign_creators 
       WHERE campaign_id = ? 
         AND (
           mobile = ? OR
           REPLACE(REPLACE(REPLACE(TRIM(mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(?), ' ', ''), '-', ''), '+91', '')
         )`,
      [campaignId, safeMobile, safeMobile]
    );
    if (!mapping) {
      return res.render("creator_form", {
        error: "Creator is not mapped to this campaign.",
        success: null,
        form: req.body
      });
    }

    const safeFullName = String(fullName || mapping.creator_name || "Creator").trim();
    const safePan = String(pan || "AACFZ6393B").trim().toUpperCase();
    const safeEmail = String(req.body.gstEmail || email || "creator@3folks.com").trim();
    const safeInvoiceNo = String(invoiceNo || "").trim();
    const safeAddress = String(address || "").trim();
    const safePaymentMode = String(paymentMode || "").trim();
    const safePocName = String(pocName || "").trim();
    const safeOtherReferences = String(otherReferences || "").trim();
    const safePoNumber = String(poNumber || "").trim();

    if (!isDirectGstUpload) {
      if (!campaignId || !campaignCode || !safeMobile || !safeFullName || !safePan || !safeEmail || !safeInvoiceNo) {
        return res.render("creator_form", {
          error: "Full Name, Address, PAN Number, Email, and all required fields are mandatory.",
          success: null,
          form: {
            validated: true,
            ...req.body
          }
        });
      }

      if (invoiceType === "gst" && (!safePoNumber || !String(gstin || "").trim())) {
        return res.render("creator_form", {
          error: "PO Number and GSTIN are required for GST based invoices.",
          success: null,
          form: {
            validated: true,
            ...req.body
          }
        });
      }
    }

    const normalizedPan = regex.pan.test(safePan) ? safePan : "AACFZ6393B";
    const normalizedGstin = String(gstin || "27AACFZ6393B1ZZ").trim().toUpperCase();
    const normalizedIfscCode = String(ifscCode || "").trim().toUpperCase();

    if (!isDirectGstUpload && (!normalizedPan || !regex.pan.test(normalizedPan))) {
      return res.render("creator_form", {
        error: "PAN Number is mandatory and must match the format ABCDE1234F.",
        success: null,
        form: {
          validated: true,
          ...req.body
        }
      });
    }

    if (!isDirectGstUpload && invoiceKind === "gst" && !regex.gstin.test(normalizedGstin)) {
      return res.render("creator_form", {
        error: "GSTIN must match the format 27ABCDE1234F1Z5.",
        success: null,
        form: {
          validated: true,
          ...req.body
        }
      });
    }

    const existingInvoice = existingInvoiceId
      ? await db.get(
          `SELECT * FROM invoices 
           WHERE id = ? AND campaign_id = ? 
             AND (
               creator_mobile = ? OR
               REPLACE(REPLACE(REPLACE(TRIM(creator_mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(?), ' ', ''), '-', ''), '+91', '')
             )`,
          [existingInvoiceId, campaignId, safeMobile, safeMobile]
        )
      : null;

    let items = itemsFromBody(req.body);
    if (!items.length || isDirectGstUpload) {
      items = [{ description: "Uploaded GST Invoice Voucher", quantity: 1, amount: Number(mapping.amount || 0) }];
    }

    const total = items.reduce((sum, row) => sum + row.amount, 0);
    const taxableAmount = Number(total.toFixed(2));
    const taxes = gstBreakup(invoiceKind, normalizedGstin, taxableAmount);
    const {
      gstRate,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstAmount,
      finalAmount
    } = taxes;
    const savedTotalAmount = invoiceKind === "gst" ? finalAmount : taxableAmount;

    let signatureType = "upload";
    let signatureValue = "/public/logo.png";
    if (sigFile) {
      signatureType = "upload";
      signatureValue = moveUploadToCampaignFolder(sigFile, campaign);
    } else if (signatureDraw && signatureDraw.startsWith("data:image")) {
      signatureType = "draw";
      signatureValue = signatureDraw;
    } else if (existingInvoice && existingInvoice.signature_type && existingInvoice.signature_value) {
      signatureType = existingInvoice.signature_type;
      signatureValue = existingInvoice.signature_value;
    }

    if (!signatureType) {
      return res.render("creator_form", {
        error: "Draw or upload signature is mandatory.",
        success: null,
        form: {
          validated: true,
          campaignId,
          campaignCode,
          mobile: safeMobile,
          campaignName: campaign.campaign_name,
          creatorName: mapping.creator_name,
          amount: mapping.amount,
          ...req.body
        }
      });
    }

    let invoiceId;
    const isRegenerated = Boolean(existingInvoice);

    if (existingInvoice) {
      invoiceId = existingInvoice.id;
      await db.run(
        `UPDATE invoices SET
          creator_name = ?, invoice_type = ?, full_name = ?, address = ?, pan = ?, email = ?,
          invoice_no = ?, invoice_date = ?, payment_mode = ?, poc_name = ?, other_references = ?,
          po_number = ?, creator_gstin = ?,
          taxable_amount = ?, gst_rate = ?, cgst_rate = ?, sgst_rate = ?, igst_rate = ?,
          cgst_amount = ?, sgst_amount = ?, igst_amount = ?, gst_amount = ?, final_amount = ?,
          account_name = ?, bank_name = ?, account_no = ?, ifsc_code = ?, branch = ?, upi_id = ?,
          signature_type = ?, signature_value = ?, total_amount = ?, locked_amount = ?,
          status = ?, revision_count = COALESCE(revision_count, 0) + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          mapping.creator_name,
          invoiceKind,
          safeFullName,
          safeAddress,
          normalizedPan,
          safeEmail,
          safeInvoiceNo,
          invoiceDate,
          safePaymentMode,
          safePocName,
          safeOtherReferences,
          safePoNumber,
          normalizedGstin,
          taxableAmount,
          gstRate,
          cgstRate,
          sgstRate,
          igstRate,
          cgstAmount,
          sgstAmount,
          igstAmount,
          gstAmount,
          finalAmount,
          accountName || "",
          bankName || "",
          accountNo || "",
          normalizedIfscCode,
          branch || "",
          upiId || "",
          signatureType,
          signatureValue,
          savedTotalAmount,
          mapping.amount,
          "REGENERATED",
          invoiceId
        ]
      );
      await db.run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
    } else {
      const isHrCampaign = campaign && campaign.campaign_code && campaign.campaign_code.startsWith("HR-");
      const invoiceResult = await db.run(
        `INSERT INTO invoices (
          campaign_id, creator_mobile, creator_name, invoice_type, full_name, address, pan, email,
          invoice_no, invoice_date, payment_mode, poc_name, other_references,
          po_number, creator_gstin,
          taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate,
          cgst_amount, sgst_amount, igst_amount, gst_amount, final_amount,
          account_name, bank_name, account_no, ifsc_code, branch, upi_id,
          signature_type, signature_value, total_amount, locked_amount, status, is_hr_upload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          campaignId,
          safeMobile,
          mapping.creator_name,
          invoiceKind,
          safeFullName,
          safeAddress,
          normalizedPan,
          safeEmail,
          safeInvoiceNo,
          invoiceDate,
          safePaymentMode,
          safePocName,
          safeOtherReferences,
          safePoNumber,
          normalizedGstin,
          taxableAmount,
          gstRate,
          cgstRate,
          sgstRate,
          igstRate,
          cgstAmount,
          sgstAmount,
          igstAmount,
          gstAmount,
          finalAmount,
          accountName || "",
          bankName || "",
          accountNo || "",
          normalizedIfscCode,
          branch || "",
          upiId || "",
          signatureType,
          signatureValue,
          savedTotalAmount,
          mapping.amount,
          "SUBMITTED",
          isHrCampaign ? 1 : 0
        ]
      );
      invoiceId = invoiceResult.lastID;
    }

    for (const row of items) {
      await db.run(
        "INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)",
        [invoiceId, row.description, row.quantity, invoiceKind === "gst" ? 18 : 0, row.amount]
      );
    }

    let pdfPath = null;
    if (gstDocFile && invoiceKind === "gst") {
      const { uploadToStorage } = require("./services/s3");
      pdfPath = await uploadToStorage(gstDocFile.path, gstDocFile.originalname, gstDocFile.mimetype);
      await db.run("UPDATE invoices SET file_path = ?, pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [pdfPath, pdfPath, invoiceId]);
    } else {
      pdfPath = await ensurePdfForInvoice(invoiceId);
    }

    await notifyInvoiceSubmission(invoiceId, campaign.id, mapping.creator_name, campaign.campaign_name, isRegenerated);

    return res.render("creator_success", {
      invoice: {
        id: invoiceId,
        campaign_name: campaign.campaign_name,
        campaign_code: campaign.campaign_code,
        creator_name: mapping.creator_name,
        creator_mobile: safeMobile,
        invoice_no: safeInvoiceNo,
        invoice_date: invoiceDate,
        status: isRegenerated ? "REGENERATED" : "SUBMITTED",
        final_amount: finalAmount,
        total_amount: savedTotalAmount,
        pdf_path: pdfPath
      },
      items
    });
  } catch (error) {
    console.error("Creator submit failed:", error);
    res.render("creator_form", {
      error: "Something went wrong while submitting invoice: " + (error.message || String(error)),
      success: null,
      form: {
        validated: true,
        ...req.body
      }
    });
  }
});

app.get("/creator/submitted", async (req, res) => {
  const invoiceId = Number(req.query.invoiceId || 0);
  if (!invoiceId) {
    return res.redirect("/");
  }

  const invoice = await db.get(
    `SELECT i.*, c.campaign_name, c.campaign_code
     FROM invoices i
     JOIN campaigns c ON c.id = i.campaign_id
     WHERE i.id = ?`,
    [invoiceId]
  );

  if (!invoice) {
    return res.redirect("/");
  }

  const items = await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [invoice.id]);
  res.render("creator_success", { invoice, items });
});

app.get("/admin", (req, res) => {
  const user = getAuthenticatedUser(req) || (req.session && req.session.user);
  if (user) {
    if (user.role === "HR") return res.redirect("/hr/invoices");
    const isTeamRole = user.role === "TEAM" || user.role === "HEAD";
    return res.redirect(isTeamRole ? "/admin/folders" : "/admin/dashboard");
  }
  res.render("admin_login", { error: null });
});

app.get("/admin/login/success", requireAuth, (req, res) => {
  const user = req.session ? req.session.user : null;
  let nextUrl = "/admin/dashboard";
  if (user) {
    if (user.role === "HR") nextUrl = "/hr/invoices";
    else if (user.role === "TEAM" || user.role === "HEAD") nextUrl = "/admin/folders";
  }
  res.render("admin_login_success", { nextUrl });
});

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);
  if (!user) {
    return res.render("admin_login", { error: "Invalid credentials." });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.render("admin_login", { error: "Invalid credentials." });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    teamName: user.team_name || null
  };
  setAuthCookie(res, req, req.session.user);

  req.session.save(() => {
    res.redirect("/admin/login/success");
  });
});

const handleLogout = (req, res) => {
  clearAuthCookie(res, req);
  if (req.session) {
    req.session.user = null;
    delete req.session.user;
    req.session.destroy(() => {
      res.clearCookie("connect.sid", { path: "/" });
      res.redirect("/admin");
    });
  } else {
    res.redirect("/admin");
  }
};

app.get("/logout", handleLogout);
app.post("/logout", handleLogout);
app.get("/admin/logout", handleLogout);
app.post("/admin/logout", handleLogout);

app.use("/admin", (req, res, next) => {
  const user = getAuthenticatedUser(req);
  if (user && req.session) {
    req.session.user = user;
  }
  next();
});
app.use("/admin", requireAuth);

app.get("/admin/utr-template/download", (req, res) => {
  try {
    const wb = xlsx.utils.book_new();
    const headers = [["Phone Number", "Campaign Name", "Creator Name", "Amount", "UTR"]];
    const ws = xlsx.utils.aoa_to_sheet(headers);

    ws["!cols"] = [
      { wch: 16 },
      { wch: 25 },
      { wch: 25 },
      { wch: 15 },
      { wch: 22 }
    ];

    xlsx.utils.book_append_sheet(wb, ws, "UTR_Format");
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="UTR_Payment_Format.xlsx"');
    res.setHeader("Content-Length", buffer.length);
    return res.end(buffer);
  } catch (err) {
    console.error("UTR Download Error:", err);
    return res.status(500).send("Failed to generate UTR template file.");
  }
});

app.get("/admin/dashboard", async (req, res) => {
  const user = req.session.user;
  if (user && user.role === "HR") {
    return res.redirect("/hr/invoices");
  }
  const activeTab = req.query.tab || "invoices";
  let invoicesPromise;
  let notificationsPromise;

  if (user.role === "TEAM" || user.role === "HEAD") {
    invoicesPromise = db.all(
      `SELECT i.*, c.campaign_name, c.campaign_code, c.team_name, u.username AS head_username
       FROM invoices i
       JOIN campaigns c ON c.id = i.campaign_id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE LOWER(TRIM(c.team_name)) = LOWER(TRIM(?))
         AND COALESCE(i.is_hr_upload, 0) = 0
         AND (c.campaign_code IS NULL OR c.campaign_code NOT LIKE 'HR-%')
       ORDER BY i.id DESC`,
      [user.teamName]
    );
  } else {
    invoicesPromise = db.all(
      `SELECT i.*, c.campaign_name, c.campaign_code, c.team_name, u.username AS head_username
       FROM invoices i
       JOIN campaigns c ON c.id = i.campaign_id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE COALESCE(i.is_hr_upload, 0) = 0
         AND (c.campaign_code IS NULL OR c.campaign_code NOT LIKE 'HR-%')
       ORDER BY i.id DESC`
    );
  }

  if (user.role === "ACCOUNTS" || user.role === "SUPER_ADMIN") {
    notificationsPromise = db.all(
      `SELECT n.*, c.campaign_name, i.creator_name, i.status AS invoice_status
       FROM notifications n
       LEFT JOIN campaigns c ON c.id = n.campaign_id
       LEFT JOIN invoices i ON i.id = n.invoice_id
       WHERE n.is_read = 0
       ORDER BY n.id DESC
       LIMIT 10`
    );
  } else {
    notificationsPromise = Promise.resolve([]);
  }

  const creatorLedgerPromise = db.all(
    `SELECT 
       i.id AS invoice_id,
       i.creator_name,
       i.creator_mobile,
       i.invoice_no,
       i.invoice_date,
       COALESCE(i.final_amount, i.total_amount, 0) AS final_amount,
       i.status AS invoice_status,
       c.campaign_name,
       c.campaign_code,
       c.team_name,
       u.username AS head_username,
       c.created_at AS campaign_created_at
     FROM invoices i
     LEFT JOIN campaigns c ON c.id = i.campaign_id
     LEFT JOIN users u ON u.id = c.created_by
     WHERE COALESCE(i.is_hr_upload, 0) = 0
       AND (c.campaign_code IS NULL OR c.campaign_code NOT LIKE 'HR-%')

     UNION ALL

     SELECT 
       NULL AS invoice_id,
       cc.creator_name,
       cc.mobile AS creator_mobile,
       NULL AS invoice_no,
       NULL AS invoice_date,
       cc.amount AS final_amount,
       'NOT SUBMITTED' AS invoice_status,
       c.campaign_name,
       c.campaign_code,
       c.team_name,
       u.username AS head_username,
       c.created_at AS campaign_created_at
     FROM campaign_creators cc
     JOIN campaigns c ON c.id = cc.campaign_id
     LEFT JOIN users u ON u.id = c.created_by
     WHERE (c.campaign_code IS NULL OR c.campaign_code NOT LIKE 'HR-%')
       AND NOT EXISTS (
         SELECT 1 FROM invoices inv WHERE inv.campaign_id = cc.campaign_id AND (inv.creator_mobile = cc.mobile OR LOWER(inv.creator_name) = LOWER(cc.creator_name))
       )
     ORDER BY invoice_id DESC`
  );

  const hrInvoicesPromise = db.all(
    `SELECT i.*, c.campaign_name, c.campaign_code, c.team_name
     FROM invoices i
     LEFT JOIN campaigns c ON c.id = i.campaign_id
     WHERE i.is_hr_upload = 1 OR c.campaign_code LIKE 'HR-%'
     ORDER BY i.id DESC`
  );

  const [invoices, notifications, creatorLedger, hrInvoices] = await Promise.all([invoicesPromise, notificationsPromise, creatorLedgerPromise, hrInvoicesPromise]);
  const utrSuccess = req.session.utrSuccess || null;
  const utrError = req.session.utrError || null;
  delete req.session.utrSuccess;
  delete req.session.utrError;
  res.render("dashboard", { invoices, notifications, creatorLedger, hrInvoices, activeTab, utrSuccess, utrError });
});

// JSON API endpoint for live sync polling
app.get("/admin/api/invoices", async (req, res) => {
  const user = req.session.user;
  let invoicesPromise;
  let notificationsPromise;

  if (user.role === "TEAM" || user.role === "HEAD") {
    invoicesPromise = db.all(
      `SELECT i.*, c.campaign_name, c.campaign_code, c.team_name, u.username AS head_username
       FROM invoices i
       JOIN campaigns c ON c.id = i.campaign_id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE LOWER(TRIM(c.team_name)) = LOWER(TRIM(?))
         AND COALESCE(i.is_hr_upload, 0) = 0
         AND (c.campaign_code IS NULL OR c.campaign_code NOT LIKE 'HR-%')
       ORDER BY i.id DESC`,
      [user.teamName]
    );
  } else {
    invoicesPromise = db.all(
      `SELECT i.*, c.campaign_name, c.campaign_code, c.team_name, u.username AS head_username
       FROM invoices i
       JOIN campaigns c ON c.id = i.campaign_id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE COALESCE(i.is_hr_upload, 0) = 0
         AND (c.campaign_code IS NULL OR c.campaign_code NOT LIKE 'HR-%')
       ORDER BY i.id DESC`
    );
  }

  if (user.role === "ACCOUNTS" || user.role === "SUPER_ADMIN") {
    notificationsPromise = db.all(
      `SELECT n.*, c.campaign_name, i.creator_name, i.status AS invoice_status
       FROM notifications n
       LEFT JOIN campaigns c ON c.id = n.campaign_id
       LEFT JOIN invoices i ON i.id = n.invoice_id
       WHERE n.is_read = 0
       ORDER BY n.id DESC
       LIMIT 10`
    );
  } else {
    notificationsPromise = Promise.resolve([]);
  }

  const [invoices, notifications] = await Promise.all([invoicesPromise, notificationsPromise]);
  res.json({ invoices, notifications });
});

app.get("/admin/fun", async (req, res) => {
  res.render("fun", { activeTab: "fun" });
});

app.get("/admin/folders", requireRole(["ACCOUNTS", "SUPER_ADMIN", "HEAD", "TEAM"]), async (req, res) => {
  const folders = await loadCampaignFolderCards(req.session.user);
  res.render("admin_folders", { folders });
});

app.get("/admin/notifications", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  const notifications = await db.all(
    `SELECT n.*, c.campaign_name, c.campaign_code, i.creator_name, i.creator_mobile, i.invoice_no, i.status AS invoice_status
     FROM notifications n
     LEFT JOIN campaigns c ON c.id = n.campaign_id
     LEFT JOIN invoices i ON i.id = n.invoice_id
     ORDER BY n.id DESC`
  );
  res.render("admin_notifications", { notifications });
});

app.post("/admin/notifications/read", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  await db.run("UPDATE notifications SET is_read = 1 WHERE is_read = 0");
  res.redirect(req.get("referer") || "/admin/dashboard");
});

app.get("/admin/campaigns", requireRole(["ACCOUNTS", "HEAD", "SUPER_ADMIN", "TEAM"]), async (req, res) => {
  const user = req.session.user;
  const search = (req.query.search || "").trim();
  const campaignCards = await loadCampaignCards(user, search);
  res.render("campaigns", {
    campaigns: campaignCards,
    error: null,
    success: null,
    search,
    canEdit: user.role === "HEAD" || user.role === "SUPER_ADMIN"
  });
});

app.post("/admin/campaigns", requireRole(["HEAD", "SUPER_ADMIN"]), async (req, res) => {
  try {
    const user = req.session.user;
    const canEdit = user.role === "HEAD" || user.role === "SUPER_ADMIN";
    const { campaignName, campaignCode, teamName, brandName, externalBudget } = req.body;
    const campaigns = await loadCampaignCards(user, req.body.search || "");

    if (!campaignName || !campaignCode) {
      return res.render("campaigns", {
        campaigns,
        error: "Campaign Name and Code are required.",
        success: null,
        search: "",
        canEdit
      });
    }

    const existing = await db.get("SELECT id FROM campaigns WHERE campaign_code = ?", [campaignCode.trim()]);
    if (existing) {
      return res.render("campaigns", {
        campaigns,
        error: "Campaign Code already exists. Use a different code.",
        success: null,
        search: "",
        canEdit
      });
    }

    const appliedTeam = (user.role === "HEAD" || user.role === "TEAM") 
      ? (user.teamName || "Jhalak Moiz") 
      : (teamName || user.teamName || "Jhalak Moiz");

    const result = await db.run(
      "INSERT INTO campaigns (campaign_name, campaign_code, amount, team_name, created_by, external_budget, brand_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        campaignName.trim(),
        campaignCode.trim(),
        0,
        appliedTeam,
        user.id,
        Number(externalBudget || 0),
        (brandName || "").trim()
      ]
    );
    ensureCampaignFolders({ id: result.lastID, campaign_name: campaignName.trim() });

    res.redirect("/admin/campaigns");
  } catch (error) {
    const user = req.session.user;
    const canEdit = user ? (user.role === "HEAD" || user.role === "SUPER_ADMIN") : false;
    const campaigns = await loadCampaignCards(user, req.body.search || "");
    return res.render("campaigns", {
      campaigns,
      error: error.code === "SQLITE_CONSTRAINT" ? "Campaign Code already exists. Use a different code." : "Unable to create campaign.",
      success: null,
      search: "",
      canEdit
    });
  }
});

app.get("/admin/campaigns/:id/creators", requireRole(["ACCOUNTS", "HEAD", "SUPER_ADMIN", "TEAM"]), async (req, res) => {
  try {
    const user = req.session.user;
    const campaignId = Number(req.params.id);
    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);

    if (!campaign) {
      const folders = await loadCampaignFolderCards(user);
      return res.status(404).render("admin_folders", { folders, error: "Campaign not found." });
    }

    const userRole = String(user ? user.role : "").toUpperCase();
    if (userRole === "TEAM" || userRole === "HEAD") {
      const cTeam = String(campaign.team_name || "").trim().toLowerCase();
      const uTeam = String(user ? user.teamName : "").trim().toLowerCase();
      if (uTeam && cTeam && cTeam !== uTeam) {
        const folders = await loadCampaignFolderCards(user);
        return res.status(403).render("admin_folders", { folders, error: "Access Denied: You can only view campaigns for your team." });
      }
    }

    const creators = await loadCampaignCreatorsWithInvoices(campaign.id);
    res.render("campaign_creators", {
      campaign,
      creators,
      error: null,
      success: null,
      canEdit: userRole === "HEAD" || userRole === "SUPER_ADMIN",
      backUrl: req.query.from === "campaigns" ? "/admin/campaigns" : "/admin/folders"
    });
  } catch (err) {
    console.error("Campaign Creators Route Error:", err);
    return res.status(500).send("Error loading campaign creators: " + err.message);
  }
});

app.post("/admin/campaigns/:id/creators", requireRole(["HEAD", "SUPER_ADMIN"]), async (req, res) => {
  const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [req.params.id]);
  if (!campaign) {
    return res.redirect("/admin/campaigns");
  }

  const { creatorName, mobile, amount, live_link } = req.body;
  if (!creatorName || !mobile || !amount) {
    const creators = await loadCampaignCreatorsWithInvoices(campaign.id);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: "Creator name, mobile, and predefined amount are required.",
      success: null,
      canEdit: true,
      backUrl: "/admin/folders"
    });
  }

  await db.run(
    "INSERT INTO campaign_creators (campaign_id, creator_name, mobile, amount, live_link) VALUES (?, ?, ?, ?, ?)",
    [campaign.id, creatorName.trim(), mobile.trim(), Number(amount), (live_link || "").trim()]
  );

  res.redirect(`/admin/campaigns/${campaign.id}/creators`);
});

app.post("/admin/campaigns/:id/creators/bulk", requireRole(["HEAD", "SUPER_ADMIN"]), upload.single("creatorFile"), async (req, res) => {
  const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [req.params.id]);
  if (!campaign) {
    return res.redirect("/admin/campaigns");
  }

  if (!req.file) {
    const creators = await loadCampaignCreatorsWithInvoices(campaign.id);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: "Please upload a CSV or Excel file.",
      success: null,
      canEdit: true,
      backUrl: "/admin/folders"
    });
  }

  try {
    const rows = extractCreatorsFromSheet(req.file.path);
    const inserted = [];
    const skipped = [];

    for (const row of rows) {
      if (!row.creatorName || !row.mobile || !Number.isFinite(row.amount) || Number(row.amount) <= 0) {
        skipped.push(row);
        continue;
      }

      const existing = await db.get(
        "SELECT id FROM campaign_creators WHERE campaign_id = ? AND (REPLACE(REPLACE(REPLACE(TRIM(mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(?), ' ', ''), '-', ''), '+91', ''))",
        [campaign.id, row.mobile]
      );

      if (existing) {
        await db.run(
          "UPDATE campaign_creators SET creator_name = ?, amount = ?, live_link = COALESCE(?, live_link) WHERE id = ?",
          [row.creatorName, Number(row.amount), row.live_link || null, existing.id]
        );
        inserted.push({ ...row, updated: true });
      } else {
        await db.run(
          "INSERT INTO campaign_creators (campaign_id, creator_name, mobile, amount, live_link) VALUES (?, ?, ?, ?, ?)",
          [campaign.id, row.creatorName, row.mobile, Number(row.amount), row.live_link || null]
        );
        inserted.push(row);
      }
    }

    const creators = await loadCampaignCreatorsWithInvoices(campaign.id);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: null,
      success: `Bulk upload complete. Added/updated ${inserted.length} creators${skipped.length ? `, skipped ${skipped.length} invalid rows` : ""}.`,
      canEdit: true,
      backUrl: "/admin/folders"
    });
  } catch (error) {
    const creators = await loadCampaignCreatorsWithInvoices(campaign.id);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: `Bulk upload failed: ${error.message}`,
      success: null,
      canEdit: true,
      backUrl: "/admin/folders"
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Delete Campaign Route (HEAD, ACCOUNTS, SUPER_ADMIN)
app.post("/admin/campaigns/:id/delete", requireRole(["HEAD", "SUPER_ADMIN", "ACCOUNTS"]), async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
    if (!campaign) {
      return res.redirect("/admin/folders");
    }

    const user = req.session.user;
    if (user.role === "HEAD" && user.teamName) {
      if (String(campaign.team_name || "").trim().toLowerCase() !== String(user.teamName).trim().toLowerCase()) {
        return res.status(403).send("Access Denied: You can only delete campaigns belonging to your team.");
      }
    }

    const { deleteFromStorage } = require("./services/s3");
    const invs = await db.all("SELECT id, file_path, pdf_path, signature_value FROM invoices WHERE campaign_id = ?", [campaignId]);
    for (const inv of invs) {
      if (inv.file_path) {
        try { await deleteFromStorage(inv.file_path); } catch (e) { console.error("S3 delete error file_path:", e); }
      }
      if (inv.pdf_path) {
        try { await deleteFromStorage(inv.pdf_path); } catch (e) { console.error("S3 delete error pdf_path:", e); }
      }
      if (inv.signature_value && inv.signature_value.startsWith("/uploads")) {
        try { await deleteFromStorage(inv.signature_value); } catch (e) { console.error("S3 delete error signature:", e); }
      }
      await db.run("DELETE FROM notifications WHERE invoice_id = ?", [inv.id]);
      await db.run("DELETE FROM invoice_items WHERE invoice_id = ?", [inv.id]);
    }
    await db.run("DELETE FROM notifications WHERE campaign_id = ?", [campaignId]);
    await db.run("DELETE FROM invoices WHERE campaign_id = ?", [campaignId]);
    await db.run("DELETE FROM campaign_creators WHERE campaign_id = ?", [campaignId]);
    await db.run("DELETE FROM campaigns WHERE id = ?", [campaignId]);

    const redirectUrl = req.get("referer") || "/admin/folders";
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error("Delete Campaign Error:", err);
    return res.status(500).send("Failed to delete campaign: " + err.message);
  }
});

// Delete Creator from Campaign Route (HEAD, ACCOUNTS, SUPER_ADMIN)
app.post("/admin/campaigns/:campaignId/creators/:creatorId/delete", requireRole(["HEAD", "SUPER_ADMIN", "ACCOUNTS"]), async (req, res) => {
  try {
    const campaignId = Number(req.params.campaignId);
    const creatorId = Number(req.params.creatorId);

    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
    if (!campaign) {
      return res.redirect("/admin/folders");
    }

    const user = req.session.user;
    if (user.role === "HEAD" && user.teamName) {
      if (String(campaign.team_name || "").trim().toLowerCase() !== String(user.teamName).trim().toLowerCase()) {
        return res.status(403).send("Access Denied: You can only edit campaigns belonging to your team.");
      }
    }

    await db.run("DELETE FROM campaign_creators WHERE id = ? AND campaign_id = ?", [creatorId, campaignId]);
    return res.redirect(`/admin/campaigns/${campaignId}/creators`);
  } catch (err) {
    console.error("Delete Creator Error:", err);
    return res.status(500).send("Failed to delete creator: " + err.message);
  }
});



app.post("/admin/upload-utr", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), upload.single("utrFile"), async (req, res) => {
  if (!req.file) {
    req.session.utrError = "Please select a valid CSV or Excel file to upload.";
    return res.redirect("/admin/dashboard");
  }

  try {
    const workbook = xlsx.readFile(req.file.path, { cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("File does not contain any sheets.");
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows.length) {
      throw new Error("Uploaded file is empty.");
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rawRows) {
      const normalized = Object.keys(row).reduce((acc, key) => {
        acc[normalizeHeader(key)] = row[key];
        return acc;
      }, {});

      const creatorName = String(normalized.creatorname || normalized.creator || normalized.name || "").trim();
      const srNo = String(normalized.srno || normalized.serialnumber || normalized.sr || normalized.mobile || "").trim();
      const campaignName = String(normalized.campaignname || normalized.campaign || normalized.code || "").trim();
      const utr = String(normalized.utr || normalized.utrnumber || normalized.utrno || "").trim();

      if (!utr || (!creatorName && !srNo)) {
        skippedCount++;
        continue;
      }

      let query = `UPDATE invoices SET utr = ?, updated_at = CURRENT_TIMESTAMP WHERE (`;
      let params = [utr];
      let conditions = [];

      if (creatorName) {
        conditions.push(`LOWER(TRIM(creator_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(full_name)) = LOWER(TRIM(?))`);
        params.push(creatorName, creatorName);
      }
      if (srNo) {
        conditions.push(`REPLACE(REPLACE(REPLACE(TRIM(creator_mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(?), ' ', ''), '-', ''), '+91', '')`);
        params.push(srNo);
      }

      query += conditions.join(" OR ") + `)`;

      if (campaignName) {
        query += ` AND campaign_id IN (SELECT id FROM campaigns WHERE LOWER(TRIM(campaign_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(campaign_code)) = LOWER(TRIM(?)))`;
        params.push(campaignName, campaignName);
      }

      const result = await db.run(query, params);

      if (result.changes > 0) {
        updatedCount += result.changes;
      } else {
        skippedCount++;
      }
    }

    try { fs.unlinkSync(req.file.path); } catch (_) {}

    if (updatedCount > 0) {
      req.session.utrSuccess = `Successfully updated UTR for ${updatedCount} invoice(s)! (${skippedCount} rows skipped/unmatched)`;
      const io = req.app.get('io');
      if (io) {
        io.emit('notification', { message: `✨ UTR payment batch updated for ${updatedCount} invoice(s)!` });
      }
    } else {
      req.session.utrError = `No matching invoices found for the creator names in the uploaded file (${skippedCount} rows skipped).`;
    }
  } catch (err) {
    req.session.utrError = "Failed to process UTR file: " + err.message;
  }

  res.redirect("/admin/dashboard");
});

app.get("/admin/invoices/:id", async (req, res) => {
  const invoice = await db.get(
    `SELECT i.*, c.campaign_name, c.campaign_code, c.team_name, u.username AS head_username, cc.live_link
     FROM invoices i
     JOIN campaigns c ON c.id = i.campaign_id
     LEFT JOIN users u ON u.id = c.created_by
     LEFT JOIN campaign_creators cc ON cc.campaign_id = i.campaign_id AND (
       REPLACE(REPLACE(REPLACE(TRIM(cc.mobile), ' ', ''), '-', ''), '+91', '') = REPLACE(REPLACE(REPLACE(TRIM(i.creator_mobile), ' ', ''), '-', ''), '+91', '')
       OR LOWER(TRIM(cc.creator_name)) = LOWER(TRIM(i.creator_name))
     )
     WHERE i.id = ?`,
    [req.params.id]
  );

  if (!invoice) {
    return res.redirect("/admin/dashboard");
  }

  const items = await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [invoice.id]);
  const backUrl = req.query.from === "folders" ? "/admin/folders" : "/admin/dashboard";
  res.render("invoice_view", { invoice, items, error: null, backUrl });
});

app.post("/admin/invoices/:id/status", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  const { action, reason } = req.body;
  const invoice = await db.get("SELECT * FROM invoices WHERE id = ?", [req.params.id]);
  if (!invoice) {
    return res.redirect("/admin/dashboard");
  }

  let nextStatus = "ACCEPTED";
  if (action === "accept") nextStatus = "ACCEPTED";
  else if (action === "reject") nextStatus = "REJECTED";
  else if (action === "payment_completed" || action === "paid") nextStatus = "PAYMENT COMPLETED";
  
  const rejectionReason = nextStatus === "REJECTED" ? String(reason || "").trim() : null;

  if (nextStatus === "REJECTED" && !rejectionReason) {
    const items = await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [invoice.id]);
    return res.render("invoice_view", {
      invoice,
      items,
      error: "Rejection Reason is compulsory when rejecting an invoice.",
      backUrl: "/admin/dashboard"
    });
  }

  await db.run(
    "UPDATE invoices SET status = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [nextStatus, rejectionReason, invoice.id]
  );

  // Send automated email notification to creator's Gmail / Email
  try {
    let creatorEmail = invoice.email;
    if (!creatorEmail || !creatorEmail.includes("@")) {
      const mapping = await db.get(
        "SELECT email FROM campaign_creators WHERE campaign_id = ? AND (mobile = ? OR LOWER(creator_name) = LOWER(?))",
        [invoice.campaign_id, invoice.creator_mobile, invoice.creator_name]
      );
      if (mapping && mapping.email) creatorEmail = mapping.email;
    }

    const campaign = await db.get("SELECT campaign_name FROM campaigns WHERE id = ?", [invoice.campaign_id]);
    const { sendInvoiceStatusEmail } = require("./services/mailer");
    sendInvoiceStatusEmail({
      to: creatorEmail,
      status: nextStatus,
      invoiceNo: invoice.invoice_no,
      creatorName: invoice.creator_name,
      campaignName: campaign ? campaign.campaign_name : "3Folks Campaign",
      amount: invoice.final_amount || invoice.total_amount,
      rejectionReason: rejectionReason,
      utr: invoice.utr
    }).catch(e => console.error("[Mailer Error]:", e));
  } catch (mailErr) {
    console.error("[Mailer Error]:", mailErr);
  }

  const io = req.app.get('io');
  if (io) {
    io.emit('invoice-status-updated', {
      id: invoice.id,
      invoice_no: invoice.invoice_no,
      status: nextStatus,
      rejection_reason: rejectionReason
    });
  }

  res.redirect(req.get("referer") || "/admin/dashboard");
});

app.get("/admin/invoices/:id/edit", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  return res.redirect(`/admin/invoices/${req.params.id}`);
});

app.post("/admin/invoices/:id/edit", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  return res.redirect(`/admin/invoices/${req.params.id}`);
});

app.get("/admin/users/stop-impersonating", async (req, res) => {
  if (req.session.originalUser) {
    req.session.user = req.session.originalUser;
    delete req.session.originalUser;
    delete req.session.isImpersonating;
  }
  req.session.save(() => {
    res.redirect("/admin/users");
  });
});

app.post("/admin/users/:id/impersonate", async (req, res) => {
  const currentUser = req.session.user;
  const originalUser = req.session.originalUser;

  const isSuperAdmin = (currentUser && currentUser.role === "SUPER_ADMIN") ||
                      (originalUser && originalUser.role === "SUPER_ADMIN");

  if (!isSuperAdmin) {
    return res.status(403).send("Forbidden");
  }

  const targetId = Number(req.params.id);
  const targetUser = await db.get("SELECT id, username, role, team_name FROM users WHERE id = ?", [targetId]);

  if (!targetUser) {
    return res.status(404).send("User not found");
  }

  if (!req.session.originalUser) {
    req.session.originalUser = { ...req.session.user };
  }

  req.session.user = {
    id: targetUser.id,
    username: targetUser.username,
    role: targetUser.role,
    teamName: targetUser.team_name || null
  };
  req.session.isImpersonating = true;

  req.session.save((err) => {
    if (err) {
      console.error("[Impersonate] session.save error:", err);
      return res.status(500).send("Session save failed. Try again.");
    }
    res.redirect("/admin/dashboard");
  });
});

app.get("/admin/users", requireRole(["SUPER_ADMIN", "HR"]), async (req, res) => {
  const usersPromise = db.all("SELECT id, username, role, team_name, created_at FROM users ORDER BY id DESC");
  const creatorLedgerPromise = db.all(
    `SELECT 
       i.id AS invoice_id,
       i.creator_name,
       i.creator_mobile,
       i.invoice_no,
       i.invoice_date,
       i.final_amount,
       i.total_amount,
       i.status AS invoice_status,
       c.campaign_name,
       c.campaign_code,
       c.created_at AS campaign_created_at
     FROM invoices i
     LEFT JOIN campaigns c ON c.id = i.campaign_id
     ORDER BY i.id DESC`
  );
  const [users, creatorLedger] = await Promise.all([usersPromise, creatorLedgerPromise]);
  res.render("users", { users, creatorLedger, user: req.session.user, error: null });
});

app.post("/admin/users", requireRole(["SUPER_ADMIN", "HR"]), async (req, res) => {
  const { username, password, role, teamName } = req.body;
  if (!username || !password || !role || ((role === "TEAM" || role === "HEAD") && (!teamName || !teamName.trim()))) {
    const usersPromise = db.all("SELECT id, username, role, team_name, created_at FROM users ORDER BY id DESC");
    const creatorLedgerPromise = db.all(
      `SELECT 
         i.id AS invoice_id,
         i.creator_name,
         i.creator_mobile,
         i.invoice_no,
         i.invoice_date,
         i.final_amount,
         i.total_amount,
         i.status AS invoice_status,
         c.campaign_name,
         c.campaign_code,
         c.created_at AS campaign_created_at
       FROM invoices i
       LEFT JOIN campaigns c ON c.id = i.campaign_id
       ORDER BY i.id DESC`
    );
    const [users, creatorLedger] = await Promise.all([usersPromise, creatorLedgerPromise]);
    return res.render("users", { users, creatorLedger, user: req.session.user, error: "Username, Password, Role, and Team Name (for HEAD & TEAM roles) are required." });
  }

  const hash = await bcrypt.hash(password, 10);
  await db.run("INSERT INTO users (username, password_hash, role, team_name) VALUES (?, ?, ?, ?)", [
    username.trim(),
    hash,
    role,
    teamName || null
  ]);

  res.redirect("/admin/users");
});

app.post("/admin/users/:id/reset", requireRole(["SUPER_ADMIN", "HR"]), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.redirect("/admin/users");
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
  res.redirect("/admin/users");
});

app.post("/admin/users/:id/delete", requireRole(["SUPER_ADMIN", "HR"]), async (req, res) => {
  await db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
  res.redirect("/admin/users");
});

// ── HR INVOICES PORTAL ROUTES (HR & SUPER_ADMIN) ──
app.get("/hr/invoices", requireRole(["HR", "SUPER_ADMIN"]), async (req, res) => {
  try {
    const hrInvoices = await db.all(
      `SELECT i.*, c.campaign_name, c.campaign_code, c.team_name
       FROM invoices i
       LEFT JOIN campaigns c ON c.id = i.campaign_id
       WHERE i.is_hr_upload = 1 OR c.campaign_code LIKE 'HR-%'
       ORDER BY i.id DESC`
    );
    const hrAssignments = await db.all(
      `SELECT cc.*, c.campaign_name, c.campaign_code, c.team_name
       FROM campaign_creators cc
       JOIN campaigns c ON c.id = cc.campaign_id
       WHERE c.campaign_code LIKE 'HR-%'
         AND NOT EXISTS (
           SELECT 1 FROM invoices inv WHERE inv.campaign_id = cc.campaign_id AND (inv.creator_mobile = cc.mobile OR LOWER(inv.creator_name) = LOWER(cc.creator_name))
         )
       ORDER BY cc.id DESC`
    );

    res.render("hr_invoices", {
      user: req.session.user,
      hrInvoices,
      hrAssignments,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("HR Invoices Error:", err);
    res.render("hr_invoices", {
      user: req.session.user,
      hrInvoices: [],
      hrAssignments: [],
      error: "Failed to load HR invoices: " + err.message
    });
  }
});

app.post("/hr/invoices/create", requireRole(["HR", "SUPER_ADMIN"]), async (req, res) => {
  try {
    const { employeeName, creatorName, mobile, amount, paymentMode, teamName, invoiceType } = req.body;
    const name = String(employeeName || creatorName || "").trim();
    const phone = String(mobile || "").trim();
    const mode = String(paymentMode || "Bank Transfer").trim();
    const numAmount = Number(amount) || 0;

    if (!name || !phone || !numAmount) {
      return res.redirect("/hr/invoices?error=" + encodeURIComponent("Employee Name, Phone Number, and Amount are required."));
    }

    const hrCampaignCode = `HR-${Math.floor(1000 + Math.random() * 9000)}`;

    const campaignResult = await db.run(
      "INSERT INTO campaigns (campaign_name, campaign_code, amount, team_name, created_by) VALUES (?, ?, ?, ?, ?)",
      [`HR Invoice - ${name}`, hrCampaignCode, numAmount, (teamName || "HR Team").trim(), req.session.user.id]
    );

    await db.run(
      "INSERT INTO campaign_creators (campaign_id, creator_name, mobile, amount, live_link) VALUES (?, ?, ?, ?, ?)",
      [campaignResult.lastID, name, phone, numAmount, mode]
    );

    return res.redirect("/hr/invoices?success=" + encodeURIComponent(`Employee ${name} assigned successfully! Campaign Code: ${hrCampaignCode}`));
  } catch (err) {
    console.error("HR Create Invoice Error:", err);
    return res.redirect("/hr/invoices?error=" + encodeURIComponent("Failed to create HR employee assignment: " + err.message));
  }
});

app.post("/hr/invoices/upload", requireRole(["HR", "SUPER_ADMIN"]), upload.single("invoiceFile"), async (req, res) => {
  try {
    const { invoiceNo, creatorName, amount, invoiceDate, invoiceType, description } = req.body;
    if (!invoiceNo || !creatorName || !amount || !req.file) {
      return res.redirect("/hr/invoices?error=" + encodeURIComponent("Invoice No, Creator Name, Amount, and File upload are required."));
    }

    const { uploadToStorage } = require("./services/s3");
    const numAmount = Number(amount) || 0;
    const isGst = invoiceType === "upload_gst";
    const hrLabel = isGst ? "Uploaded GST Invoice" : "Uploaded NON-GST Invoice";
    const filePath = await uploadToStorage(req.file.path, req.file.originalname, req.file.mimetype);

    let campaign = await db.get("SELECT id FROM campaigns WHERE campaign_code = 'HR-DEPT' LIMIT 1");
    if (!campaign) {
      const result = await db.run(
        "INSERT INTO campaigns (campaign_name, campaign_code, amount, team_name, created_by) VALUES (?, ?, ?, ?, ?)",
        ["HR Department Uploads", "HR-DEPT", 0, "HR", req.session.user.id]
      );
      campaign = { id: result.lastID };
    }

    await db.run(
      `INSERT INTO invoices (
        campaign_id, creator_mobile, creator_name, full_name, invoice_type, invoice_no, invoice_date,
        other_references, total_amount, final_amount, status, is_hr_upload, hr_invoice_type, file_path, pdf_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        campaign.id,
        "HR-UPLOAD",
        creatorName.trim(),
        creatorName.trim(),
        isGst ? "gst" : "non_gst",
        invoiceNo.trim(),
        invoiceDate || new Date().toISOString().split("T")[0],
        description ? description.trim() : null,
        numAmount,
        numAmount,
        "ACCEPTED",
        hrLabel,
        filePath,
        filePath
      ]
    );

    return res.redirect("/hr/invoices?success=" + encodeURIComponent(`Document for Invoice #${invoiceNo.trim()} uploaded successfully!`));
  } catch (err) {
    console.error("HR Upload Invoice Error:", err);
    return res.redirect("/hr/invoices?error=" + encodeURIComponent("Failed to upload HR document: " + err.message));
  }
});

app.post("/hr/invoices/:id/delete", requireRole(["HR", "SUPER_ADMIN"]), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const invoice = await db.get("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
    if (!invoice) {
      return res.redirect("/hr/invoices?error=" + encodeURIComponent("Invoice not found."));
    }

    const { deleteFromStorage } = require("./services/s3");
    if (invoice.file_path) {
      await deleteFromStorage(invoice.file_path);
    }
    if (invoice.pdf_path && invoice.pdf_path !== invoice.file_path) {
      await deleteFromStorage(invoice.pdf_path);
    }

    await db.run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
    await db.run("DELETE FROM notifications WHERE invoice_id = ?", [invoiceId]);
    await db.run("DELETE FROM invoices WHERE id = ?", [invoiceId]);

    return res.redirect("/hr/invoices?success=" + encodeURIComponent(`Invoice #${invoice.invoice_no} deleted successfully.`));
  } catch (err) {
    console.error("HR Delete Invoice Error:", err);
    return res.redirect("/hr/invoices?error=" + encodeURIComponent("Failed to delete invoice: " + err.message));
  }
});

app.get("/admin/api/creator-summary", requireAuth, async (req, res) => {
  try {
    const creatorName = String(req.query.name || "").trim();
    const creatorMobile = String(req.query.mobile || "").trim();

    if (!creatorName) {
      return res.json({ success: false, message: "Creator name required" });
    }

    let mapQuery = `
      SELECT cc.id, cc.campaign_id, cc.creator_name, cc.mobile, cc.amount, c.campaign_name, c.campaign_code, c.team_name, c.created_by
      FROM campaign_creators cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE LOWER(TRIM(cc.creator_name)) = LOWER(TRIM(?))
    `;
    let mapParams = [creatorName];
    if (creatorMobile) {
      mapQuery += " AND LOWER(TRIM(cc.mobile)) = LOWER(TRIM(?))";
      mapParams.push(creatorMobile);
    }
    mapQuery += " ORDER BY cc.id DESC";
    const creatorCampaigns = await db.all(mapQuery, mapParams);

    let invQuery = `
      SELECT i.*, c.campaign_name, c.campaign_code
      FROM invoices i
      JOIN campaigns c ON c.id = i.campaign_id
      WHERE LOWER(TRIM(i.creator_name)) = LOWER(TRIM(?))
    `;
    let invParams = [creatorName];
    if (creatorMobile) {
      invQuery += " AND LOWER(TRIM(i.creator_mobile)) = LOWER(TRIM(?))";
      invParams.push(creatorMobile);
    }
    invQuery += " ORDER BY i.id DESC";
    const creatorInvoices = await db.all(invQuery, invParams);

    // Fetch all users for resolving created_by IDs and Team Heads
    const allUsers = await db.all("SELECT id, username, role, team_name FROM users");
    const userById = {};
    const teamHeadsMap = {};

    allUsers.forEach(u => {
      userById[u.id] = u.username;
      userById[u.username] = u.username;
      if (u.role === 'HEAD' && u.team_name) {
        if (!teamHeadsMap[u.team_name]) teamHeadsMap[u.team_name] = [];
        teamHeadsMap[u.team_name].push(u.username);
      }
    });

    const latestInvoice = creatorInvoices.length > 0 ? creatorInvoices[0] : null;

    const isGstRegistered = Boolean(
      latestInvoice && 
      latestInvoice.creator_gstin && 
      String(latestInvoice.creator_gstin).trim().length > 0 && 
      String(latestInvoice.invoice_type).toLowerCase() === "gst"
    );

    const reqCampaignId = req.query.campaign_id ? Number(req.query.campaign_id) : null;

    const totalCampaigns = creatorCampaigns.length;
    const predefinedBudget = creatorCampaigns.reduce((s, c) => s + Number(c.amount || 0), 0);

    let usualAmount = 0;
    if (reqCampaignId) {
      const matchMap = creatorCampaigns.find(c => Number(c.campaign_id) === reqCampaignId);
      if (matchMap) {
        usualAmount = Number(matchMap.amount || 0);
      }
    }
    if (!usualAmount && creatorCampaigns.length > 0) {
      usualAmount = Number(creatorCampaigns[0].amount || 0);
    }

    const settledPayout = creatorInvoices.filter(i => i.utr && String(i.utr).trim().length > 0).reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const pendingPayout = creatorInvoices.filter(i => (!i.utr || String(i.utr).trim().length === 0) && ['ACCEPTED', 'SUBMITTED', 'REGENERATED'].includes(i.status)).reduce((s, i) => s + Number(i.total_amount || 0), 0);

    const latestSettledInvoice = creatorInvoices.find(i => i.utr && String(i.utr).trim().length > 0);

    let lastPaymentText = "No payment settled yet";
    if (latestSettledInvoice) {
      const dt = new Date(latestSettledInvoice.updated_at || latestSettledInvoice.created_at);
      const diffMs = Date.now() - dt.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      let timeAgo = "Recently";
      if (diffDays <= 0) timeAgo = "Today";
      else if (diffDays === 1) timeAgo = "1 Day Ago";
      else if (diffDays < 30) timeAgo = `${diffDays} Days Ago`;
      else if (diffDays < 365) timeAgo = `${Math.floor(diffDays / 30)} Month(s) Ago`;
      else timeAgo = `${Math.floor(diffDays / 365)} Year(s) Ago`;

      lastPaymentText = `${timeAgo} (${latestSettledInvoice.utr})`;
    } else if (pendingPayout > 0) {
      lastPaymentText = "Payment Pending (No UTR)";
    }

    const campaignsList = creatorCampaigns.map(cc => {
      const inv = creatorInvoices.find(i => i.campaign_id === cc.campaign_id);
      const createdByUsername = userById[cc.created_by] || 'Admin';
      return {
        campaignId: cc.campaign_id,
        campaignName: cc.campaign_name,
        campaignCode: cc.campaign_code,
        teamName: cc.team_name || '—',
        createdBy: createdByUsername,
        predefinedAmount: Number(cc.amount || 0),
        invoiceNo: inv ? (inv.invoice_no || `#${inv.id}`) : null,
        invoiceStatus: inv ? inv.status : 'NOT_SUBMITTED',
        invoiceAmount: inv ? Number(inv.total_amount || 0) : null,
        utr: inv ? (inv.utr || null) : null
      };
    });

    // Compute Monthly & Yearly Breakdown
    const monthlyMap = {};
    const yearlyMap = {};

    creatorCampaigns.forEach(cc => {
      const dt = new Date(cc.created_at || Date.now());
      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${dt.getFullYear()}`;
      const monthLabel = dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const amount = Number(cc.amount || 0);

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { periodKey: monthKey, periodLabel: monthLabel, campaignsCount: 0, grossAmount: 0, settledAmount: 0, pendingAmount: 0 };
      }
      monthlyMap[monthKey].campaignsCount += 1;
      monthlyMap[monthKey].grossAmount += amount;

      if (!yearlyMap[yearKey]) {
        yearlyMap[yearKey] = { periodKey: yearKey, periodLabel: yearKey, campaignsCount: 0, grossAmount: 0, settledAmount: 0, pendingAmount: 0 };
      }
      yearlyMap[yearKey].campaignsCount += 1;
      yearlyMap[yearKey].grossAmount += amount;
    });

    creatorInvoices.forEach(inv => {
      const dt = new Date(inv.created_at || Date.now());
      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${dt.getFullYear()}`;
      const amount = Number(inv.total_amount || 0);
      const isSettled = inv.utr && String(inv.utr).trim().length > 0;

      if (monthlyMap[monthKey]) {
        if (isSettled) monthlyMap[monthKey].settledAmount += amount;
        else if (['ACCEPTED', 'SUBMITTED', 'REGENERATED'].includes(inv.status)) monthlyMap[monthKey].pendingAmount += amount;
      }

      if (yearlyMap[yearKey]) {
        if (isSettled) yearlyMap[yearKey].settledAmount += amount;
        else if (['ACCEPTED', 'SUBMITTED', 'REGENERATED'].includes(inv.status)) yearlyMap[yearKey].pendingAmount += amount;
      }
    });

    const monthlyBreakdown = Object.values(monthlyMap).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    const yearlyBreakdown = Object.values(yearlyMap).sort((a, b) => b.periodKey.localeCompare(a.periodKey));

    // Calculate Tenure Text
    let tenureText = "1 Month";
    if (creatorCampaigns.length > 0) {
      const dates = creatorCampaigns.map(c => new Date(c.created_at || Date.now()).getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      const monthDiff = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1;
      if (monthDiff >= 12) {
        const yrs = Math.floor(monthDiff / 12);
        const mos = monthDiff % 12;
        tenureText = `${yrs} Year${yrs > 1 ? 's' : ''}${mos > 0 ? ` ${mos} Month${mos > 1 ? 's' : ''}` : ''}`;
      } else {
        tenureText = `${monthDiff} Month${monthDiff > 1 ? 's' : ''}`;
      }
    }

    // Compute Team Leads & POC Directory
    const pocMap = {};
    creatorCampaigns.forEach(cc => {
      const inv = creatorInvoices.find(i => i.campaign_id === cc.campaign_id);
      const teamName = cc.team_name || 'General Team';
      const createdByUsername = userById[cc.created_by] || 'Admin';
      const headNames = teamHeadsMap[teamName] ? teamHeadsMap[teamName].join(' / ') : null;

      let pocName = '—';
      if (inv && inv.poc_name && String(inv.poc_name).trim().length > 0) {
        pocName = inv.poc_name;
      } else if (headNames) {
        pocName = headNames;
      } else {
        pocName = createdByUsername;
      }

      const key = `${teamName}|${pocName}`;

      if (!pocMap[key]) {
        pocMap[key] = {
          teamName,
          pocName,
          createdBy: createdByUsername,
          campaignsCount: 0,
          campaignsList: []
        };
      }
      pocMap[key].campaignsCount += 1;
      if (!pocMap[key].campaignsList.includes(cc.campaign_name)) {
        pocMap[key].campaignsList.push(cc.campaign_name);
      }
    });
    const teamLeadsDirectory = Object.values(pocMap);

    return res.json({
      success: true,
      creatorName,
      creatorMobile: creatorMobile || (latestInvoice ? latestInvoice.creator_mobile : '') || '—',
      email: latestInvoice && latestInvoice.email ? latestInvoice.email : '—',
      address: latestInvoice && latestInvoice.address ? latestInvoice.address : '—',
      fullBillingName: latestInvoice && latestInvoice.full_name ? latestInvoice.full_name : creatorName,
      totalCampaigns: `${totalCampaigns} Campaign${totalCampaigns === 1 ? '' : 's'}`,
      predefinedBudgetFormatted: `₹${predefinedBudget.toLocaleString('en-IN')}`,
      usualAmountFormatted: `₹${Math.round(usualAmount).toLocaleString('en-IN')}`,
      settledPayoutFormatted: `₹${settledPayout.toLocaleString('en-IN')}`,
      pendingPayoutFormatted: `₹${pendingPayout.toLocaleString('en-IN')}`,
      lastCampaignName: creatorCampaigns.length > 0 ? creatorCampaigns[0].campaign_name : '—',
      lastCampaignCode: creatorCampaigns.length > 0 ? creatorCampaigns[0].campaign_code : '—',
      lastPaymentText,
      taxStatus: isGstRegistered ? "GST Registered" : "Non-GST Exempt",
      isGstRegistered,
      pan: latestInvoice && latestInvoice.pan ? latestInvoice.pan : '—',
      gstin: isGstRegistered && latestInvoice ? latestInvoice.creator_gstin : '—',
      accountName: latestInvoice && latestInvoice.account_name ? latestInvoice.account_name : '—',
      bankName: latestInvoice && latestInvoice.bank_name ? latestInvoice.bank_name : '—',
      accountNo: latestInvoice && latestInvoice.account_no ? `••••${latestInvoice.account_no.slice(-4)}` : '—',
      ifscCode: latestInvoice && latestInvoice.ifsc_code ? latestInvoice.ifsc_code : '—',
      branch: latestInvoice && latestInvoice.branch ? latestInvoice.branch : '—',
      upiId: latestInvoice && latestInvoice.upi_id ? latestInvoice.upi_id : '—',
      campaignsList,
      tenureText,
      totalInvoicesCount: creatorInvoices.length,
      monthlyBreakdown,
      yearlyBreakdown,
      teamLeadsDirectory
    });
  } catch (err) {
    console.error("Creator Summary API Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/admin/creators/dossier/pdf", requireAuth, async (req, res) => {
  try {
    const creatorName = String(req.query.name || "").trim();
    const creatorMobile = String(req.query.mobile || "").trim();
    if (!creatorName) {
      return res.status(400).send("Creator name required");
    }
    const pdfPath = await generateCreatorDossierPdf(creatorName, creatorMobile);
    return res.redirect(pdfPath);
  } catch (err) {
    console.error("PDF Dossier Export Error:", err);
    return res.status(500).send("Failed to generate PDF Dossier: " + err.message);
  }
});

app.use((req, res, next) => {
  if (isAdminArea(req.path)) {
    if (req.path === "/admin" || req.path === "/admin/") {
      return next();
    }
    return res.status(404).render("admin_login", { error: "Page not found (404)." });
  }
  next();
});

async function startServer(port) {
  try {
    const http = require('http');
    const server = http.createServer(app);

    if (SocketIO) {
      const io = new SocketIO(server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });

      app.set('io', io);

      io.on('connection', (socket) => {
        console.log('⚡ Socket connected:', socket.id);
      });
    }

    server.listen(port, () => {
      console.log(`Portal running at http://localhost:${port}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE" && port < 3100 && !process.env.PORT) {
        console.warn(`Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
        return;
      }
      throw error;
    });
  } catch (error) {
    if (error.code === "EADDRINUSE" && port < 3100 && !process.env.PORT) {
      console.warn(`Port ${port} is busy, trying ${port + 1}...`);
      return startServer(port + 1);
    }
    throw error;
  }
}

if (require.main === module) {
  dbReady
    .then(() => startServer(START_PORT))
    .catch((err) => {
      console.error("❌ Server startup error:", err);
    });
}

module.exports = app;
