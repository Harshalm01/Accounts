const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const db = require("../db");

const generatedDir = path.join(__dirname, "..", "generated");
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

const COMPANY = {
  name: "3Folks Media",
  addressLines: [
    "1801, 18th Floor, C Wing, Lotus Corporate Park, Off. Western Express Highway,",
    "Goregaon East, Mumbai- 400063."
  ],
  pan: "AACFZ6393B",
  gstin: "27AACFZ6393B1ZZ",
  state: "Maharashtra",
  stateCode: "27"
};

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
  const isGstInvoice = String(invoice.invoice_type || "non_gst") === "gst";
  const taxableAmount = Number(invoice.taxable_amount ?? invoice.locked_amount ?? invoice.total_amount ?? 0);
  const cgstRate = Number(invoice.cgst_rate ?? (isGstInvoice ? 9 : 0));
  const sgstRate = Number(invoice.sgst_rate ?? (isGstInvoice ? 9 : 0));
  const gstRate = Number(invoice.gst_rate ?? (isGstInvoice ? 18 : 0));
  const cgstAmount = Number(invoice.cgst_amount ?? (taxableAmount * (cgstRate / 100)).toFixed(2));
  const sgstAmount = Number(invoice.sgst_amount ?? (taxableAmount * (sgstRate / 100)).toFixed(2));
  const gstAmount = Number(invoice.gst_amount ?? (cgstAmount + sgstAmount).toFixed(2));
  const finalAmount = Number(invoice.final_amount ?? (isGstInvoice ? (taxableAmount + gstAmount) : invoice.total_amount ?? taxableAmount));

  function calcGstRow(baseAmount) {
    const base = Number(baseAmount || 0);
    const rowCgst = Number((base * 0.09).toFixed(2));
    const rowSgst = Number((base * 0.09).toFixed(2));
    const rowFinal = Number((base + rowCgst + rowSgst).toFixed(2));
    return { base, rowCgst, rowSgst, rowFinal };
  }

  const doc = new PDFDocument({ margin: 32, size: "A4" });
  const stream = fs.createWriteStream(abs);
  doc.pipe(stream);

  doc.fontSize(16).text(isGstInvoice ? "TAX INVOICE" : "BILL OF SUPPLY", { align: "center" });
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
  if (isGstInvoice) {
    doc.text(`PO Number: ${invoice.po_number || ""}`);
    doc.text(`Creator GSTIN: ${invoice.creator_gstin || ""}`);
  }
  doc.text(`POC Name: ${invoice.poc_name || ""}`);
  doc.text(`Other References: ${invoice.other_references || ""}`);
  doc.moveDown(0.8);

  doc.fontSize(10).text("To,");
  doc.text(COMPANY.name);
  COMPANY.addressLines.forEach((line) => doc.text(line));
  doc.text(`PAN: ${COMPANY.pan}`);
  doc.text(`GSTIN: ${COMPANY.gstin}`);
  doc.text(`State Name: ${COMPANY.state}, Code : ${COMPANY.stateCode}`);
  doc.moveDown(1);

  doc.fontSize(9);
  const tableTop = doc.y;
  const col = isGstInvoice
    ? {
        sl: 32,
        desc: 62,
        qty: 235,
        rate: 285,
        cgst: 340,
        sgst: 405,
        amount: 485
      }
    : {
        sl: 32,
        desc: 62,
        qty: 360,
        rate: 420,
        amount: 485
      };

  doc.text("Sl No.", col.sl, tableTop);
  doc.text("Description of Goods", col.desc, tableTop);
  doc.text("Quantity", col.qty, tableTop);
  doc.text("Rate", col.rate, tableTop);
  if (isGstInvoice) {
    doc.text("CGST", col.cgst, tableTop);
    doc.text("SGST", col.sgst, tableTop);
  }
  doc.text("Amount", col.amount, tableTop);

  let y = tableTop + 18;
  items.forEach((it, idx) => {
    const rowTax = isGstInvoice ? calcGstRow(it.amount) : null;
    doc.text(String(idx + 1), col.sl, y);
    doc.text(it.description || "", col.desc, y, { width: isGstInvoice ? 160 : 250 });
    doc.text(String(it.quantity || 0), col.qty, y);
    doc.text(isGstInvoice ? "18%" : Number(it.rate || 0).toFixed(2), col.rate, y);
    if (isGstInvoice) {
      doc.text(`Rs ${rowTax.rowCgst.toFixed(2)}`, col.cgst, y);
      doc.text(`Rs ${rowTax.rowSgst.toFixed(2)}`, col.sgst, y);
      doc.text(`Rs ${rowTax.rowFinal.toFixed(2)}`, col.amount, y);
    } else {
      doc.text(Number(it.amount || 0).toFixed(2), col.amount, y);
    }
    y += 42;
  });

  doc.moveTo(32, y).lineTo(560, y).stroke();
  y += 8;
  doc.fontSize(10);
  if (isGstInvoice) {
    doc.text("Taxable Amount", 395, y);
    doc.text(`Rs ${taxableAmount.toFixed(2)}`, 470, y);
    y += 16;
    doc.text(`CGST @ ${cgstRate.toFixed(0)}%`, 395, y);
    doc.text(`Rs ${cgstAmount.toFixed(2)}`, 470, y);
    y += 16;
    doc.text(`SGST @ ${sgstRate.toFixed(0)}%`, 395, y);
    doc.text(`Rs ${sgstAmount.toFixed(2)}`, 470, y);
    y += 16;
    doc.text(`GST @ ${gstRate.toFixed(0)}%`, 395, y);
    doc.text(`Rs ${gstAmount.toFixed(2)}`, 470, y);
    y += 16;
    doc.text("Grand Total", 395, y);
    doc.text(`Rs ${finalAmount.toFixed(2)}`, 470, y);
    y += 24;
  } else {
    doc.text("Total", 420, y);
    doc.text(`Rs ${Number(invoice.total_amount || 0).toFixed(2)}`, 470, y);
    y += 20;
  }

  doc.text("Amount Chargeable (in words)", 32, y);
  doc.text(`INR ${numberToWords(isGstInvoice ? finalAmount : invoice.total_amount)} Only`, 32, y + 14);
  y += 40;

  if (isGstInvoice) {
    doc.text(`Invoice Type: GST Based`, 32, y);
    y += 18;
  }

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