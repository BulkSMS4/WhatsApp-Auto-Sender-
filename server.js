/* server.js — Version without Paystack
 - file storage: products.json, buyers.json
 - Buyer receives WhatsApp + Email
 - Admin receives WhatsApp + Telegram + Email
 - AUTO_MESSAGES env toggle for 10s reminders
*/

import express from "express";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const __dirname = path.resolve();
const productsFile = path.join(__dirname, "products.json");
const buyersFile = path.join(__dirname, "buyers.json");

const PORT = process.env.PORT || 5000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EAAbnZCZA0lZBioBPZC1Bl4LKGbmeamRE9s5NZC9BUzxfX1f4agMEZBIYvMX04Wv8C5K0ZBvkg78azsQInnIZAWAFq7SQzfSgtRIBheqXobkC73i3aYWfQH6z70Mq8uhoBjOvlzgdj1dYJf0nvqatB1UNcO8zQmNxhDor0Ptlp153BSiiZBc4j4ZBJCpbPYddnuEdT1PZBpHFDgZD";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";
const ADMIN_PHONE = process.env.ADMIN_PHONE || "+233593231792";
const ADMIN_NAME = process.env.ADMIN_NAME || "FATI_IBRAHIM";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8003409315:AAEVIPsOYnF8mBaT8l-kmzWucHUTu9Yo8AY";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8085649636";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

const AUTO_MESSAGES = (process.env.AUTO_MESSAGES || "true").toLowerCase() !== "false";

// ---------- helpers: read/write JSON ----------
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("readJSON error for", filePath, err);
    return [];
  }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let products = readJSON(productsFile);
let buyers = readJSON(buyersFile);

// ---------- Email setup ----------
let transporter = null;
if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.log("⚠️ Email not configured (SMTP_USER / SMTP_PASS missing). Emails will be skipped.");
}

// ---------- WhatsApp helper ----------
async function sendWhatsApp(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn("WhatsApp not configured; skipping message to", to);
    return;
  }
  const payload = {
    messaging_product: "whatsapp",
    to: to.replace(/\D/g, ""),
    type: "text",
    text: { body: text },
  };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("WhatsApp API error:", res.status, txt);
    }
  } catch (err) {
    console.error("sendWhatsApp error:", err);
  }
}

// ---------- Telegram helper ----------
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("sendTelegram error:", err);
  }
}

// ---------- Email helper ----------
async function sendEmail(to, subject, html) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: `"${ADMIN_NAME}" <${SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("sendEmail error:", err);
  }
}

// -------------------- ROUTES --------------------

// ✅ Root route (to fix 502 and show app running)
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Dashboard API is running fine.");
});

// Get all products
app.get("/api/products", (req, res) => {
  products = readJSON(productsFile);
  res.json(products);
});

// Add product
app.post("/api/add-product", (req, res) => {
  const { password, name, desc, price, onlinePayment, alternatePayment } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  const newProduct = {
    id: Date.now().toString(),
    name,
    desc,
    price,
    onlinePayment,
    alternatePayment,
    sold: false,
  };
  products.push(newProduct);
  writeJSON(productsFile, products);
  res.json({ success: true, product: newProduct });
});

// Delete product
app.delete("/api/delete/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  products = readJSON(productsFile).filter((p) => p.id !== req.params.id);
  writeJSON(productsFile, products);
  res.json({ success: true });
});

// Save buyer
app.post("/api/save-buyer", async (req, res) => {
  try {
    const { name, phone, email, address, productId } = req.body;
    if (!name || !phone || !address || !productId)
      return res.status(400).json({ error: "Missing fields" });

    products = readJSON(productsFile);
    const product = products.find((p) => p.id === productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const buyer = {
      id: Date.now().toString(),
      name,
      phone,
      email,
      address,
      product: product.name,
      productId,
      date: new Date().toLocaleString(),
    };

    buyers = readJSON(buyersFile);
    buyers.push(buyer);
    writeJSON(buyersFile, buyers);

    const buyerMsg = `✅ Hi ${name}, we received your order for *${product.name}*. We'll contact you soon.`;
    await sendWhatsApp(phone, buyerMsg);
    if (email) await sendEmail(email, `Order Received: ${product.name}`, `<p>${buyerMsg}</p>`);

    const adminMsg = `📦 New Order\nProduct: ${product.name}\nBuyer: ${name}\nPhone: ${phone}\nEmail: ${email || "N/A"}\nAddress: ${address}`;
    await sendWhatsApp(ADMIN_PHONE, adminMsg);
    await sendTelegram(adminMsg);
    if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `New Order: ${product.name}`, `<pre>${adminMsg}</pre>`);

    res.json({ success: true, buyer });
  } catch (err) {
    console.error("save-buyer error:", err);
    res.status(500).json({ error: "Failed to save buyer" });
  }
});

// Get buyers (admin)
app.get("/api/get-buyers", (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  buyers = readJSON(buyersFile);
  res.json({ success: true, buyers });
});

// Auto reminders
if (AUTO_MESSAGES) {
  setInterval(async () => {
    buyers = readJSON(buyersFile);
    products = readJSON(productsFile);
    for (const b of buyers) {
      const product = products.find((p) => p.id === b.productId);
      if (!product || product.sold) continue;
      const msg = `👋 Hi ${b.name}, your order for *${product.name}* is still pending. Please complete payment.`;
      await sendWhatsApp(b.phone, msg);
    }
  }, 10000);
}

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
