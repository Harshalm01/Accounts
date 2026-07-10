const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("./db");
const { requireAuth, requireRole, isAdminArea } = require("./middleware/auth");
const { ensurePdfForInvoice } = require("./services/pdf");

const app = express();
const START_PORT = Number(process.env.PORT || 3000);
const runtimeDir = process.env.VERCEL ? "/tmp" : __dirname;

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

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(
  session({
    secret: "replace-this-in-production",
    resave: false,
    saveUninitialized: false
  })
);
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));
app.use("/generated", express.static(generatedDir));

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

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.error = null;
  res.locals.success = null;
  next();
});

app.get("/", async (req, res) => {
  res.render("creator_form", { error: null, success: null, form: {} });
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

  res.render("creator_form", {
    error: null,
    success: null,
    form: {
      ...req.body,
      validated: true,
      campaignId: campaign.id,
      campaignName: campaign.campaign_name,
      amount: campaign.creator_amount,
      creatorName: campaign.creator_name
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
      invoiceDate,
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
      itemDescriptions,
      itemQuantities,
      itemAmounts
    } = req.body;
    const invoiceKind = String(invoiceType || "non_gst").toLowerCase() === "gst" ? "gst" : "non_gst";

    if (!campaignId || !campaignCode || !mobile || !fullName || !invoiceNo || !invoiceDate) {
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

    const descriptions = Array.isArray(itemDescriptions) ? itemDescriptions : [itemDescriptions];
    const quantities = Array.isArray(itemQuantities) ? itemQuantities : [itemQuantities];
    const amounts = Array.isArray(itemAmounts) ? itemAmounts : [itemAmounts];

    const items = descriptions
      .map((desc, idx) => ({
        description: (desc || "").trim(),
        quantity: Number(quantities[idx] || 0),
        amount: Number(amounts[idx] || 0)
      }))
      .filter((x) => x.description);

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
    const gstRate = invoiceKind === "gst" ? 18 : 0;
    const cgstRate = invoiceKind === "gst" ? 9 : 0;
    const sgstRate = invoiceKind === "gst" ? 9 : 0;
    const cgstAmount = Number((taxableAmount * (cgstRate / 100)).toFixed(2));
    const sgstAmount = Number((taxableAmount * (sgstRate / 100)).toFixed(2));
    const gstAmount = Number((cgstAmount + sgstAmount).toFixed(2));
    const finalAmount = Number((taxableAmount + gstAmount).toFixed(2));
    const savedTotalAmount = invoiceKind === "gst" ? finalAmount : taxableAmount;

    let signatureType = null;
    let signatureValue = null;
    if (signatureDraw && signatureDraw.startsWith("data:image")) {
      signatureType = "draw";
      signatureValue = signatureDraw;
    } else if (req.file) {
      signatureType = "upload";
      signatureValue = `/uploads/${req.file.filename}`;
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

    const invoiceResult = await db.run(
      `INSERT INTO invoices (
        campaign_id, creator_mobile, creator_name, invoice_type, full_name, address, pan, email,
        invoice_no, invoice_date, payment_mode, poc_name, other_references,
        po_number, creator_gstin,
        taxable_amount, gst_rate, cgst_rate, sgst_rate, cgst_amount, sgst_amount, gst_amount, final_amount,
        account_name, bank_name, account_no, ifsc_code, branch, upi_id,
        signature_type, signature_value, total_amount, locked_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        cgstAmount,
        sgstAmount,
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

    for (const row of items) {
      await db.run(
        "INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)",
        [invoiceResult.lastID, row.description, row.quantity, invoiceKind === "gst" ? 18 : 0, row.amount]
      );
    }

    await ensurePdfForInvoice(invoiceResult.lastID);

    res.render("creator_form", {
      error: null,
      success: "Invoice submitted successfully.",
      form: {}
    });
  } catch (error) {
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

app.get("/admin", (req, res) => {
  if (req.session.user) {
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

  res.redirect("/admin/dashboard");
});

app.post("/admin/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect("/admin"));
});

app.use("/admin", requireAuth);

app.get("/admin/dashboard", async (req, res) => {
  const user = req.session.user;
  let invoices;

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

  res.render("dashboard", { invoices });
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

  res.render("campaigns", { campaigns, error: null, success: null, search });
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
        success: null
      });
    }

    const existing = await db.get("SELECT id FROM campaigns WHERE campaign_code = ?", [campaignCode.trim()]);
    if (existing) {
      return res.render("campaigns", {
        campaigns,
        error: "Campaign Code already exists. Use a different code.",
        success: null
      });
    }

    const appliedTeam = user.role === "TEAM" ? user.teamName : teamName;

    await db.run(
      "INSERT INTO campaigns (campaign_name, campaign_code, amount, team_name, created_by) VALUES (?, ?, ?, ?, ?)",
      [campaignName.trim(), campaignCode.trim(), 0, appliedTeam || "DEFAULT", user.id]
    );

    res.redirect("/admin/campaigns");
  } catch (error) {
    const campaigns = await db.all("SELECT * FROM campaigns ORDER BY id DESC");
    return res.render("campaigns", {
      campaigns,
      error: error.code === "SQLITE_CONSTRAINT" ? "Campaign Code already exists. Use a different code." : "Unable to create campaign.",
      success: null
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
  res.render("invoice_edit", { invoice, items, error: null });
});

app.post("/admin/invoices/:id/edit", requireRole(["ACCOUNTS", "SUPER_ADMIN"]), async (req, res) => {
  const invoice = await db.get(
    `SELECT i.*
     FROM invoices i
     WHERE i.id = ?`,
    [req.params.id]
  );

  if (!invoice) {
    return res.redirect("/admin/dashboard");
  }

  const {
    fullName,
    address,
    pan,
    email,
    invoiceNo,
    invoiceDate,
    paymentMode,
    pocName,
    otherReferences,
    accountName,
    bankName,
    accountNo,
    ifscCode,
    branch,
    upiId,
    itemDescriptions,
    itemQuantities,
    itemAmounts
  } = req.body;
  const isGstInvoice = String(invoice.invoice_type || "non_gst") === "gst";

  const descriptions = Array.isArray(itemDescriptions) ? itemDescriptions : [itemDescriptions];
  const quantities = Array.isArray(itemQuantities) ? itemQuantities : [itemQuantities];
  const amounts = Array.isArray(itemAmounts) ? itemAmounts : [itemAmounts];
  const items = descriptions
    .map((desc, idx) => ({
      description: (desc || "").trim(),
      quantity: Number(quantities[idx] || 0),
      amount: Number(amounts[idx] || 0)
    }))
    .filter((x) => x.description);

  const taxableAmount = Number(items.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
  if (Number(taxableAmount.toFixed(2)) !== Number(Number(invoice.locked_amount).toFixed(2))) {
    const existingItems = await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [invoice.id]);
    return res.render("invoice_edit", {
      invoice,
      items: existingItems,
        error: "Edited total must exactly match predefined creator amount."
    });
  }

  const gstRate = isGstInvoice ? 18 : 0;
  const cgstRate = isGstInvoice ? 9 : 0;
  const sgstRate = isGstInvoice ? 9 : 0;
  const cgstAmount = Number((taxableAmount * (cgstRate / 100)).toFixed(2));
  const sgstAmount = Number((taxableAmount * (sgstRate / 100)).toFixed(2));
  const gstAmount = Number((cgstAmount + sgstAmount).toFixed(2));
  const finalAmount = Number((taxableAmount + gstAmount).toFixed(2));

  await db.run(
    `UPDATE invoices SET
      full_name = ?, address = ?, pan = ?, email = ?, invoice_no = ?, invoice_date = ?,
      payment_mode = ?, poc_name = ?, other_references = ?,
      account_name = ?, bank_name = ?, account_no = ?, ifsc_code = ?, branch = ?, upi_id = ?,
      taxable_amount = ?, gst_rate = ?, cgst_rate = ?, sgst_rate = ?, cgst_amount = ?, sgst_amount = ?, gst_amount = ?, final_amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      fullName || "",
      address || "",
      pan || "",
      email || "",
      invoiceNo || "",
      invoiceDate || "",
      paymentMode || "",
      pocName || "",
      otherReferences || "",
      accountName || "",
      bankName || "",
      accountNo || "",
      ifscCode || "",
      branch || "",
      upiId || "",
      taxableAmount,
      gstRate,
      cgstRate,
      sgstRate,
      cgstAmount,
      sgstAmount,
      gstAmount,
      finalAmount,
      finalAmount,
      invoice.id
    ]
  );

  await db.run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoice.id]);
  for (const row of items) {
    await db.run(
      "INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)",
      [invoice.id, row.description, row.quantity, isGstInvoice ? 18 : 0, row.amount]
    );
  }

  await ensurePdfForInvoice(invoice.id);
  res.redirect(`/admin/invoices/${invoice.id}`);
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
