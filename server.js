require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public")); // Serve admin.html, store.html, etc.

// ====== ENV VARIABLES ======
const PORT = process.env.PORT || 5000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "PAST_IT_HERE";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "PAST_IT_HERE";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "PAST_IT_HERE";
const ADMIN_PHONE = process.env.ADMIN_PHONE || "PAST_IT_HERE";
const ADMIN_NAME = process.env.ADMIN_NAME || "PAST_IT_HERE";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "PAST_IT_HERE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "PAST_IT_HERE";
const SMTP_USER = process.env.SMTP_USER || "PAST_IT_HERE";
const SMTP_PASS = process.env.SMTP_PASS || "PAST_IT_HERE";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "PAST_IT_HERE";
const AUTO_MESSAGES = process.env.AUTO_MESSAGES === "true";
const WHATSAPP_GROUP_IDS = (process.env.WHATSAPP_GROUP_IDS || "").split(",");

// ====== FILE STORAGE ======
const DATA_FILE = path.join(__dirname, "data/products.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

// ====== EMAIL TRANSPORT ======
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

// ====== API ROUTES ======

// 🟨 Add Product
app.post("/api/add-product", (req, res) => {
  const { password, name, desc, price, category, onlinePayment, alternatePayment } = req.body;
  if (password !== ADMIN_PASSWORD) return res.json({ error: "Unauthorized" });

  const products = JSON.parse(fs.readFileSync(DATA_FILE));
  const newProduct = {
    id: Date.now().toString(),
    name,
    desc,
    price,
    category,
    onlinePayment,
    alternatePayment,
    sold: false,
    createdAt: new Date().toISOString(),
    visits: [],
  };

  products.push(newProduct);
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  res.json({ success: true, product: newProduct });
});

// 🟨 Get Products
app.get("/api/products", (req, res) => {
  const products = JSON.parse(fs.readFileSync(DATA_FILE));
  res.json(products);
});

// 🟨 Mark Product Sold
app.post("/api/mark-sold", (req, res) => {
  const { id } = req.body;
  const products = JSON.parse(fs.readFileSync(DATA_FILE));
  const prod = products.find(p => p.id === id);
  if (prod) prod.sold = true;
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  res.json({ success: true });
});

// 🟨 Send WhatsApp Message
app.post("/api/send-whatsapp", async (req, res) => {
  const { phone, text } = req.body;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: text }
      })
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// 🟨 Track Link Visit
app.get("/track/:productId", (req, res) => {
  const { productId } = req.params;
  const products = JSON.parse(fs.readFileSync(DATA_FILE));
  const prod = products.find(p => p.id === productId);

  if (prod) {
    prod.visits.push({
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  }

  res.redirect(prod?.alternatePayment || "/");
});

// 🟨 Delivery Calculator API
app.post("/api/calc-delivery", (req, res) => {
  const { type, base } = req.body;
  let cost = Number(base);
  if (type === "Standard") cost += 20;
  if (type === "Express") cost += 50;
  res.json({ total: cost });
});

// 🟨 Buyers Info
app.post("/api/buyers", (req, res) => {
  const file = path.join(__dirname, "data/buyers.json");
  const buyers = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
  buyers.push({ ...req.body, date: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(buyers, null, 2));
  res.json({ success: true });
});

// 🟨 Auto Message on Purchase
if (AUTO_MESSAGES) {
  app.post("/api/auto-message", async (req, res) => {
    const { buyerPhone, productName } = req.body;
    const msg = `👋 Hello! Thank you for checking out *${productName}* on our store. Need help? Message us directly.`;
    await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: buyerPhone,
        type: "text",
        text: { body: msg }
      })
    });
    res.json({ success: true });
  });
}

// ====== SERVER START ======
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
