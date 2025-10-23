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

// 🌍 Load from environment
const PORT = process.env.PORT || 5000;
const TOKEN = process.env.TOKEN;
const API = process.env.API;
const ADMIN_NAME = process.env.ADMIN_NAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// 🗂️ Load saved products
let products = [];
if (fs.existsSync(productsFile)) {
  products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
}

// ✅ Save product helper
function saveProducts() {
  fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
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
  res.json({ success: true, product: newProduct });
});

// 🗑️ Delete product
app.delete("/api/delete/:id", (req, res) => {
  const { id } = req.params;
  products = products.filter((p) => p.id !== id);
  saveProducts();
  res.json({ success: true });
});

// 🏷️ Mark sold
app.post("/api/mark-sold/:id", (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  product.sold = true;
  saveProducts();
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

// 🔔 Paystack Webhook
app.post("/webhook/paystack", (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) return res.status(400).send("Invalid signature");

  const event = req.body;
  if (event.event === "charge.success") {
    const productId = event.data.metadata?.productId;
    const product = products.find(p => p.id === productId);
    if (product) {
      product.sold = true;
      saveProducts();
      console.log(`✅ ${product.name} marked as sold (payment successful)`);

      // Optional: send WhatsApp confirmation to admin
      const message = {
        messaging_product: "whatsapp",
        to: "your_admin_phone_number_here",
        type: "text",
        text: { body: `💰 Payment received for ${product.name}` },
      };

      fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      }).catch(console.error);
    }
  }

  res.sendStatus(200);
});

// 🧩 WhatsApp Auto Sender (demo endpoint)
app.post("/send", (req, res) => {
  const { number, message } = req.body;
  console.log(`Sending message to ${number}: ${message}`);
  res.json({ success: true });
});

app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT} as ${ADMIN_NAME}`)
);
