// server.js — Node.js-ready with placeholders
import express from "express";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";
import nodemailer from "nodemailer";

dotenv.config(); // Load .env variables

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const __dirname = path.resolve();
const productsFile = path.join(__dirname, "products.json");
const buyersFile = path.join(__dirname, "buyers.json");

// -------------------------
// ENV / CONFIG
// -------------------------
const PORT = process.env.PORT || 5000;

// Paystack
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || "PASTE_YOUR_PAYSTACK_SECRET_HERE";

// Admin
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";
const ADMIN_NAME = process.env.ADMIN_NAME || "FATI IBRAHIM";
const ADMIN_PHONE = process.env.ADMIN_PHONE || "0593231752";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "johnofosu20@gmail.com";

// WhatsApp (Meta Cloud API)
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EAAbnZCZA0lZBioBPZC1Bl4LKGbmeamRE9s5NZC9BUzxfX1f4agMEZBIYvMX04Wv8C5K0ZBvkg78azsQInnIZAWAFq7SQzfSgtRIBheqXobkC73i3aYWfQH6z70Mq8uhoBjOvlzgdj1dYJf0nvqatB1UNcO8zQmNxhDor0Ptlp153BSiiZBc4j4ZBJCpbPYddnuEdT1PZBpHFDgZD";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "768962646310363";

// Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "PASTE_YOUR_TELEGRAM_BOT_TOKEN_HERE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "PASTE_YOUR_TELEGRAM_CHAT_ID_HERE";

// SMTP Email
const SMTP_HOST = process.env.SMTP_HOST || "PASTE_YOUR_SMTP_HOST_HERE";
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
const SMTP_USER = process.env.SMTP_USER || "PASTE_YOUR_SMTP_USER_HERE";
const SMTP_PASS = process.env.SMTP_PASS || "PASTE_YOUR_SMTP_PASS_HERE";

// Feature flags
const AUTO_MESSAGES = (process.env.AUTO_MESSAGES || "true").toLowerCase() !== "false";

// -------------------------
// Helpers: read/write JSON
// -------------------------
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

// Load initial data
let products = readJSON(productsFile);
let buyers = readJSON(buyersFile);

// -------------------------
// Email setup
// -------------------------
let transporter = null;
if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.log("⚠️ Email not configured. Emails will be skipped.");
}

// -------------------------
// WhatsApp helper
// -------------------------
async function sendWhatsApp(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return;
  const payload = { messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body: text } };
  try {
    await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("sendWhatsApp error:", err);
  }
}

// -------------------------
// Telegram helper
// -------------------------
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
    });
  } catch (err) {
    console.error("sendTelegram error:", err);
  }
}

// -------------------------
// Email helper
// -------------------------
async function sendEmail(to, subject, html) {
  if (!transporter) return;
  try {
    await transporter.sendMail({ from: `"${ADMIN_NAME}" <${SMTP_USER}>`, to, subject, html });
  } catch (err) {
    console.error("sendEmail error:", err);
  }
}

// -------------------------
// Export config (optional for modules)
// -------------------------
export {
  PORT, PAYSTACK_SECRET, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_PHONE, ADMIN_EMAIL,
  WHATSAPP_TOKEN, PHONE_NUMBER_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, AUTO_MESSAGES,
  productsFile, buyersFile, readJSON, writeJSON, sendWhatsApp, sendTelegram, sendEmail
};

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
