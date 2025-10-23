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
// JSON body parser for normal routes
app.use(bodyParser.json());
// serve public folder
app.use(express.static("public"));

const __dirname = path.resolve();
const productsFile = path.join(__dirname, "products.json");
const buyersFile = path.join(__dirname, "buyers.json");

const PORT = process.env.PORT || 5000;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN; // WhatsApp API token
const PHONE_ID = process.env.PHONE_NUMBER_ID;   // WhatsApp phone id
const ADMIN_PHONE = process.env.ADMIN_PHONE;    // Admin WhatsApp number (in international format)
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Nodemailer transporter (Gmail example)
let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

// --- Helpers for file persistence ---
function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("readJSON error:", err);
    return [];
  }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Load data
let products = readJSON(productsFile);
let buyers = readJSON(buyersFile);

function saveProducts() {
  writeJSON(productsFile, products);
}
function saveBuyers() {
  writeJSON(buyersFile, buyers);
}

// --- Utility: send WhatsApp message via Meta Graph API ---
async function sendWhatsApp(to, text) {
  if (!ACCESS_TOKEN || !PHONE_ID) {
    console.warn("WhatsApp not configured (ACCESS_TOKEN or PHONE_ID missing).");
    return;
  }
  const payload = {
    messaging_product: "whatsapp",
    to: to.replace(/\D/g, ""), // digits only
    type: "text",
    text: { body: text },
  };

  try {
    await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("sendWhatsApp error:", err);
  }
}

// --- Utility: send Telegram message ---
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing).");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
    });
  } catch (err) {
    console.error("sendTelegram error:", err);
  }
}

