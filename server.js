/* server.js — Final complete server
 - file storage: products.json, buyers.json
 - Buyer receives WhatsApp + Email
 - Admin receives WhatsApp + Telegram + Email
 - Paystack init + webhook (verifies signature)
 - AUTO_MESSAGES env toggle for 10s reminders
*/

import express from "express";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const __dirname = path.resolve();
const productsFile = path.join(__dirname, "products.json");
const buyersFile = path.join(__dirname, "buyers.json");

const PORT = process.env.PORT || 5000;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EAAbnZCZA0lZBioBPZC1Bl4LKGbmeamRE9s5NZC9BUzxfX1f4agMEZBIYvMX04Wv8C5K0ZBvkg78azsQInnIZAWAFq7SQzfSgtRIBheqXobkC73i3aYWfQH6z70Mq8uhoBjOvlzgdj1dYJf0nvqatB1UNcO8zQmNxhDor0Ptlp153BSiiZBc4j4ZBJCpbPYddnuEdT1PZBpHFDgZD"; // Meta WhatsApp Cloud token
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "768962646310363"; // Meta phone ID
const ADMIN_PHONE = process.env.ADMIN_PHONE || "+233593231752"; // admin WhatsApp (international format)
const ADMIN_NAME = process.env.ADMIN_NAME || "FATI_IBRAHIM";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8003409315:AAEVIPsOYnF8mBaT8l-kmzWucHUTu9Yo8AY";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8085649636";

const SMTP_HOST = process.env.SMTP_HOST || process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "johnofosu20@gmail.com";

// Toggle auto messages loop (default true)
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

// Load initial data
let products = readJSON(productsFile);
let buyers = readJSON(buyersFile);

// ---------- email setup (nodemailer) ----------
let transporter = null;
if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST || "smtp.gmail.com",
    port: SMTP_PORT || 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.log("⚠️ Email not configured (SMTP_USER / SMTP_PASS missing). Emails will be skipped.");
}

// ---------- WhatsApp helper (Meta Cloud API) ----------
async function sendWhatsApp(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn("WhatsApp not configured; skipping message to", to);
    return;
  }
  const payload = {
    messaging_product: "whatsapp",
    to: to.replace(/\D/g, ""), // digits only
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
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram not configured; skipping telegram notification.");
    return;
  }
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
  if (!transporter) {
    console.warn("Email transporter not configured; skipping email to", to);
    return;
  }
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

// Get all products
app.get("/api/products", (req, res) => {
  products = readJSON(productsFile);
  res.json(products);
});

// Add product (admin)
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

// Edit product (admin)
app.put("/api/edit-product/:id", (req, res) => {
  const { password, name, desc, price, onlinePayment, alternatePayment } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  products = readJSON(productsFile);
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  if (name !== undefined) product.name = name;
  if (desc !== undefined) product.desc = desc;
  if (price !== undefined) product.price = price;
  if (onlinePayment !== undefined) product.onlinePayment = onlinePayment;
  if (alternatePayment !== undefined) product.alternatePayment = alternatePayment;

  writeJSON(productsFile, products);
  res.json({ success: true, product });
});

// Delete product (admin)
app.delete("/api/delete/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  products = readJSON(productsFile).filter((p) => p.id !== req.params.id);
  writeJSON(productsFile, products);
  res.json({ success: true });
});

// Mark as sold (admin)
app.post("/api/mark-sold/:id", async (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  products = readJSON(productsFile);
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  product.sold = true;
  writeJSON(productsFile, products);

  // Notify admin (WhatsApp, Telegram, Email)
  const adminText = `✅ Product marked SOLD by admin:\n${product.name}\nPrice: ${product.price}`;
  if (ADMIN_PHONE) await sendWhatsApp(ADMIN_PHONE, adminText);
  await sendTelegram(adminText).catch(() => {});
  if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `Product Sold: ${product.name}`, `<p>${adminText}</p>`);

  res.json({ success: true });
});

