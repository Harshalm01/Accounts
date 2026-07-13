const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("./db");
const { requireAuth, requireRole, isAdminArea } = require("./middleware/auth");
const { ensurePdfForInvoice } = require("./services/pdf");

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
    db.get("SELECT sess FROM sessions WHERE sid = ? AND expire > ?", [sid, Date.now()])
      .then((row) => cb(null, row ? JSON.parse(row.sess) : null))
      .catch(cb);
  }

  set(sid, sess, cb) {
    const ttl = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
    db.run(
      `INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`,
      [sid, JSON.stringify(sess), ttl]
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
    secure: "auto",
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
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions(req));
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

async function loadCampaignFolderCards() {
  const campaigns = await db.all(
    `SELECT c.*, COUNT(DISTINCT cc.id) AS creator_count, COUNT(DISTINCT i.id) AS invoice_count
     FROM campaigns c
     LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
     LEFT JOIN invoices i ON i.campaign_id = c.id
     GROUP BY c.id
     ORDER BY c.id DESC`
  );

  const folders = [];
  for (const campaign of campaigns) {
    const creators = await db.all(
      `SELECT cc.id, cc.creator_name, cc.mobile, cc.amount, COUNT(i.id) AS invoice_count
       , (
         SELECT i2.id
         FROM invoices i2
         WHERE i2.campaign_id = cc.campaign_id AND i2.creator_mobile = cc.mobile
         ORDER BY i2.id DESC
         LIMIT 1
       ) AS latest_invoice_id
       , (
         SELECT i2.pdf_path
         FROM invoices i2
         WHERE i2.campaign_id = cc.campaign_id AND i2.creator_mobile = cc.mobile
         ORDER BY i2.id DESC
         LIMIT 1
       ) AS latest_pdf_path
       FROM campaign_creators cc
       LEFT JOIN invoices i ON i.campaign_id = cc.campaign_id AND i.creator_mobile = cc.mobile
       WHERE cc.campaign_id = ?
       GROUP BY cc.id
       ORDER BY cc.id DESC`,
      [campaign.id]
    );

    folders.push({
      id: campaign.id,
      campaignName: campaign.campaign_name,
      campaignCode: campaign.campaign_code,
      teamName: campaign.team_name,
      creatorCount: Number(campaign.creator_count || 0),
      invoiceCount: Number(campaign.invoice_count || 0),
      folderName: campaignFolderName(campaign),
      generatedPath: `/generated/campaigns/${campaignFolderName(campaign)}`,
      uploadPath: `/uploads/campaigns/${campaignFolderName(campaign)}`,
      creators
    });
  }

  return folders;
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
      return {
        description: selected === "Custom" ? custom : selected,
        quantity: Number(quantities[idx] || 0),
        amount: Number(amounts[idx] || 0)
      };
    })
    .filter((x) => x.description);
}

async function notifyInvoiceSubmission(invoiceId, campaignId, creatorName, campaignName, isRegenerated) {
  const action = isRegenerated ? "re-generated" : "submitted";
  await db.run(
    "INSERT INTO notifications (invoice_id, campaign_id, message) VALUES (?, ?, ?)",
    [invoiceId, campaignId, `${creatorName} from ${campaignName} has ${action} the invoice.`]
  );
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

  return rows.map((row) => {
    const normalized = Object.keys(row).reduce((acc, key) => {
      acc[normalizeHeader(key)] = row[key];
      return acc;
    }, {});

    return {
      creatorName: String(normalized.creatorname || normalized.creator || normalized.name || "").trim(),
      mobile: String(normalized.contactnumber || normalized.mobilenumber || normalized.mobile || normalized.contact || "").trim(),
      amount: Number(normalized.amount || 0)
    };
  });
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
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
app.use((req, _, next) => {
  if (!req.session.user) {
    const authUser = getAuthenticatedUser(req);
    if (authUser) {
      req.session.user = authUser;
    }
  }
  next();
});
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));
app.use("/generated", express.static(generatedDir));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.error = null;
  res.locals.success = null;
  res.locals.deliverableOptions = DELIVERABLE_OPTIONS;
  res.locals.today = todayForInvoice();
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
    `SELECT c.id, c.campaign_name, c.campaign_code, cc.amount AS creator_amount, cc.creator_name
     FROM campaigns c
     JOIN campaign_creators cc ON cc.campaign_id = c.id
     WHERE c.campaign_code = ? AND cc.mobile = ?`,
    [campaignCode.trim(), mobile.trim()]
  );

  if (!campaign) {
    return res.render("creator_form", {
      error: "Invalid campaign code or mobile number mapping.",
      success: null,
      form: req.body
    });
  }

  const existingInvoice = await db.get(
    `SELECT *
     FROM invoices
     WHERE campaign_id = ? AND creator_mobile = ?
     ORDER BY id DESC
     LIMIT 1`,
    [campaign.id, mobile.trim()]
  );
  const existingItems = existingInvoice
    ? await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [existingInvoice.id])
    : [];

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
      existingInvoice,
      existingItems
    }
  });
});

