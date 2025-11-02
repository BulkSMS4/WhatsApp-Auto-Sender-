/* server.js — Quick Market Final Version
   Features:
   - WhatsApp, Telegram & Email alerts
   - Auto-category buyer detection
   - Jobs → only job subscribers
   - Products → only product subscribers
   - Webhook verification
   - “View All Categories” footer with tracking link
*/

import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import nodemailer from "nodemailer";

dotenv.config();
const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static("public"));

// ----------------------------
// Env variables
// ----------------------------
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_NAME = process.env.STORE_NAME || "Quick Market";
const BASE_URL = process.env.BASE_URL || "https://yourstore.com";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// ----------------------------
// Data files
// ----------------------------
const DATA_DIR = path.resolve("./data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const BUYERS_FILE = path.join(DATA_DIR, "buyers.json");
const ORDERS_FILE = path.join(DATA_DIR, "buyers-orders.json");

for (const file of [PRODUCTS_FILE, BUYERS_FILE, ORDERS_FILE]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([], null, 2));
}

const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ----------------------------
// 🛍 ADMIN — Add Product/Job
// ----------------------------
app.post("/api/add-product", async (req, res) => {
  const { password, title, desc, price, category, site, payment, applyForm, images = [] } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  const id = Date.now().toString();
  const product = { id, title, desc, price, category, site, payment, applyForm, images, date: new Date() };

  const products = readJSON(PRODUCTS_FILE);
  products.push(product);
  writeJSON(PRODUCTS_FILE, products);

  await sendCategoryAlert(product);
  res.json({ success: true, id });
});

// ----------------------------
// 📦 STORE — Get Products
// ----------------------------
app.get("/api/products", (req, res) => res.json(readJSON(PRODUCTS_FILE)));

// ----------------------------
// 🧠 BUYER CATEGORY TRACKING
// ----------------------------
app.post("/api/update-buyer", (req, res) => {
  const { name, phone, category } = req.body;
  if (!phone || !category) return res.json({ error: "Missing info" });

  const buyers = readJSON(BUYERS_FILE);
  const buyer = buyers.find((b) => b.phone === phone);
  if (buyer) buyer.category = category;
  else buyers.push({ name, phone, category });
  writeJSON(BUYERS_FILE, buyers);

  res.json({ success: true });
});

// ----------------------------
// 🚀 SEND ALERT TO CATEGORY
// ----------------------------
async function sendCategoryAlert(product) {
  const buyers = readJSON(BUYERS_FILE);
  const targets = buyers.filter((b) =>
    product.category === "Jobs" ? b.category === "Jobs" : b.category !== "Jobs"
  );

  const text =
    product.category === "Jobs"
      ? `💼 *${STORE_NAME} - Job Alert!*\n\n📌 *${product.title}*\n${product.desc}\n\n🌍 Location: ${product.location || "—"}\n💰 Salary: $${product.price}\n🔗 Apply: ${product.applyForm || product.site}\n\n🟢 View More Jobs: ${BASE_URL}/store.html`
      : `🛍 *${STORE_NAME} - New Product Alert!*\n\n🧾 *${product.title}*\n${product.desc}\n💰 Price: $${product.price}\n🛒 Buy Now: ${product.payment || product.site}\n\n📂 Category: ${product.category}\n\n🟢 View All Categories: ${BASE_URL}/store.html`;

  for (const b of targets) await sendWhatsApp(b.phone, text);
  sendTelegram(text);
  sendEmail(ADMIN_EMAIL, `${STORE_NAME} — New ${product.category}`, text);
}

// ----------------------------
// 💬 WhatsApp Send
// ----------------------------
await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
  method: "POST",
  headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ messaging_product: "whatsapp", to, text: { body: msg } }),
});

// ----------------------------
// 📩 Telegram Send
// ----------------------------
async function sendTelegram(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg }),
    });
  } catch (err) { console.log("Telegram send error:", err.message); }
}

// ----------------------------
// 📧 Email Send
// ----------------------------
async function sendEmail(to, subject, html) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: `${STORE_NAME} <${SMTP_USER}>`,
    to,
    subject,
    html: html.replace(/\n/g, "<br>"),
  });
}

// ----------------------------
// ✅ Buy Product
// ----------------------------
app.post("/api/buy", (req, res) => {
  const { productId, name, phone, address, type, category } = req.body;
  if (!productId || !phone) return res.json({ error: "Missing info" });

  const orders = readJSON(ORDERS_FILE);
  const trackingId = Date.now().toString();
  const paymentLink = `${BASE_URL}/pay/${productId}?tracking=${trackingId}`;

  orders.push({ trackingId, productId, name, phone, address, type, category, paymentLink, status: "Pending" });
  writeJSON(ORDERS_FILE, orders);

  // Update buyer category
  const buyers = readJSON(BUYERS_FILE);
  const buyer = buyers.find((b) => b.phone === phone);
  if (buyer) buyer.category = category;
  else buyers.push({ name, phone, category });
  writeJSON(BUYERS_FILE, buyers);

  res.json({ success: true, trackingId, paymentLink });
});

// ----------------------------
// 📦 Track Order
// ----------------------------
app.get("/api/tracking/:id", (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find((o) => o.trackingId === req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });

  res.json({ status: order.status, expectedDelivery: order.expectedDelivery || "Within 3–5 business days" });
});

// ----------------------------
// 🔗 Webhook Verification
// ----------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED ✅");
      return res.status(200).send(challenge);
    } else return res.sendStatus(403);
  } else return res.sendStatus(400);
});

app.post("/webhook", (req, res) => {
  const body = req.body;
  console.log("Webhook received:", body);
  // handle messages/events here
  res.sendStatus(200);
});

// ----------------------------
app.listen(PORT, () => console.log(`✅ ${STORE_NAME} server running on port ${PORT}`));