// Initialize Paystack payment
app.post("/api/paystack/initiate", async (req, res) => {
  const { email, amount, productId } = req.body;
  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
      },
      body: JSON.stringify({
        email,
        amount: Number(amount) * 100,
        metadata: { productId },
        callback_url: "https://yourdomain.com/payment-success",
      }),
    });
    const data = await response.json();
    if (!data.status) return res.status(400).json({ error: data.message || "Paystack error" });
    res.json({ authorization_url: data.data.authorization_url });
  } catch (err) {
    console.error("Paystack init error:", err);
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

// Save buyer details (called before payment)
app.post("/api/save-buyer", async (req, res) => {
  try {
    const { name, phone, email, address, paymentMethod = "Pending", productId } = req.body;
    if (!name || !phone || !address || !productId) return res.status(400).json({ error: "Missing fields" });

    products = readJSON(productsFile);
    const product = products.find((p) => p.id === productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const buyer = {
      id: Date.now().toString(),
      name,
      phone,
      email,
      address,
      paymentMethod,
      product: product.name,
      productId,
      date: new Date().toLocaleString(),
    };

    buyers = readJSON(buyersFile);
    buyers.push(buyer);
    writeJSON(buyersFile, buyers);

    // Buyer receives WhatsApp + Email
    const buyerWhatsAppText = `✅ Hi ${name}, we received your order for *${product.name}*.\nWe will contact you with payment instructions.`;
    await sendWhatsApp(phone, buyerWhatsAppText).catch(() => {});

    if (email) {
      const buyerHtml = `<h3>Order Received</h3><p>Hi ${name},<br>We received your order for <strong>${product.name}</strong>.<br>Address: ${address}</p>`;
      await sendEmail(email, `Order Received — ${product.name}`, buyerHtml).catch(() => {});
    }

    // Admin receives WhatsApp + Telegram + Email
    const adminText = `📦 New Order\nProduct: ${product.name}\nBuyer: ${name}\nPhone: ${phone}\nEmail: ${email || "N/A"}\nAddress: ${address}`;
    if (ADMIN_PHONE) await sendWhatsApp(ADMIN_PHONE, adminText).catch(() => {});
    await sendTelegram(adminText).catch(() => {});
    if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `New Order — ${product.name}`, `<pre>${adminText}</pre>`).catch(() => {});

    res.json({ success: true, buyer });
  } catch (err) {
    console.error("save-buyer error:", err);
    res.status(500).json({ error: "Failed to save buyer" });
  }
});

// Admin: get buyers (secure)
app.get("/api/get-buyers", (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.json({ success: false, error: "Unauthorized" });
  buyers = readJSON(buyersFile);
  res.json({ success: true, buyers });
});

// Admin: delete buyer
app.delete("/api/delete-buyer/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.json({ success: false, error: "Unauthorized" });

  buyers = readJSON(buyersFile).filter((b) => b.id !== req.params.id);
  writeJSON(buyersFile, buyers);
  res.json({ success: true });
});

// Paystack webhook (raw body)
app.post("/webhook/paystack", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const rawBody = req.body.toString();
    const expected = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
    if (signature !== expected) {
      console.warn("Invalid Paystack signature");
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(rawBody);
    if (event.event === "charge.success") {
      const tx = event.data;
      const productId = tx.metadata?.productId;
      products = readJSON(productsFile);
      const product = products.find((p) => p.id === productId);

      // Mark product sold
      if (product) {
        product.sold = true;
        writeJSON(productsFile, products);
      }

      // Try to associate buyer record (best-effort)
      buyers = readJSON(buyersFile);
      const buyerPhone = tx.metadata?.phone || tx.customer?.phone || "";
      const buyerEmail = tx.customer?.email || tx.metadata?.email || "";
      let matched = buyers.find((b) => b.productId === productId && ((b.phone && buyerPhone && b.phone.replace(/\D/g, '') === buyerPhone.replace(/\D/g, '')) || (b.email && buyerEmail && b.email.toLowerCase() === buyerEmail.toLowerCase())));

      if (!matched) {
        // create fallback buyer entry
        matched = {
          id: Date.now().toString(),
          name: tx.customer?.first_name || "Customer",
          phone: buyerPhone,
          email: buyerEmail,
          address: tx.metadata?.address || "N/A",
          paymentMethod: "Paystack",
          product: product ? product.name : "Unknown",
          productId,
          date: new Date().toLocaleString(),
          txref: tx.reference || tx.id,
        };
        buyers.push(matched);
        writeJSON(buyersFile, buyers);
      } else {
        matched.paymentMethod = "Paystack";
        matched.txref = tx.reference || tx.id;
        writeJSON(buyersFile, buyers);
      }

      // Notify buyer via WhatsApp + Email
      const buyerMsg = `✅ Payment received for *${matched.product}*.\nRef: ${tx.reference || tx.id}\nWe'll prepare your order.`;
      if (matched.phone) await sendWhatsApp(matched.phone, buyerMsg).catch(() => {});
      if (matched.email) await sendEmail(matched.email, `Payment Received — ${matched.product}`, `<p>${buyerMsg}</p>`).catch(() => {});

      // Notify admin via WhatsApp + Telegram + Email
      const adminMsg = `💰 Paid Order\nProduct: ${product ? product.name : "Unknown"}\nAmount: ${tx.currency} ${tx.amount / 100}\nCustomer: ${matched.name}\nPhone: ${matched.phone || "N/A"}\nRef: ${tx.reference || tx.id}`;
      if (ADMIN_PHONE) await sendWhatsApp(ADMIN_PHONE, adminMsg).catch(() => {});
      await sendTelegram(adminMsg).catch(() => {});
      if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `Paid Order — ${product ? product.name : "Unknown"}`, `<pre>${adminMsg}</pre>`).catch(() => {});

      console.log("Processed Paystack charge.success:", tx.reference || tx.id);
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("error");
  }
});

// Auto reminder loop (10s) — controlled by AUTO_MESSAGES env var
if (AUTO_MESSAGES) {
  setInterval(async () => {
    try {
      buyers = readJSON(buyersFile);
      products = readJSON(productsFile);
      for (const b of buyers) {
        const product = products.find((p) => p.id === b.productId);
        if (!product || product.sold) continue;
        // Example reminder message
        const msg = `👋 Hi ${b.name},\nYour order for *${product.name}* is pending. Please complete payment to secure the item.`;
        if (b.phone) {
          await sendWhatsApp(b.phone, msg).catch(() => {});
          console.log(`Auto reminder sent to ${b.name} (${b.phone})`);
        }
      }
    } catch (err) {
      console.error("Auto reminder loop error:", err);
    }
  }, 10000); // every 10 seconds
} else {
  console.log("Auto messages disabled (AUTO_MESSAGES=false)");
}

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