app.post("/creator/submit", upload.single("signatureFile"), async (req, res) => {
  try {
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
    const invoiceKind = String(invoiceType || "non_gst").toLowerCase() === "gst" ? "gst" : "non_gst";
    const invoiceDate = todayForInvoice();

    if (!campaignId || !campaignCode || !mobile || !fullName || !invoiceNo) {
      return res.render("creator_form", {
        error: "Please fill all required fields.",
        success: null,
        form: req.body
      });
    }

    if (invoiceType === "gst" && (!String(poNumber || "").trim() || !String(gstin || "").trim())) {
      return res.render("creator_form", {
        error: "PO Number and GSTIN are required for GST based invoices.",
        success: null,
        form: {
          validated: true,
          ...req.body
        }
      });
    }

    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
    if (!campaign) {
      return res.render("creator_form", {
        error: "Campaign not found.",
        success: null,
        form: req.body
      });
    }

    const mapping = await db.get(
      "SELECT id, creator_name, amount FROM campaign_creators WHERE campaign_id = ? AND mobile = ?",
      [campaignId, mobile.trim()]
    );
    if (!mapping) {
      return res.render("creator_form", {
        error: "Creator is not mapped to this campaign.",
        success: null,
        form: req.body
      });
    }

    const existingInvoice = existingInvoiceId
      ? await db.get("SELECT * FROM invoices WHERE id = ? AND campaign_id = ? AND creator_mobile = ?", [
          existingInvoiceId,
          campaignId,
          mobile.trim()
        ])
      : null;

    const items = itemsFromBody(req.body);

    if (!items.length) {
      return res.render("creator_form", {
        error: "At least one invoice row is required.",
        success: null,
        form: req.body
      });
    }

    const total = items.reduce((sum, row) => sum + row.amount, 0);
    if (Number(total.toFixed(2)) !== Number(Number(mapping.amount).toFixed(2))) {
      return res.render("creator_form", {
        error: "Total of rows must exactly match the predefined creator amount.",
        success: null,
        form: {
          validated: true,
          campaignId,
          campaignCode,
          mobile,
          campaignName: campaign.campaign_name,
          creatorName: mapping.creator_name,
          amount: mapping.amount,
          ...req.body
        }
      });
    }

    const taxableAmount = Number(total.toFixed(2));
    const taxes = gstBreakup(invoiceKind, gstin, taxableAmount);
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

    let signatureType = null;
    let signatureValue = null;
    if (req.file) {
      signatureType = "upload";
      signatureValue = moveUploadToCampaignFolder(req.file, campaign);
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
          mobile,
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
          fullName.trim(),
          address || "",
          pan || "",
          email || "",
          invoiceNo.trim(),
          invoiceDate,
          paymentMode || "",
          pocName || "",
          otherReferences || "",
          poNumber || "",
          gstin || "",
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
          ifscCode || "",
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
      const invoiceResult = await db.run(
        `INSERT INTO invoices (
          campaign_id, creator_mobile, creator_name, invoice_type, full_name, address, pan, email,
          invoice_no, invoice_date, payment_mode, poc_name, other_references,
          po_number, creator_gstin,
          taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate,
          cgst_amount, sgst_amount, igst_amount, gst_amount, final_amount,
          account_name, bank_name, account_no, ifsc_code, branch, upi_id,
          signature_type, signature_value, total_amount, locked_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          campaignId,
          mobile.trim(),
          mapping.creator_name,
          invoiceKind,
          fullName.trim(),
          address || "",
          pan || "",
          email || "",
          invoiceNo.trim(),
          invoiceDate,
          paymentMode || "",
          pocName || "",
          otherReferences || "",
          poNumber || "",
          gstin || "",
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
          ifscCode || "",
          branch || "",
          upiId || "",
          signatureType,
          signatureValue,
          savedTotalAmount,
          mapping.amount,
          "SUBMITTED"
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

    const pdfPath = await ensurePdfForInvoice(invoiceId);
    await notifyInvoiceSubmission(invoiceId, campaign.id, mapping.creator_name, campaign.campaign_name, isRegenerated);

    return res.render("creator_success", {
      invoice: {
        id: invoiceId,
        campaign_name: campaign.campaign_name,
        campaign_code: campaign.campaign_code,
        creator_name: mapping.creator_name,
        creator_mobile: mobile.trim(),
        invoice_no: invoiceNo.trim(),
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
      error: "Something went wrong while submitting invoice.",
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
  if (getAuthenticatedUser(req)) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin_login", { error: null });
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

  res.redirect("/admin/dashboard");
});

app.post("/admin/logout", requireAuth, (req, res) => {
  clearAuthCookie(res, req);
  req.session.destroy(() => res.redirect("/admin"));
});

app.use("/admin", requireAuth);

app.get("/admin/dashboard", async (req, res) => {
  const user = req.session.user;
  let invoices;
  let notifications = [];

  if (user.role === "TEAM") {
    invoices = await db.all(
      `SELECT i.*, c.campaign_name, c.campaign_code
       FROM invoices i
       JOIN campaigns c ON c.id = i.campaign_id
       WHERE c.team_name = ?
       ORDER BY i.id DESC`,
      [user.teamName]
    );
  } else {
    invoices = await db.all(
      `SELECT i.*, c.campaign_name, c.campaign_code
       FROM invoices i
       JOIN campaigns c ON c.id = i.campaign_id
       ORDER BY i.id DESC`
    );
  }

  if (user.role === "ACCOUNTS" || user.role === "SUPER_ADMIN") {
    notifications = await db.all(
      `SELECT n.*, c.campaign_name, i.creator_name
       FROM notifications n
       LEFT JOIN campaigns c ON c.id = n.campaign_id
       LEFT JOIN invoices i ON i.id = n.invoice_id
       WHERE n.is_read = 0
       ORDER BY n.id DESC
       LIMIT 10`
    );
  }

  res.render("dashboard", { invoices, notifications });
});

app.get("/admin/folders", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  const folders = await loadCampaignFolderCards();
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

app.get("/admin/campaigns", requireRole(["TEAM", "SUPER_ADMIN"]), async (req, res) => {
  const user = req.session.user;
  const search = (req.query.search || "").trim();
  const like = `%${search}%`;
  let campaigns;

  if (user.role === "TEAM") {
    if (search) {
      campaigns = await db.all(
        `SELECT c.*, COUNT(cc.id) AS creator_count
         FROM campaigns c
         LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
         WHERE c.team_name = ? AND (c.campaign_name LIKE ? OR c.campaign_code LIKE ?)
         GROUP BY c.id
         ORDER BY c.id DESC`,
        [user.teamName, like, like]
      );
    } else {
      campaigns = await db.all(
        `SELECT c.*, COUNT(cc.id) AS creator_count
         FROM campaigns c
         LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
         WHERE c.team_name = ?
         GROUP BY c.id
         ORDER BY c.id DESC`,
        [user.teamName]
      );
    }
  } else {
    if (search) {
      campaigns = await db.all(
        `SELECT c.*, COUNT(cc.id) AS creator_count
         FROM campaigns c
         LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
         WHERE c.campaign_name LIKE ? OR c.campaign_code LIKE ? OR c.team_name LIKE ?
         GROUP BY c.id
         ORDER BY c.id DESC`,
        [like, like, like]
      );
    } else {
      campaigns = await db.all(
        `SELECT c.*, COUNT(cc.id) AS creator_count
         FROM campaigns c
         LEFT JOIN campaign_creators cc ON cc.campaign_id = c.id
         GROUP BY c.id
         ORDER BY c.id DESC`
      );
    }
  }

  const campaignCards = [];
  for (const campaign of campaigns) {
    const creators = await db.all(
      `SELECT cc.id, cc.creator_name, cc.mobile, cc.amount, COUNT(i.id) AS invoice_count
       FROM campaign_creators cc
       LEFT JOIN invoices i ON i.campaign_id = cc.campaign_id AND i.creator_mobile = cc.mobile
       WHERE cc.campaign_id = ?
       GROUP BY cc.id
       ORDER BY cc.id DESC`,
      [campaign.id]
    );

    campaignCards.push({
      ...campaign,
      creators
    });
  }

  res.render("campaigns", { campaigns: campaignCards, error: null, success: null, search });
});

app.post("/admin/campaigns", requireRole(["TEAM", "SUPER_ADMIN"]), async (req, res) => {
  try {
    const user = req.session.user;
    const { campaignName, campaignCode, teamName } = req.body;
    const campaigns = await db.all("SELECT * FROM campaigns ORDER BY id DESC");

    if (!campaignName || !campaignCode) {
      return res.render("campaigns", {
        campaigns,
        error: "Campaign Name and Code are required.",
        success: null,
        search: ""
      });
    }

    const existing = await db.get("SELECT id FROM campaigns WHERE campaign_code = ?", [campaignCode.trim()]);
    if (existing) {
      return res.render("campaigns", {
        campaigns,
        error: "Campaign Code already exists. Use a different code.",
        success: null,
        search: ""
      });
    }

    const appliedTeam = user.role === "TEAM" ? user.teamName : teamName;

    const result = await db.run(
      "INSERT INTO campaigns (campaign_name, campaign_code, amount, team_name, created_by) VALUES (?, ?, ?, ?, ?)",
      [campaignName.trim(), campaignCode.trim(), 0, appliedTeam || "DEFAULT", user.id]
    );
    ensureCampaignFolders({ id: result.lastID, campaign_name: campaignName.trim() });

    res.redirect("/admin/campaigns");
  } catch (error) {
    const campaigns = await db.all("SELECT * FROM campaigns ORDER BY id DESC");
    return res.render("campaigns", {
      campaigns,
      error: error.code === "SQLITE_CONSTRAINT" ? "Campaign Code already exists. Use a different code." : "Unable to create campaign.",
      success: null,
      search: ""
    });
  }
});

app.get("/admin/campaigns/:id/creators", requireRole(["TEAM", "SUPER_ADMIN"]), async (req, res) => {
  const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [req.params.id]);
  if (!campaign) {
    return res.redirect("/admin/campaigns");
  }

  const creators = await db.all("SELECT * FROM campaign_creators WHERE campaign_id = ? ORDER BY id DESC", [campaign.id]);
  res.render("campaign_creators", { campaign, creators, error: null, success: null });
});

app.post("/admin/campaigns/:id/creators", requireRole(["TEAM", "SUPER_ADMIN"]), async (req, res) => {
  const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [req.params.id]);
  if (!campaign) {
    return res.redirect("/admin/campaigns");
  }

  const { creatorName, mobile, amount } = req.body;
  if (!creatorName || !mobile || !amount) {
    const creators = await db.all("SELECT * FROM campaign_creators WHERE campaign_id = ? ORDER BY id DESC", [campaign.id]);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: "Creator name, mobile, and predefined amount are required.",
      success: null
    });
  }

  await db.run(
    "INSERT INTO campaign_creators (campaign_id, creator_name, mobile, amount) VALUES (?, ?, ?, ?)",
    [campaign.id, creatorName.trim(), mobile.trim(), Number(amount)]
  );

  res.redirect(`/admin/campaigns/${campaign.id}/creators`);
});

app.post("/admin/campaigns/:id/creators/bulk", requireRole(["TEAM", "SUPER_ADMIN"]), upload.single("creatorFile"), async (req, res) => {
  const campaign = await db.get("SELECT * FROM campaigns WHERE id = ?", [req.params.id]);
  if (!campaign) {
    return res.redirect("/admin/campaigns");
  }

  if (!req.file) {
    const creators = await db.all("SELECT * FROM campaign_creators WHERE campaign_id = ? ORDER BY id DESC", [campaign.id]);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: "Please upload a CSV or Excel file.",
      success: null
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
        "SELECT id FROM campaign_creators WHERE campaign_id = ? AND mobile = ?",
        [campaign.id, row.mobile]
      );

      if (existing) {
        await db.run(
          "UPDATE campaign_creators SET creator_name = ?, amount = ? WHERE id = ?",
          [row.creatorName, Number(row.amount), existing.id]
        );
        inserted.push({ ...row, updated: true });
      } else {
        await db.run(
          "INSERT INTO campaign_creators (campaign_id, creator_name, mobile, amount) VALUES (?, ?, ?, ?)",
          [campaign.id, row.creatorName, row.mobile, Number(row.amount)]
        );
        inserted.push(row);
      }
    }

    const creators = await db.all("SELECT * FROM campaign_creators WHERE campaign_id = ? ORDER BY id DESC", [campaign.id]);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: null,
      success: `Bulk upload complete. Added/updated ${inserted.length} creators${skipped.length ? `, skipped ${skipped.length} invalid rows` : ""}.`
    });
  } catch (error) {
    const creators = await db.all("SELECT * FROM campaign_creators WHERE campaign_id = ? ORDER BY id DESC", [campaign.id]);
    return res.render("campaign_creators", {
      campaign,
      creators,
      error: `Bulk upload failed: ${error.message}`,
      success: null
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

app.get("/admin/invoices/:id", async (req, res) => {
  const invoice = await db.get(
    `SELECT i.*, c.campaign_name, c.campaign_code
     FROM invoices i
     JOIN campaigns c ON c.id = i.campaign_id
     WHERE i.id = ?`,
    [req.params.id]
  );

  if (!invoice) {
    return res.redirect("/admin/dashboard");
  }

  const items = await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [invoice.id]);
  res.render("invoice_view", { invoice, items, error: null });
});

app.post("/admin/invoices/:id/status", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  const { action } = req.body;
  const invoice = await db.get("SELECT * FROM invoices WHERE id = ?", [req.params.id]);
  if (!invoice) {
    return res.redirect("/admin/dashboard");
  }

  const nextStatus = action === "accept" ? "ACCEPTED" : "REJECTED";
  await db.run("UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nextStatus, invoice.id]);
  res.redirect(`/admin/invoices/${invoice.id}`);
});

app.get("/admin/invoices/:id/edit", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  return res.redirect(`/admin/invoices/${req.params.id}`);
});

app.post("/admin/invoices/:id/edit", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  return res.redirect(`/admin/invoices/${req.params.id}`);
});

app.get("/admin/users", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const users = await db.all("SELECT id, username, role, team_name, created_at FROM users ORDER BY id DESC");
  res.render("users", { users, error: null });
});

app.post("/admin/users", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const { username, password, role, teamName } = req.body;
  if (!username || !password || !role) {
    const users = await db.all("SELECT id, username, role, team_name, created_at FROM users ORDER BY id DESC");
    return res.render("users", { users, error: "Username, password and role are required." });
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

app.post("/admin/users/:id/reset", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.redirect("/admin/users");
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
  res.redirect("/admin/users");
});

app.post("/admin/users/:id/delete", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  await db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
  res.redirect("/admin/users");
});

app.use((req, res, next) => {
  if (isAdminArea(req.path)) {
    return res.redirect("/admin");
  }
  next();
});

async function startServer(port) {
  try {
    const server = app.listen(port, () => {
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
  dbReady.then(() => startServer(START_PORT));
}

module.exports = app;