// --- Utility: send email via nodemailer ---
async function sendEmail(to, subject, html) {
  if (!transporter) {
    console.warn("Email not configured (EMAIL_USER or EMAIL_PASS missing).");
    return;
  }
  try {
    await transporter.sendMail({
      from: `"${ADMIN_NAME}" <${EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("sendEmail error:", err);
  }
}

// ------------------- ROUTES -------------------

// Get all products
app.get("/api/products", (req, res) => res.json(products));

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
  saveProducts();
  res.json({ success: true, product: newProduct });
});

// Edit product (admin)
app.put("/api/edit-product/:id", (req, res) => {
  const { password, name, desc, price, onlinePayment, alternatePayment } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  if (name !== undefined) product.name = name;
  if (desc !== undefined) product.desc = desc;
  if (price !== undefined) product.price = price;
  if (onlinePayment !== undefined) product.onlinePayment = onlinePayment;
  if (alternatePayment !== undefined) product.alternatePayment = alternatePayment;
  saveProducts();
  res.json({ success: true, product });
});

// Delete product (admin)
app.delete("/api/delete/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  products = products.filter(p => p.id !== req.params.id);
  saveProducts();
  res.json({ success: true });
});

// Mark as sold (admin)
app.post("/api/mark-sold/:id", async (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  product.sold = true;
  saveProducts();

  // Notify admin via WhatsApp + Telegram + Email optionally
  const adminText = `✅ Product marked SOLD by admin:\n${product.name}\nPrice: ${product.price}`;
  try { await sendWhatsApp(ADMIN_PHONE, adminText); } catch(e){/*noop*/} 
  try { await sendTelegram(adminText); } catch(e){/*noop*/} 
  if (ADMIN_EMAIL) {
    await sendEmail(ADMIN_EMAIL, `Product Sold: ${product.name}`, `<p>${adminText}</p>`);
  }

  res.json({ success: true });
});

// Initialize Paystack transaction
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
  } catch (error) {
    console.error("Paystack Error:", error);
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

// Save buyer details (called before showing payment options)
app.post("/api/save-buyer", async (req, res) => {
  try {
    const { name, phone, email, address, paymentMethod = "Pending", productId } = req.body;
    if (!name || !phone || !address || !productId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const product = products.find(p => p.id === productId);
    const buyer = {
      id: Date.now().toString(),
      name,
      phone,
      email,
      address,
      paymentMethod,
      product: product ? product.name : "Unknown Product",
      productId,
      date: new Date().toLocaleString(),
    };

    buyers.push(buyer);
    saveBuyers();

    // Notify admin via WhatsApp
    const adminMsg = `📦 New buyer saved\nName: ${buyer.name}\nPhone: ${buyer.phone}\nProduct: ${buyer.product}\nAddress: ${buyer.address}\nPayment: ${buyer.paymentMethod}`;
    if (ADMIN_PHONE && ACCESS_TOKEN && PHONE_ID) {
      await sendWhatsApp(ADMIN_PHONE, adminMsg);
    }
    // Notify admin via Telegram
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendTelegram(adminMsg);
    }
    // Send admin email
    if (ADMIN_EMAIL) {
      await sendEmail(ADMIN_EMAIL, `New Buyer: ${buyer.name}`, `<pre>${adminMsg}</pre>`);
    }

    // Send buyer confirmation via email (if email provided)
    if (buyer.email) {
      const buyerHtml = `
        <h3>Thanks for your order — ${buyer.name}</h3>
        <p>Product: <strong>${buyer.product}</strong></p>
        <p>Delivery Address: ${buyer.address}</p>
        <p>We will contact you on <strong>${buyer.phone}</strong> with updates.</p>
        <p>— ${ADMIN_NAME}</p>
      `;
      await sendEmail(buyer.email, `Order Received — ${buyer.product}`, buyerHtml).catch(console.error);
    }

    // Optionally notify buyer via WhatsApp if phone is given
    if (buyer.phone && ACCESS_TOKEN && PHONE_ID) {
      const buyerText = `✅ Hi ${buyer.name}, we received your order for *${buyer.product}*.\nWe will contact you soon regarding payment and delivery.`;
      await sendWhatsApp(buyer.phone, buyerText);
    }

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
  res.json({ success: true, buyers });
});

// Admin: delete buyer
app.delete("/api/delete-buyer/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.json({ success: false, error: "Unauthorized" });

  buyers = buyers.filter(b => b.id !== req.params.id);
  saveBuyers();
  res.json({ success: true });
});

// Paystack webhook — raw body required
app.post("/webhook/paystack", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const rawBody = req.body.toString();
    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
    if (hash !== signature) return res.status(400).send("Invalid signature");

    const event = JSON.parse(rawBody);
    if (event.event === "charge.success") {
      const tx = event.data;
      const productId = tx.metadata?.productId;
      const product = products.find(p => p.id === productId);

      // Try to find buyer entry by productId + email/phone if available in metadata
      const buyerPhone = tx.metadata?.phone || tx.customer?.phone;
      const buyerEmail = tx.customer?.email || tx.metadata?.email;
      let matchedBuyer = null;

      if (buyers && buyers.length) {
        matchedBuyer = buyers.find(b => b.productId === productId && (b.phone && buyerPhone && b.phone.replace(/\D/g,'') === buyerPhone.replace(/\D/g,'') || b.email && buyerEmail && b.email.toLowerCase() === buyerEmail.toLowerCase()));
      }

      // Update product sold status (note: earlier you preferred manual marking; this mirrors previous behavior)
      if (product) {
        product.sold = true;
        saveProducts();
      }

      // If we matched a buyer, update paymentMethod and save
      if (matchedBuyer) {
        matchedBuyer.paymentMethod = "Paystack";
        matchedBuyer.txref = tx.reference || tx.id;
        saveBuyers();
      } else {
        // If no matching buyer, optionally append a buyer entry using tx.customer info
        const fallbackName = tx.customer?.first_name || "Customer";
        const fallbackPhone = buyerPhone || "";
        const fallbackEmail = buyerEmail || "";
        const fallbackBuyer = {
          id: Date.now().toString(),
          name: fallbackName,
          phone: fallbackPhone,
          email: fallbackEmail,
          address: tx.metadata?.address || "N/A",
          paymentMethod: "Paystack",
          product: product ? product.name : "Unknown",
          productId,
          date: new Date().toLocaleString(),
          txref: tx.reference || tx.id,
        };
        buyers.push(fallbackBuyer);
        saveBuyers();
        matchedBuyer = fallbackBuyer;
      }

      // Send buyer WhatsApp confirmation
      if (matchedBuyer && matchedBuyer.phone && ACCESS_TOKEN && PHONE_ID) {
        const buyerMsg = `✅ Payment received for *${matchedBuyer.product}*.\nRef: ${tx.reference || tx.id}\nWe will prepare your order for delivery.`;
        await sendWhatsApp(matchedBuyer.phone, buyerMsg);
      }

      // Send admin WhatsApp + Telegram + Email
      const adminMsg = `💰 New paid order\nProduct: ${product ? product.name : "Unknown"}\nAmount: ${tx.currency} ${tx.amount/100}\nCustomer: ${matchedBuyer ? matchedBuyer.name : tx.customer?.email}\nPhone: ${matchedBuyer ? matchedBuyer.phone : buyerPhone || "N/A"}\nRef: ${tx.reference || tx.id}`;
      if (ADMIN_PHONE && ACCESS_TOKEN && PHONE_ID) await sendWhatsApp(ADMIN_PHONE, adminMsg);
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) await sendTelegram(adminMsg);
      if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `Paid Order: ${product ? product.name : "Unknown"}`, `<pre>${adminMsg}</pre>`);

      console.log("Webhook processed:", tx.reference || tx.id);
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("error");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
