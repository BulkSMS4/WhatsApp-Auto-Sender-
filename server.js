// server.js

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname));

// 🟢 Replace only if you are testing locally
// (otherwise keep the process.env.* if you already added variables in Render)
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "<span style='color:limegreen'>EAAbnZCZA0lZBioBPZC1Bl4LKGbmeamRE9s5NZC9BUzxfX1f4agMEZBIYvMX04Wv8C5K0ZBvkg78azsQInnIZAWAFq7SQzfSgtRIBheqXobkC73i3aYWfQH6z70Mq8uhoBjOvlzgdj1dYJf0nvqatB1UNcO8zQmNxhDor0Ptlp153BSiiZBc4j4ZBJCpbPYddnuEdT1PZBpHFDgZD</span>";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "<span style='color:limegreen'>768962646310363</span>";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "<span style='color:limegreen'>Forgetme</span>";

// Admin login
app.post("/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.status(200).json({ success: true });
  } else {
    return res.status(401).json({ success: false, message: "Wrong password" });
  }
});

// Send WhatsApp message
app.post("/send", async (req, res) => {
  const { number, message } = req.body;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: number,
          text: { body: message },
        }),
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Message sending failed" });
  }
});

// Serve the admin dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
