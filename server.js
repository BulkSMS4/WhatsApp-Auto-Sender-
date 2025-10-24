// server.js
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Files
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const BUYERS_FILE = path.join(__dirname, "buyers.json");

// Helpers for JSON storage
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("readJSON error", err);
    return [];
  }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Env
const PORT = process.env.PORT || 5000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ADMIN_PHONE = process.env.ADMIN_PHONE || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

// Serve static html files from root
app.use(express.static(__dirname));

// ----- Admin login -----
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ success: true });
  return res.status(401).json({ success: false, error: "Unauthorized" });
});

// ----- Products: get/add/delete/mark-sold -----
app.get("/api/products", (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  res.json(products);
});

app.post("/api/add-product", (req, res) => {
  const { password, name, desc, price, onlinePayment, alternatePayment } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  const products = readJSON(PRODUCTS_FILE);
  const newProduct = {
    id: Date.now().toString(),
    name,
    desc,
    price,
    onlinePayment,      // hidden payment link
    alternatePayment,   // product website
    sold: false,
    createdAt: new Date().toISOString()
  };
  products.unshift(newProduct);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, product: newProduct });
});

app.delete("/api/delete-product/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  const products = readJSON(PRODUCTS_FILE).filter(p => p.id !== req.params.id);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true });
});

app.post("/api/mark-sold", (req, res) => {
  const { password, id } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });
  const products = readJSON(PRODUCTS_FILE);
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Product not found" });
  products[idx].sold = true;
  writeJSON(PRODUCTS_FILE, products);
  // Optionally: notify buyers admin phone or saved buyers
  res.json({ success: true, product: products[idx] });
});

// ----- Buyers (save/get/delete) -----
app.post("/api/save-buyer", async (req, res) => {
  try {
    const { name, phone, email, address, productId, price, paymentLink } = req.body;
    if (!name || !phone || !productId) return res.status(400).json({ error: "Missing fields" });

    const products = readJSON(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);
    const buyer = {
      id: Date.now().toString(),
      name,
      phone,
      email: email || "",
      address: address || "",
      product: product ? product.name : productId,
      productId,
      price: price || (product ? product.price : ""),
      paymentLink: paymentLink || (product ? product.onlinePayment : ""),
      date: new Date().toLocaleString(),
    };

    const buyers = readJSON(BUYERS_FILE);
    buyers.unshift(buyer);
    writeJSON(BUYERS_FILE, buyers);

    // Send WhatsApp to buyer (confirmation)
    const buyerMsg = `✅ Hi ${buyer.name}, we received your order for ${buyer.product}. Total: ${buyer.price}. We will contact you soon.`;
    try { await sendWhatsAppMessage(buyer.phone, buyerMsg); } catch(e){ console.warn("notify buyer fail", e); }

    // Notify admin
    const adminMsg = `📦 New Order\nProduct: ${buyer.product}\nBuyer: ${buyer.name}\nPhone: ${buyer.phone}\nAddress: ${buyer.address}\nTotal: ${buyer.price}`;
    try { await sendWhatsAppMessage(ADMIN_PHONE, adminMsg); } catch(e){ console.warn("notify admin fail", e); }

    res.json({ success: true, buyer });
  } catch (err) {
    console.error("save-buyer error", err);
    res.status(500).json({ error: "Failed to save buyer" });
  }
});

app.get("/api/get-buyers", (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ success: false, error: "Unauthorized" });
  const buyers = readJSON(BUYERS_FILE);
  res.json({ success: true, buyers });
});

app.delete("/api/delete-buyer/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ success: false, error: "Unauthorized" });
  const buyers = readJSON(BUYERS_FILE).filter(b => b.id !== req.params.id);
  writeJSON(BUYERS_FILE, buyers);
  res.json({ success: true });
});

// ----- WhatsApp sending helper -----
async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error("WhatsApp credentials missing");
  }
  const cleaned = (""+to).replace(/\D/g, "");
  const payload = {
    messaging_product: "whatsapp",
    to: cleaned,
    type: "text",
    text: { body: text }
  };
  const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("WhatsApp API error:", data);
    throw new Error(JSON.stringify(data));
  }
  return data;
}

// ----- Send single or bulk (admin endpoints) -----
// single: for stores form confirm
app.post("/api/send-whatsapp", async (req, res) => {
  try {
    const { password, phone, text } = req.body;
    // if request comes from frontend store (customer), password not required
    // admin usage should include password for safety
    if (password && password !== ADMIN_PASSWORD) return res.status(403).json({ success: false, error: "Unauthorized" });

    const result = await sendWhatsAppMessage(phone, text);
    res.json({ success: true, result });
  } catch (err) {
    console.error("send-whatsapp error", err);
    res.status(500).json({ success: false, error: "Failed to send" });
  }
});

// bulk: admin bulk sending (numbers array)
app.post("/api/send-bulk", async (req, res) => {
  try {
    const { password, numbers, message } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(403).json({ success: false, error: "Unauthorized" });
    if (!Array.isArray(numbers) || numbers.length === 0) return res.status(400).json({ success: false, error: "No numbers" });

    const results = [];
    for (const n of numbers) {
      try {
        const r = await sendWhatsAppMessage(n, message);
        results.push({ to: n, ok: true, result: r });
        // small delay to reduce risk of rate limit
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        results.push({ to: n, ok: false, error: String(err) });
      }
    }
    res.json({ success: true, results });
  } catch (err) {
    console.error("send-bulk error", err);
    res.status(500).json({ success: false, error: "Failed to send bulk" });
  }
});

// ----- Exchange rate proxy (live rates) -----
// Using exchangerate.host which has free no-key access
app.get("/api/rates", async (req, res) => {
  try {
    const base = req.query.base || "USD";
    const response = await fetch(`https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("rates error", err);
    res.status(500).json({ error: "Failed to fetch rates" });
  }
});

// default route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
