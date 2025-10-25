/**
 * server.js
 *
 * Full backend for ChatSender admin + store.
 * - Save as server.js (CommonJS)
 * - Run: npm install express multer dotenv node-fetch nodemailer
 * - Then: node server.js
 *
 * Uses .env variables exactly as you provided.
 */

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- ENV (keep exactly what you provided) ----------
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EAAbnZCZA0lZBioBPZC1Bl4LKGbmeamRE9s5NZC9BUzxfX1f4agMEZBIYvMX04Wv8C5K0ZBvkg78azsQInnIZAWAFq7SQzfSgtRIBheqXobkC73i3aYWfQH6z70Mq8uhoBjOvlzgdj1dYJf0nvqatB1UNcO8zQmNxhDor0Ptlp153BSiiZBc4j4ZBJCpbPYddnuEdT1PZBpHFDgZD";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "768962646310363";
const ADMIN_PHONE = process.env.ADMIN_PHONE || "+233593231752";
const ADMIN_NAME = process.env.ADMIN_NAME || "FATI IBRAHIM";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8003409315:AAEVIPsOYnF8mBaT8l-kmzWucHUTu9Yo8AY";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8085649636";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = process.env.SMTP_PORT || "465";
const SMTP_USER = process.env.SMTP_USER || "johnofosu20@gmail.com";
const SMTP_PASS = process.env.SMTP_PASS || "xerl ulwp moat hnrp";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "johnofosu20@gmail.com";
const WHATSAPP_GROUP_IDS = (process.env.WHATSAPP_GROUP_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);
const AUTO_MESSAGES = (process.env.AUTO_MESSAGES || "false").toLowerCase() === "true";
// You can set WEBHOOK_VERIFY_TOKEN in .env if you want webhook verification
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "PAST_IT_HERE";

// ---------- data paths ----------
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const BUYERS_FILE = path.join(DATA_DIR, "buyers.json");
const CLICKS_FILE = path.join(DATA_DIR, "clicks.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const SUBS_FILE = path.join(DATA_DIR, "subscribers.json");
const ROTATION_FILE = path.join(DATA_DIR, "rotation.json");

function ensureJSON(filePath, initial = []) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
}
ensureJSON(PRODUCTS_FILE, []);
ensureJSON(BUYERS_FILE, []);
ensureJSON(CLICKS_FILE, []);
ensureJSON(MESSAGES_FILE, []);
ensureJSON(SUBS_FILE, []);
ensureJSON(ROTATION_FILE, { index: -1 });

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (e) { console.error("readJSON error", filePath, e); return []; }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ---------- storage for uploads ----------
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// multer storage (keep original extension)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "-" + crypto.randomBytes(4).toString("hex") + ext;
    cb(null, name);
  }
});
const upload = multer({ storage });

// ---------- email transporter (optional) ----------
let mailer = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_PORT) {
  try {
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    console.log("✅ Mailer configured");
  } catch (e) {
    console.warn("Mailer setup failed", e.message);
  }
} else {
  console.log("⚠️ Mailer not configured (SMTP_* missing)");
}

// ---------- helpers ----------
function nowISO() { return new Date().toISOString(); }
function genId() { return Date.now().toString() + crypto.randomBytes(3).toString("hex"); }
function genMask() { return crypto.randomBytes(4).toString("hex"); }
function cleanPhone(n) { return ("" + n).replace(/\D/g, ""); }

// send WhatsApp text (uses WhatsApp Cloud API)
async function sendWhatsAppText(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) throw new Error("WhatsApp credentials missing");
  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone(to),
    type: "text",
    text: { body: text }
  };
  const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  // log message entry (basic)
  const messages = readJSON(MESSAGES_FILE);
  messages.unshift({ id: data?.messages?.[0]?.id || `out_${Date.now()}`, to: cleanPhone(to), text, raw: data, createdAt: nowISO() });
  writeJSON(MESSAGES_FILE, messages);
  return data;
}

