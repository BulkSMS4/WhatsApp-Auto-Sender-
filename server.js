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

const PORT = process.env.PORT || 5000;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const ADMIN_PHONE = process.env.ADMIN_PHONE;
const ADMIN_NAME = process.env.ADMIN_NAME;

// 🗂️ Load saved products
let products = [];
if (fs.existsSync(productsFile)) {
  products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
}
function saveProducts() {
  fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
}

// 🧾 Get all products
app.get("/api/products", (req, res) => res.json(products));

// ➕ Add product
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

// ✏️ Edit product
app.put("/api/edit-product/:id", (req, res) => {
  const { password, name, desc, price, onlinePayment, alternatePayment } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  Object.assign(product, { name, desc, price, onlinePayment, alternatePayment });
  saveProducts();
  res.json({ success: true });
});

// 🗑️ Delete product
app.delete("/api/delete/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  products = products.filter(p => p.id !== req.params.id);
  saveProducts();
  res.json({ success: true });
});

// 🏷️ Mark as sold
app.post("/api/mark-sold/:id", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  product.sold = true;
  saveProducts();
  res.json({ success: true });
});

// 💳 Initialize Paystack
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
      if (product) {
        product.sold = true;
        saveProducts();
        console.log(`✅ ${product.name} marked as sold.`);

        const buyerPhone = tx.metadata?.phone || tx.customer.phone;
        const buyerName = tx.metadata?.name || tx.customer.first_name;
        const buyerAddress = tx.metadata?.address || "No address provided";

        // 💬 Send WhatsApp message to buyer
        if (buyerPhone) {
          const msg = {
            messaging_product: "whatsapp",
            to: buyerPhone.replace(/\D/g, ""),
            type: "text",
            text: {
              body: `✅ *Payment Received!*\n\nHi ${buyerName || "Customer"},\nWe’ve received your payment for *${product.name}*.\n\nDelivery Address: ${buyerAddress}\n\nThank you for shopping with us! 💚`,
            },
          };
          await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(msg),
          });
          console.log("📩 Buyer notified via WhatsApp.");
        }

        // 💬 Notify admin
        if (ADMIN_PHONE) {
          const adminMsg = {
            messaging_product: "whatsapp",
            to: ADMIN_PHONE,
            type: "text",
            text: {
              body: `💰 *New Order Received!*\nProduct: ${product.name}\nAmount: ${tx.currency} ${tx.amount / 100}\nCustomer: ${tx.customer.email}\nPhone: ${buyerPhone}\nAddress: ${buyerAddress}`,
            },
          };
          await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(adminMsg),
          });
          console.log("📢 Admin notified via WhatsApp.");
        }
      }
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).send("error");
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
