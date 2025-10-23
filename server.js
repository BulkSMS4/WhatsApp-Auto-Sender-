import express from "express";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const __dirname = path.resolve();
const productsFile = path.join(__dirname, "products.json");
const paymentsFile = path.join(__dirname, "payments.log");

const PORT = process.env.PORT || 5000;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// 🗂️ Load saved products
let products = [];
if (fs.existsSync(productsFile)) {
  products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
}

// ✅ Save product helper
function saveProducts() {
  fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
}

// 🔄 Broadcast live updates (SSE)
let clients = [];
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  clients.push(res);
  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

function broadcastUpdate(data) {
  clients.forEach((res) => res.write(`data: ${JSON.stringify(data)}\n\n`));
}

// 📦 Get all products
app.get("/api/products", (req, res) => {
  res.json(products);
});

// ➕ Add product (admin only)
app.post("/api/add-product", (req, res) => {
  const { password, name, desc, price, onlinePayment, alternatePayment } = req.body;
  if (password !== ADMIN_PASSWORD)
    return res.status(403).json({ error: "Unauthorized" });

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
  broadcastUpdate({ type: "new", product: newProduct });
  res.json({ success: true, product: newProduct });
});

// 🗑️ Delete product
app.delete("/api/delete/:id", (req, res) => {
  const { id } = req.params;
  products = products.filter((p) => p.id !== id);
  saveProducts();
  broadcastUpdate({ type: "delete", id });
  res.json({ success: true });
});

// 🏷️ Mark sold (manual by admin)
app.post("/api/mark-sold/:id", (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  product.sold = true;
  saveProducts();

  broadcastUpdate({ type: "sold", id: product.id, name: product.name });
  res.json({ success: true });
});

// 💳 Initialize Paystack payment
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
    if (!data.status) return res.status(400).json({ error: data.message });
    res.json({ authorization_url: data.data.authorization_url });
  } catch (error) {
    console.error("Paystack Error:", error);
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

// 🔔 Paystack Webhook — only logs payment, doesn’t mark sold
app.post("/webhook/paystack", (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) return res.status(400).send("Invalid signature");

  const event = req.body;
  if (event.event === "charge.success") {
    const productId = event.data.metadata?.productId;
    const product = products.find((p) => p.id === productId);

    const logEntry = `[${new Date().toISOString()}] 💳 Payment received from ${
      event.data.customer.email
    } — ₦${event.data.amount / 100} for ${product ? product.name : "Unknown Product"}\n`;
    fs.appendFileSync(paymentsFile, logEntry);

    console.log(logEntry);
  }

  res.sendStatus(200);
});

// 🧾 View payments log (admin only)
app.get("/api/payments", (req, res) => {
  const password = req.query.password;
  if (password !== ADMIN_PASSWORD)
    return res.status(403).json({ error: "Unauthorized" });

  if (!fs.existsSync(paymentsFile)) return res.json([]);
  const logs = fs.readFileSync(paymentsFile, "utf8").split("\n").filter(Boolean);
  res.json(logs);
});

// 🧩 WhatsApp message simulator
app.post("/send", (req, res) => {
  const { number, message } = req.body;
  console.log(`📤 Sending message to ${number}: ${message}`);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
