// server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// Load environment variables
const token = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.PHONE_NUMBER_ID;

// Your saved contacts (replace with real numbers or load from a JSON file)
let contacts = [
  { name: "John", number: "233593231752" },
  { name: "Mary", number: "233541234567" },
];

// Example product message
let messageText = "🚀 Hello! Check out our new products at amazing prices!";

// ✅ Function to send a WhatsApp message
async function sendWhatsAppMessage(number, message) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: number,
          type: "text",
          text: { body: message }
        })
      }
    );

    const data = await response.json();
    console.log(`✅ Message sent to ${number}:`, data);
  } catch (err) {
    console.error(`❌ Error sending to ${number}:`, err);
  }
}

// 🕒 Auto-send message every 5 minutes
setInterval(() => {
  console.log("⏰ Sending scheduled messages...");
  contacts.forEach(c => {
    sendWhatsAppMessage(c.number, messageText);
  });
}, 300000); // 300000 = 5 minutes

// 🧩 Optional: send instantly by visiting a route
app.post("/send", async (req, res) => {
  const { message } = req.body;
  for (const c of contacts) {
    await sendWhatsAppMessage(c.number, message);
  }
  res.json({ success: true, message: "Messages sent!" });
});

app.get("/", (req, res) => res.send("✅ WhatsApp Auto Sender is running"));
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
