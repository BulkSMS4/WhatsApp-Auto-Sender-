import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

// Allow JSON requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Your credentials (from Render .env or direct input)
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "EAAbnZCZA0lZBioBPZC1Bl4LKGbmeamRE9s5NZC9BUzxfX1f4agMEZBIYvMX04Wv8C5K0ZBvkg78azsQInnIZAWAFq7SQzfSgtRIBheqXobkC73i3aYWfQH6z70Mq8uhoBjOvlzgdj1dYJf0nvqatB1UNcO8zQmNxhDor0Ptlp153BSiiZBc4j4ZBJCpbPYddnuEdT1PZBpHFDgZD";
const PHONE_ID = process.env.PHONE_NUMBER_ID || "768962646310363";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";

// Serve dashboard files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));

// 🟢 Load Data (contacts & products)
function loadData() {
  try {
    const contacts = fs.existsSync("contacts.json")
      ? JSON.parse(fs.readFileSync("contacts.json"))
      : [];
    const products = fs.existsSync("products.json")
      ? JSON.parse(fs.readFileSync("products.json"))
      : [];
    return { contacts, products };
  } catch (err) {
    console.error("Error reading files:", err);
    return { contacts: [], products: [] };
  }
}

// 🟢 Save Data
function saveData(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

// 🟩 Endpoint: Add Contact
app.post("/add-contact", (req, res) => {
  const { name, number, password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).send("❌ Unauthorized: wrong password.");
  }

  const { contacts } = loadData();
  contacts.push({ name, phone: number });
  saveData("contacts.json", contacts);
  res.send("✅ Contact added successfully!");
});

// 🟩 Endpoint: Add Product
app.post("/add-product", (req, res) => {
  const { name, desc, price, link, password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).send("❌ Unauthorized: wrong password.");
  }

  const { products } = loadData();
  products.push({ name, description: desc, price, payment_link: link });
  saveData("products.json", products);
  res.send("✅ Product added successfully!");
});

// 🟩 Send Messages Automatically
async function sendProductMessages() {
  const { contacts, products } = loadData();
  if (!contacts.length || !products.length) return;

  for (const contact of contacts) {
    for (const product of products) {
      const message = {
        messaging_product: "whatsapp",
        to: contact.phone,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: `🛍️ *${product.name}*\n${product.description}\n💵 *Price:* ${product.price}`
          },
          action: {
            buttons: [
              {
                type: "url",
                url: product.payment_link,
                title: "Buy Now 💳"
              }
            ]
          }
        }
      };

      try {
        await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(message)
        });
        console.log(`✅ Sent message to ${contact.name}`);
      } catch (err) {
        console.error(`❌ Error sending to ${contact.name}:`, err.message);
      }
    }
  }
}

// Auto send every 10 minutes
setInterval(sendProductMessages, 10 * 60 * 1000);
sendProductMessages();

// 🟩 Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