// best-effort: ask Graph API contacts endpoint for display name
async function fetchWhatsAppDisplayName(phone) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return null;
  try {
    const body = { blocking: "wait", contacts: [cleanPhone(phone)] };
    const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    // path: data.contacts[0].profile.name
    if (data && data.contacts && data.contacts[0] && data.contacts[0].profile && data.contacts[0].profile.name) {
      return data.contacts[0].profile.name;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// send Telegram (optional)
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" })
    });
  } catch (e) { console.warn("telegram send fail", e.message); }
}

// send email (optional)
async function sendEmail(to, subject, html) {
  if (!mailer) return;
  try {
    await mailer.sendMail({ from: `"${ADMIN_NAME}" <${SMTP_USER}>`, to, subject, html });
  } catch (e) { console.warn("sendEmail failed", e.message); }
}

// ---------- static assets ----------
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public"))); // serves admin.html, stores.html, menu.html etc.

// ---------------- API Endpoints ----------------

// GET products
app.get("/api/products", (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  res.json(products);
});

/**
 * Upload product (image + fields)
 * expects FormData with:
 * - password
 * - name (or 'name' field)
 * - desc
 * - price
 * - category
 * - website (alternatePayment)
 * - paymentLink (onlinePayment)
 * - image (file)
 */
app.post("/api/upload-product", upload.single("image"), (req, res) => {
  try {
    const fields = req.body || {};
    const password = fields.password || fields.pass || fields.adminPass;
    if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

    const name = fields.name || fields.productName || fields.title || "";
    const desc = fields.desc || fields.productDesc || fields.description || "";
    const price = fields.price || fields.productPrice || fields.productPriceUSD || "0";
    const category = fields.category || fields.productCategory || "Other";
    const alternatePayment = fields.website || fields.alternatePayment || fields.productWebsite || "";
    const onlinePayment = fields.paymentLink || fields.onlinePayment || fields.productPayment || "";

    const img = req.file;
    let imageUrl = "";
    if (img) imageUrl = `/uploads/${img.filename}`;

    const products = readJSON(PRODUCTS_FILE);
    const id = genId();
    const masked = `/p/${genMask()}`;

    const product = {
      id,
      name,
      desc,
      price: String(price),
      category,
      image: imageUrl,
      alternatePayment,
      onlinePayment,
      maskedLink: masked,
      clicks: 0,
      sold: false,
      createdAt: nowISO()
    };

    products.unshift(product);
    writeJSON(PRODUCTS_FILE, products);

    // return masked link and product
    res.json({ success: true, product, maskedLink: masked });
  } catch (err) {
    console.error("upload-product error", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Masked product link - logs and redirects to store view (so store opens inline, payment hidden)
app.get("/p/:code", (req, res) => {
  try {
    const code = req.params.code;
    const products = readJSON(PRODUCTS_FILE);
    const product = products.find(p => p.maskedLink === `/p/${code}`);
    if (!product) return res.status(404).send("Product not found");

    // log click
    const clicks = readJSON(CLICKS_FILE);
    const entry = {
      id: genId(),
      productId: product.id,
      time: nowISO(),
      ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.ip,
      ua: req.get("User-Agent") || "",
      referrer: req.get("Referer") || ""
    };
    clicks.unshift(entry);
    writeJSON(CLICKS_FILE, clicks);

    // increment clicks
    product.clicks = (product.clicks || 0) + 1;
    writeJSON(PRODUCTS_FILE, products);

    // redirect to store page with view param (store will open inline modal)
    res.redirect(`/stores.html?view=${product.id}`);
  } catch (e) {
    console.error(e);
    res.redirect("/stores.html");
  }
});

// mark sold
app.post("/api/mark-sold", (req, res) => {
  const { id, password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  const products = readJSON(PRODUCTS_FILE);
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  products[idx].sold = true;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, product: products[idx] });
});

// delete product
app.delete("/api/delete-product/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  let products = readJSON(PRODUCTS_FILE);
  const id = req.params.id;
  const prod = products.find(p => p.id === id);
  products = products.filter(p => p.id !== id);
  writeJSON(PRODUCTS_FILE, products);
  // delete image file if exists
  try {
    if (prod && prod.image) {
      const f = path.join(__dirname, prod.image);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  } catch (e) { console.warn("delete image failed", e.message); }
  res.json({ success: true });
});

// get buyers (admin)
app.get("/api/get-buyers", (req, res) => {
  const pass = req.query.password;
  if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  const buyers = readJSON(BUYERS_FILE);
  res.json({ success: true, buyers });
});

// save buyer (from store)
app.post("/api/save-buyer", async (req, res) => {
  try {
    const { name, phone, email, address, productId, price, paymentLink } = req.body;
    if (!name || !phone || !productId) return res.status(400).json({ error: "Missing fields" });

    const products = readJSON(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);

    const buyer = {
      id: genId(),
      name,
      phone,
      email: email || "",
      address: address || "",
      product: product ? product.name : productId,
      productId,
      price: price || (product ? product.price : ""),
      paymentLink: paymentLink || (product ? product.onlinePayment : ""),
      createdAt: nowISO()
    };

    const buyers = readJSON(BUYERS_FILE);
    buyers.unshift(buyer);
    writeJSON(BUYERS_FILE, buyers);

    // notify buyer by whatsapp (confirmation)
    try {
      const buyerMsg = `✅ Hi ${buyer.name}, we received your order for *${buyer.product}*. Total: ${buyer.price}. We'll be in touch.`;
      await sendWhatsAppText(buyer.phone, buyerMsg);
    } catch (e) { console.warn("buyer confirm fail", e.message); }

    // notify admin via whatsapp, telegram, email
    const adminMsg = `📦 New Order\nProduct: ${buyer.product}\nBuyer: ${buyer.name}\nPhone: ${buyer.phone}\nAddress: ${buyer.address}\nAmount: ${buyer.price}\nTime: ${buyer.createdAt}`;
    try { if (ADMIN_PHONE) await sendWhatsAppText(ADMIN_PHONE, adminMsg); } catch (e){console.warn(e.message);}
    try { await sendTelegram(adminMsg); } catch(e){}
    try { if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `New Order: ${buyer.product}`, `<pre>${adminMsg}</pre>`); } catch(e){}

    res.json({ success: true, buyer });
  } catch (err) {
    console.error("save-buyer error", err);
    res.status(500).json({ error: "Failed to save buyer" });
  }
});

// get clicks (admin)
app.get("/api/clicks", (req, res) => {
  const pass = req.query.password;
  if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  const clicks = readJSON(CLICKS_FILE);
  res.json({ success: true, clicks });
});

// messages (admin)
app.get("/api/messages", (req, res) => {
  const pass = req.query.password;
  if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  const msgs = readJSON(MESSAGES_FILE);
  res.json({ success: true, messages: msgs });
});

// subscribe a number
app.post("/api/subscribe", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Missing phone" });
  const subs = readJSON(SUBS_FILE);
  const p = cleanPhone(phone);
  if (!subs.includes(p)) subs.push(p);
  writeJSON(SUBS_FILE, subs);
  res.json({ success: true });
});

// send single whatsapp (admin)
app.post("/api/send-whatsapp", async (req, res) => {
  const { phone, text, password } = req.body;
  if (password && password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  try {
    const name = await fetchWhatsAppDisplayName(phone);
    const body = name ? `Hi ${name},\n\n${text}` : text;
    const r = await sendWhatsAppText(phone, body);
    res.json({ success: true, result: r });
  } catch (e) {
    console.error("send-whatsapp", e);
    res.status(500).json({ error: e.message });
  }
});

// send bulk (admin)
app.post("/api/send-bulk", async (req, res) => {
  try {
    const { numbers, message, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
    if (!Array.isArray(numbers) || numbers.length === 0) return res.status(400).json({ error: "No numbers" });

    const results = [];
    for (const num of numbers) {
      try {
        const name = await fetchWhatsAppDisplayName(num);
        const body = name ? `Hi ${name},\n\n${message}` : message;
        const r = await sendWhatsAppText(num, body);
        results.push({ to: num, ok: true, raw: r });
        await new Promise(r => setTimeout(r, 350)); // throttle
      } catch (err) {
        results.push({ to: num, ok: false, error: err.message });
      }
    }
    res.json({ success: true, results });
  } catch (err) {
    console.error("send-bulk error", err);
    res.status(500).json({ error: "Failed to send bulk" });
  }
});

// rotation auto-sender: every 10 minutes send next product to subscribers
async function rotateAndSend() {
  try {
    const subs = readJSON(SUBS_FILE);
    if (!subs.length) return;
    const products = readJSON(PRODUCTS_FILE).filter(p => !p.sold);
    if (!products.length) return;

    const rotation = readJSON(ROTATION_FILE);
    let idx = (rotation.index || -1) + 1;
    if (idx >= products.length) idx = 0;
    const product = products[idx];

    // message
    const msg = `📦 New Product: ${product.name}\n${product.desc}\nPrice: ${product.price}\nCheck: ${product.maskedLink}`;
    const results = [];
    for (const s of subs) {
      try {
        const name = await fetchWhatsAppDisplayName(s);
        const body = name ? `Hi ${name},\n\n${msg}` : msg;
        await sendWhatsAppText(s, body);
        results.push({ to: s, ok: true });
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        results.push({ to: s, ok: false, error: e.message });
      }
    }
    rotation.index = idx;
    writeJSON(ROTATION_FILE, rotation);
    // log in messages
    const messages = readJSON(MESSAGES_FILE);
    messages.unshift({ id: `rot_${Date.now()}`, type: "rotation", productId: product.id, results, createdAt: nowISO() });
    writeJSON(MESSAGES_FILE, messages);
    console.log("Auto-send rotated product:", product.name, "sent to", results.length, "subs");
  } catch (e) {
    console.error("rotateAndSend error", e.message);
  }
}

if (AUTO_MESSAGES) {
  // run immediately once then every 10 minutes
  setTimeout(() => { rotateAndSend(); }, 5000);
  setInterval(rotateAndSend, 10 * 60 * 1000);
}

// exchange rates proxy
app.get("/api/rates", async (req, res) => {
  try {
    const base = req.query.base || "USD";
    const r = await fetch(`https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch rates" });
  }
});

// webhook endpoint for WhatsApp
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  res.sendStatus(200);
});
app.post("/webhook", (req, res) => {
  try {
    const body = req.body;
    // store raw webhook
    const msgs = readJSON(MESSAGES_FILE);
    msgs.unshift({ id: `webhook_${Date.now()}`, body, receivedAt: nowISO() });
    if (msgs.length > 3000) msgs.length = 3000;
    writeJSON(MESSAGES_FILE, msgs);
    // parse and store statuses/inbound messages if present (best-effort)
    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (!entry.changes) continue;
        for (const ch of entry.changes) {
          const value = ch.value || {};
          if (value.statuses) {
            const statuses = value.statuses;
            const mlog = readJSON(MESSAGES_FILE);
            statuses.forEach(s => mlog.unshift({ type: "status", id: s.id || s.message_id, status: s.status, timestamp: s.timestamp, raw: s }));
            writeJSON(MESSAGES_FILE, mlog);
          }
          if (value.messages) {
            const incoming = value.messages;
            const mlog = readJSON(MESSAGES_FILE);
            incoming.forEach(m => mlog.unshift({ type: "inbound", id: m.id, from: m.from, text: m.text?.body || "", raw: m }));
            writeJSON(MESSAGES_FILE, mlog);
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error("webhook post error", e);
    res.sendStatus(500);
  }
});

// simple health
app.get("/api/health", (req, res) => res.json({ ok: true, time: nowISO() }));

// catch-all GET: serve admin.html by default (if you want root to be admin)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// start
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
