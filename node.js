import fetch from "node-fetch";
import fs from "fs";

const ACCESS_TOKEN = "YOUR_WHATSAPP_ACCESS_TOKEN";
const PHONE_ID = "YOUR_PHONE_NUMBER_ID";

function loadData() {
  const contacts = JSON.parse(fs.readFileSync("contacts.json"));
  const products = JSON.parse(fs.readFileSync("products.json"));
  return { contacts, products };
}

async function sendProductMessages() {
  const { contacts, products } = loadData();

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
      console.log(`Sent to ${contact.name}:`, result);
    }
  }
}

// Run every 10 minutes
setInterval(sendProductMessages, 10 * 60 * 1000);
sendProductMessages();
