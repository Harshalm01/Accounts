const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const db = require("../db");

const generatedDir = path.join(__dirname, "..", "generated");
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

function numberToWords(amount) {
  const num = Math.round(Number(amount));
  if (!Number.isFinite(num)) return "";
  if (num === 0) return "Zero";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function belowThousand(n) {
    let out = "";
    if (n >= 100) {
      out += `${ones[Math.floor(n / 100)]} Hundred `;
      n %= 100;
    }
    if (n >= 20) {
      out += `${tens[Math.floor(n / 10)]} `;
      n %= 10;
    } else if (n >= 10) {
      out += `${teens[n - 10]} `;
      n = 0;
    }
    if (n > 0) out += `${ones[n]} `;
    return out.trim();
  }

  let n = num;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const rest = n;

  const parts = [];
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));

  return parts.join(" ").trim();
}

function drawSignature(doc, invoice, x, y, w, h) {
  if (invoice.signature_type === "upload" && invoice.signature_value) {
    const p = path.join(__dirname, "..", invoice.signature_value.replace(/^\//, ""));
    if (fs.existsSync(p)) {
      doc.image(p, x, y, { fit: [w, h] });
      return;
    }
  }

  if (invoice.signature_type === "draw" && invoice.signature_value && invoice.signature_value.startsWith("data:image")) {
    const base64 = invoice.signature_value.split(",")[1];
    const buf = Buffer.from(base64, "base64");
    doc.image(buf, x, y, { fit: [w, h] });
  }
}

async function ensurePdfForInvoice(invoiceId) {
  const invoice = await db.get(
    `SELECT i.*, c.campaign_name, c.campaign_code
     FROM invoices i
     JOIN campaigns c ON c.id = i.campaign_id
     WHERE i.id = ?`,
    [invoiceId]
  );
  if (!invoice) return null;

  const items = await db.all("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC", [invoiceId]);

  const fileName = `invoice-${invoice.id}.pdf`;
  const abs = path.join(generatedDir, fileName);
  const rel = `/generated/${fileName}`;

  const doc = new PDFDocument({ margin: 32, size: "A4" });
  const stream = fs.createWriteStream(abs);
  doc.pipe(stream);

  doc.fontSize(16).text("BILL OF SUPPLY", { align: "center" });
  doc.moveDown(0.8);

  doc.fontSize(10).text("Bill from,");
  doc.text(`Full Name: ${invoice.full_name || ""}`);
  doc.text(`Address: ${invoice.address || ""}`);
  doc.text(`PAN/IT No: ${invoice.pan || ""}`);
  doc.text(`Email: ${invoice.email || ""}`);
  doc.moveDown(0.4);
  doc.text(`Invoice No: ${invoice.invoice_no || ""}`);
  doc.text(`Dated: ${invoice.invoice_date || ""}`);
  doc.text(`Mode/Terms of Payment: ${invoice.payment_mode || ""}`);
  doc.text(`POC Name: ${invoice.poc_name || ""}`);
  doc.text(`Other References: ${invoice.other_references || ""}`);
  doc.moveDown(0.8);

  doc.fontSize(10).text("To,");
  doc.text("3Folks Media");
  doc.text("1801, 18th Floor, C Wing, Lotus Corporate Park, Off. Western Express Highway,");
  doc.text("Goregaon East, Mumbai- 400063.");
  doc.text("PAN: AACFZ6393B");
  doc.text("State Name: Maharashtra, Code : 27");
  doc.moveDown(1);

  doc.fontSize(9);
  const tableTop = doc.y;
  const col = {
    sl: 32,
    desc: 62,
    qty: 360,
    amount: 470
  };

  doc.text("Sl No.", col.sl, tableTop);
  doc.text("Description of Goods", col.desc, tableTop);
  doc.text("Quantity", col.qty, tableTop);
  doc.text("Amount", col.amount, tableTop);

  let y = tableTop + 18;
  items.forEach((it, idx) => {
    doc.text(String(idx + 1), col.sl, y);
    doc.text(it.description || "", col.desc, y, { width: 250 });
    doc.text(String(it.quantity || 0), col.qty, y);
    doc.text(Number(it.amount || 0).toFixed(2), col.amount, y);
    y += 42;
  });

  doc.moveTo(32, y).lineTo(560, y).stroke();
  y += 8;
  doc.fontSize(10).text("Total", 420, y);
  doc.text(`Rs ${Number(invoice.total_amount || 0).toFixed(2)}`, 470, y);
  y += 20;

  doc.text("Amount Chargeable (in words)", 32, y);
  doc.text(`INR ${numberToWords(invoice.total_amount)} Only`, 32, y + 14);
  y += 40;

  doc.text(`Campaign Name: ${invoice.campaign_name}`, 32, y);
  doc.text(`Campaign Code: ${invoice.campaign_code}`, 32, y + 14);
  y += 36;

  doc.text(`Account Name: ${invoice.account_name || ""}`, 32, y);
  doc.text(`Bank Name: ${invoice.bank_name || ""}`, 32, y + 14);
  doc.text(`Account No: ${invoice.account_no || ""}`, 32, y + 28);
  doc.text(`IFSC Code: ${invoice.ifsc_code || ""}`, 32, y + 42);
  doc.text(`Branch: ${invoice.branch || ""}`, 32, y + 56);
  doc.text(`UPI ID: ${invoice.upi_id || ""}`, 32, y + 70);

  doc.text("Authorised Signatory", 420, y + 70);
  drawSignature(doc, invoice, 400, y + 10, 140, 50);

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  await db.run("UPDATE invoices SET pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [rel, invoiceId]);
  return rel;
}

module.exports = {
  ensurePdfForInvoice
};