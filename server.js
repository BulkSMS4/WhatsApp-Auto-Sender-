import fetch from "node-fetch";
import fs from "fs";

// ✅ Secure: Load your token, phone ID, and admin password from Render .env
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "EAAbnZCZA0lZBioBPZC1Bl4LKGbmeamRE9s5NZC9BUzxfX1f4agMEZBIYvMX04Wv8C5K0ZBvkg78azsQInnIZAWAFq7SQzfSgtRIBheqXobkC73i3aYWfQH6z70Mq8uhoBjOvlzgdj1dYJf0nvqatB1UNcO8zQmNxhDor0Ptlp153BSiiZBc4j4ZBJCpbPYddnuEdT1PZBpHFDgZD";
const PHONE_ID = process.env.PHONE_NUMBER_ID || "768962646310363";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Forgetme";

// 🗂️ Load contact and product data from JSON files
function loadData() {
  try {
    const contacts = JSON.parse(fs.readFileSync("contacts.json"));
    const products = JSON.parse(fs.readFileSync("products.json"));
    return { contacts, products };
  } catch (error) {
    console.error("Error loading data:", error);
    return { contacts: [], products: [] };
  }
}

// 🚀 Send interactive WhatsApp messages for all products to all contacts
async function sendProductMessages() {
  const { contacts, products } = loadData();

  if (contacts.length === 0 || products.length === 0) {
    console.log("⚠️ No contacts or products found. Skipping this cycle.");
    return;
  }

  console.log(`📤 Sending product messages to ${contacts.length} contacts...`);

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
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(message)
          }
        );

        const result = await response.json();
        console.log(`✅ Sent to ${contact.name} (${contact.phone})`);
      } catch (err) {
        console.error(`❌ Failed to send to ${contact.name}:`, err.message);
      }
    }
  }
}

// 🕒 Automatically run every 10 minutes
setInterval(sendProductMessages, 10 * 60 * 1000);

// ▶️ Run immediately on start
sendProductMessages();
