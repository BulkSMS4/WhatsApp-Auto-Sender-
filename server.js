/**
 * Updated server.js — adds WhatsApp image+caption send and a simple WhatsApp "BUY" flow
 * Replace your existing server.js with this (or merge changes).
 *
 * Note: this file is based on the server.js you provided — I preserved all existing logic,
 * and added functions + webhook session handling for BUY flows and sending image messages.
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- ENV ----------
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT || '';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const WHATSAPP_GROUP_IDS = (process.env.WHATSAPP_GROUP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const AUTO_MESSAGES = (process.env.AUTO_MESSAGES || 'false').toLowerCase() === 'true';
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || '';

// ---------- Firestore init ----------
try {
  if (process.env.FIREBASE_ADMIN_JSON) {
    const cred = JSON.parse(process.env.FIREBASE_ADMIN_JSON);
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    admin.initializeApp();
  } else {
    console.error('Firebase admin credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_ADMIN_JSON.');
    process.exit(1);
  }
} catch (e) {
  console.error('Firebase init error', e);
  process.exit(1);
}
const db = admin.firestore();

// ---------- local backup folder ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const MESSAGES_LOCAL = path.join(DATA_DIR, 'messages.json');
if (!fs.existsSync(MESSAGES_LOCAL)) fs.writeFileSync(MESSAGES_LOCAL, '[]', 'utf8');

// ---------- helper functions ----------
function genId() {
  return Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}
function nowISO() {
  return new Date().toISOString();
}
function cleanPhone(n) {
  return ('' + (n || '')).replace(/\D/g, '');
}
async function appendLocalMessage(msg) {
  try {
    const arr = JSON.parse(fs.readFileSync(MESSAGES_LOCAL, 'utf8') || '[]');
    arr.unshift(msg);
    if (arr.length > 3000) arr.length = 3000;
    fs.writeFileSync(MESSAGES_LOCAL, JSON.stringify(arr, null, 2), 'utf8');
  } catch (e) {
    console.warn('appendLocalMessage failed', e.message);
  }
}

// ---------- uploads ----------
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { files: 20 } });
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- mailer ----------
let mailer = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_PORT) {
  try {
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    console.log('✅ Mailer configured');
  } catch (e) {
    console.warn('Mailer setup failed', e.message);
  }
} else {
  console.log('⚠️ Mailer not configured (SMTP env missing)');
}

// ---------- WhatsApp send helper (Cloud API) ----------
async function sendWhatsAppText(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) throw new Error('WhatsApp credentials missing');
  const toClean = cleanPhone(to);
  const payload = {
    messaging_product: "whatsapp",
    to: toClean,
    type: "text",
    text: { body: text }
  };
  const url = `https://graph.facebook.com/v16.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  try { await db.collection('outbound_messages').add({ to: toClean, text, raw: data, createdAt: nowISO() }); } catch (e) {}
  await appendLocalMessage({ to: toClean, text, raw: data, createdAt: nowISO() });
  return data;
}

// New: send image with caption (uses remote image link)
async function sendWhatsAppImageWithCaption(to, imageLink, caption) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) throw new Error('WhatsApp credentials missing');
  const toClean = cleanPhone(to);
  const payload = {
    messaging_product: "whatsapp",
    to: toClean,
    type: "image",
    image: { link: imageLink, caption: caption }
  };
  const url = `https://graph.facebook.com/v16.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  try { await db.collection('outbound_messages').add({ to: toClean, image: imageLink, caption, raw: data, createdAt: nowISO() }); } catch (e) {}
  await appendLocalMessage({ to: toClean, image: imageLink, caption, raw: data, createdAt: nowISO() });
  return data;
}

// ---------- Telegram send helper ----------
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return null;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    return await res.json();
  } catch (e) {
    console.warn('sendTelegram failed', e.message);
    return null;
  }
}

// ---------- Email helper ----------
async function sendEmail(to, subject, html) {
  if (!mailer) { console.warn('mailer not available'); return; }
  try {
    await mailer.sendMail({ from: `"${ADMIN_NAME}" <${SMTP_USER}>`, to, subject, html });
  } catch (e) {
    console.warn('sendEmail failed', e.message);
  }
}

// ---------- Firestore collection refs ----------
const productsCol = () => db.collection('products');
const visitsCol = () => db.collection('visits');
const ordersCol = () => db.collection('orders');
const subsCol = () => db.collection('subscribers');
const sessionsCol = () => db.collection('sessions'); // for in-WhatsApp buy sessions

// ---------- Category header label helper ----------
function categoryHeader(category) {
  if (!category) return 'Product Alert';
  const c = category.toLowerCase();
  if (c.includes('job') || c === 'jobs') return 'Job Alert';
  if (c.includes('food') || c === 'foods') return 'Food Alert';
  if (c.includes('car') || c.includes('truck')) return 'Auto Alert';
  if (c.includes('toy') || c === 'toys') return 'Toy Alert';
  return 'Product Alert';
}

// ---------- API: add product (admin) ----------
/**
 * POST /api/addProduct
 * multipart/form-data:
 *  - password (admin)
 *  - category, title, desc, price, siteLink, paymentLink
 *  - images[] (up to 20)
 *  - autoSend (optional: 'true' to trigger sending to subscribers and bulk)
 *  - bulkNumbers (optional string - comma/newline separated)
 */
app.post('/api/addProduct', upload.array('images', 20), async (req, res) => {
  try {
    const fields = req.body || {};
    const pass = fields.password || fields.pass;
    if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });

    const category = fields.category || 'Other';
    const title = fields.title || fields.name || '';
    const desc = fields.desc || fields.description || '';
    const price = fields.price || '0';
    const siteLink = fields.siteLink || fields.website || fields.site || '';
    const paymentLink = fields.paymentLink || fields._paymentLink || fields.payment || '';
    const autoSend = (fields.autoSend || 'true').toLowerCase() === 'true'; // default true
    const bulkNumbersRaw = fields.bulkNumbers || '';

    // images
    const files = req.files || [];
    const imgUrls = files.map(f => `${req.protocol}://${req.get('host')}/uploads/${f.filename}`);
    const firstImage = imgUrls.length ? imgUrls[0] : '';

    // product doc
    const id = genId();
    const doc = {
      id,
      category,
      title,
      desc,
      price: String(price),
      images: imgUrls,
      image: firstImage,
      siteLink,
      _paymentLink: paymentLink,
      paymentLinkHidden: !!paymentLink,
      createdAt: nowISO(),
      visits: 0,
      sold: false
    };

    await productsCol().doc(id).set(doc);

    // public link opens stores.html product view (customer opens store page)
    const storeProductUrl = `${req.protocol}://${req.get('host')}/stores.html?product=${encodeURIComponent(id)}`;

    // If autoSend is true, send notifications immediately
    let sendResults = [];
    if (autoSend) {
      // caption building with required format
      const header = categoryHeader(category);
      const caption = `🛍 ${header}!\n📦 Category: ${category}\n\n📝 ${title}\n\n${desc}\n\n💰 Price: $${price}\n\n🛒 Reply with: BUY ${id} — to purchase inside WhatsApp\n🔗 Checkout (open in store): ${storeProductUrl}`;

      // Send to subscribers (firestore)
      try {
        const subsSnap = await subsCol().get();
        const subs = [];
        subsSnap.forEach(d => subs.push(d.data().phone || d.data().number || d.id));
        for (const s of subs) {
          try {
            if (firstImage) {
              const r = await sendWhatsAppImageWithCaption(s, firstImage, caption);
              sendResults.push({ to: s, ok: true, raw: r });
            } else {
              const r = await sendWhatsAppText(s, caption);
              sendResults.push({ to: s, ok: true, raw: r });
            }
            // throttle small delay
            await new Promise(r => setTimeout(r, 250));
          } catch (e) {
            sendResults.push({ to: s, ok: false, error: e.message });
          }
        }
      } catch (e) {
        console.warn('subs send failed', e.message);
      }

      // send to bulk numbers provided in the request
      const bulkNums = (bulkNumbersRaw || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
      for (const n of bulkNums) {
        try {
          if (firstImage) {
            const r = await sendWhatsAppImageWithCaption(n, firstImage, caption);
            sendResults.push({ to: n, ok: true, raw: r });
          } else {
            const r = await sendWhatsAppText(n, caption);
            sendResults.push({ to: n, ok: true, raw: r });
          }
          await new Promise(r => setTimeout(r, 250));
        } catch (e) {
          sendResults.push({ to: n, ok: false, error: e.message });
        }
      }

      // send to admin phone
      if (ADMIN_PHONE) {
        try {
          await sendWhatsAppText(ADMIN_PHONE, `✅ Product posted: ${title}\n${storeProductUrl}`);
        } catch (e) { console.warn('admin whatsapp notify failed', e.message); }
      }

      // Telegram notify
      try {
        await sendTelegram(`<b>New ${category}</b>\n${title}\nPrice: ${price}\n${desc}\n${storeProductUrl}`);
      } catch (e) { console.warn('telegram notify failed', e.message); }

      // Email notify
      try {
        if (ADMIN_EMAIL) {
          await sendEmail(ADMIN_EMAIL, `New ${category}: ${title}`, `<p><b>${title}</b></p><p>${desc}</p><p>Price: ${price}</p><p><a href="${storeProductUrl}">Open product</a></p>`);
        }
      } catch (e) { console.warn('email notify failed', e.message); }
    }

    // return product meta
    res.json({ success: true, id, storeProductUrl, sendResults });

  } catch (err) {
    console.error('addProduct error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- public product fetch ----------
app.get('/api/products', async (req, res) => {
  try {
    const category = req.query.category;
    let q = productsCol().orderBy('createdAt', 'desc');
    if (category && category !== 'All') q = q.where('category', '==', category);
    const snap = await q.get();
    const out = [];
    snap.forEach(d => {
      const data = d.data();
      const safe = Object.assign({}, data);
      delete safe._paymentLink;
      delete safe.paymentLinkHidden;
      out.push(safe);
    });
    res.json(out);
  } catch (e) {
    console.error('products fetch', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/product/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await productsCol().doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const data = doc.data();
    const safe = Object.assign({}, data);
    delete safe._paymentLink;
    delete safe.paymentLinkHidden;
    res.json(safe);
  } catch (e) {
    console.error('product get', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- public visit route ----------
app.post('/api/visit/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const docRef = productsCol().doc(id);
    await db.runTransaction(async t => {
      const doc = await t.get(docRef);
      if (!doc.exists) throw new Error('Not found');
      const now = doc.data().visits || 0;
      t.update(docRef, { visits: now + 1 });
    });
    await visitsCol().add({ productId: id, time: nowISO(), ua: req.get('User-Agent') || '', ref: req.get('Referer') || '' });
    res.json({ success: true });
  } catch (e) {
    console.error('visit error', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Order endpoint ----------
app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, address, productId, quantity } = req.body;
    if (!name || !phone || !productId) return res.status(400).json({ error: 'Missing fields' });
    const pDoc = await productsCol().doc(productId).get();
    if (!pDoc.exists) return res.status(404).json({ error: 'Product not found' });
    const product = pDoc.data();

    const orderId = genId();
    const order = {
      orderId,
      productId,
      productTitle: product.title || product.name || '',
      price: product.price || '',
      quantity: Number(quantity) || 1,
      name,
      phone: cleanPhone(phone),
      address: address || '',
      createdAt: nowISO(),
      status: 'pending'
    };

    await ordersCol().doc(orderId).set(order);

    // Notify admin via WhatsApp, Telegram, Email
    const adminMsg = `📦 New Order\nProduct: ${order.productTitle}\nBuyer: ${order.name}\nPhone: ${order.phone}\nQty: ${order.quantity}\nAddress: ${order.address}\nOrderID: ${order.orderId}`;
    try { if (ADMIN_PHONE) await sendWhatsAppText(ADMIN_PHONE, adminMsg); } catch (e) { console.warn('admin whatsapp failed', e.message); }
    try { await sendTelegram(adminMsg); } catch (e) { /* ignore */ }
    try { if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `New Order: ${order.productTitle}`, `<pre>${adminMsg}</pre>`); } catch (e) { /* ignore */ }

    res.json({ success: true, orderId });
  } catch (e) {
    console.error('order error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Send bulk (admin) ----------
app.post('/api/send-bulk', async (req, res) => {
  try {
    const { numbers, message, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });
    if (!Array.isArray(numbers) || numbers.length === 0) return res.status(400).json({ error: 'No numbers' });

    const results = [];
    for (const n of numbers) {
      try {
        const r = await sendWhatsAppText(n, message);
        results.push({ to: n, ok: true, raw: r });
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        results.push({ to: n, ok: false, error: e.message });
      }
    }

    // also send to Telegram & email summary
    try {
      await sendTelegram(`<b>Bulk send</b>\nSent to ${numbers.length} numbers.\nPreview: ${message.slice(0,200)}`);
    } catch (e) {}
    try {
      if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `Bulk send to ${numbers.length} numbers`, `<pre>${message}</pre>`);
    } catch (e) {}

    res.json({ success: true, results });
  } catch (e) {
    console.error('send-bulk error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Admin: get payment link (secure) ----------
app.get('/api/admin/getPaymentLink/:id', async (req, res) => {
  try {
    const pass = req.query.password;
    if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });
    const id = req.params.id;
    const doc = await productsCol().doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const data = doc.data();
    return res.json({ success: true, paymentLink: data._paymentLink || '' });
  } catch (e) {
    console.error('getPaymentLink', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Admin: list products & orders ----------
app.get('/api/admin/products', async (req, res) => {
  try {
    const pass = req.query.password;
    if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });
    const snap = await productsCol().orderBy('createdAt', 'desc').get();
    const items = [];
    snap.forEach(d => items.push(d.data()));
    res.json({ success: true, products: items });
  } catch (e) {
    console.error('admin products', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/orders', async (req, res) => {
  try {
    const pass = req.query.password;
    if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });
    const snap = await ordersCol().orderBy('createdAt', 'desc').limit(500).get();
    const items = [];
    snap.forEach(d => items.push(d.data()));
    res.json({ success: true, orders: items });
  } catch (e) {
    console.error('admin orders', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Subscribe endpoint (public) ----------
app.post('/api/subscribe', async (req, res) => {
  try {
    const phoneRaw = req.body.phone || req.body.number || '';
    if (!phoneRaw) return res.status(400).json({ error: 'Missing phone' });
    const phone = cleanPhone(phoneRaw);
    const snap = await subsCol().where('phone', '==', phone).limit(1).get();
    if (snap.empty) {
      await subsCol().add({ phone, createdAt: nowISO() });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('subscribe', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Webhook verification & storage ----------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token) {
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  res.sendStatus(200);
});

/**
 * Webhook POST handler:
 * - Saves incoming webhook to 'webhook_events'
 * - Stores inbound messages in 'inbound_messages'
 * - Parses simple 'BUY <productId>' commands and manages a sessions flow:
 *    stages: awaiting_name -> awaiting_address -> awaiting_quantity -> confirmed
 */
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    await db.collection('webhook_events').add({ body, receivedAt: nowISO() });

    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (!entry.changes) continue;
        for (const ch of entry.changes) {
          const value = ch.value || {};
          // statuses (delivery receipts)
          if (value.statuses) {
            const statuses = value.statuses;
            const mlog = db.collection('outbound_messages');
            for (const s of statuses) {
              await mlog.add({ type: 'status', id: s.id || s.message_id, status: s.status, raw: s, timestamp: s.timestamp || nowISO() });
            }
          }

          // inbound messages
          if (value.messages) {
            const incoming = value.messages;
            const mlog = db.collection('inbound_messages');
            for (const m of incoming) {
              const from = m.from; // sender phone
              const text = m.text?.body || '';
              await mlog.add({ type: 'inbound', id: m.id, from, text, raw: m, createdAt: nowISO() });

              // Handle simple BUY flow
              try {
                await handleInboundMessage(from, text);
              } catch (e) {
                console.warn('handleInboundMessage failed', e.message);
              }
            }
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('webhook post error', e);
    res.sendStatus(500);
  }
});

// ---------- Inbound message session handler ----------
/**
 * handleInboundMessage(from, text)
 * - If text = "BUY <id>" => create session and ask for buyer name
 * - If session exists, progress through stages: name -> address -> quantity -> confirm -> order created
 */
async function handleInboundMessage(from, text) {
  const phone = cleanPhone(from || '');
  if (!phone) return;

  const lower = (text || '').trim();
  // check for initial BUY command
  const buyMatch = lower.match(/^buy\s+([A-Za-z0-9\-_]+)/i);
  const sessionQuery = await sessionsCol().where('phone', '==', phone).limit(1).get();
  let sessionDoc = null;
  if (!sessionQuery.empty) {
    sessionDoc = sessionQuery.docs[0];
  }

  if (buyMatch) {
    // start new session
    const productId = buyMatch[1];
    const pDoc = await productsCol().doc(productId).get();
    if (!pDoc.exists) {
      await sendWhatsAppText(phone, `⚠️ Product not found for ID: ${productId}. Please check the product id.`);
      return;
    }
    const product = pDoc.data();
    // create session
    const sid = genId();
    await sessionsCol().doc(sid).set({
      sid,
      phone,
      productId,
      stage: 'awaiting_name',
      createdAt: nowISO(),
      updatedAt: nowISO()
    });
    await sendWhatsAppText(phone, `🛒 You selected: ${product.title}\nPlease reply with your *full name* to continue.`);
    return;
  }

  // If there's an active session for this phone, progress it
  if (sessionDoc) {
    const s = sessionDoc.data();
    const sid = sessionDoc.id;
    const stage = s.stage || 'awaiting_name';

    if (stage === 'awaiting_name') {
      const name = text.trim();
      if (!name) {
        await sendWhatsAppText(phone, 'Please reply with your full name.');
        return;
      }
      await sessionsCol().doc(sid).update({ name, stage: 'awaiting_address', updatedAt: nowISO() });
      await sendWhatsAppText(phone, 'Got it. Please reply with your *delivery address* (full address).');
      return;
    }

    if (stage === 'awaiting_address') {
      const address = text.trim();
      if (!address) {
        await sendWhatsAppText(phone, 'Please reply with your delivery address.');
        return;
      }
      await sessionsCol().doc(sid).update({ address, stage: 'awaiting_quantity', updatedAt: nowISO() });
      await sendWhatsAppText(phone, 'Thanks. How many units would you like to buy? Reply with a number (e.g., 1).');
      return;
    }

    if (stage === 'awaiting_quantity') {
      const qty = parseInt(text.trim(), 10);
      if (!qty || qty <= 0) {
        await sendWhatsAppText(phone, 'Please reply with a valid quantity (a number).');
        return;
      }
      await sessionsCol().doc(sid).update({ quantity: qty, stage: 'awaiting_confirm', updatedAt: nowISO() });
      // fetch product to compute price
      const productDoc = await productsCol().doc(s.productId).get();
      const product = productDoc.exists ? productDoc.data() : { title: '', price: '0' };
      const total = (parseFloat(product.price || '0') * qty).toFixed(2);
      await sendWhatsAppText(phone, `Confirm order:\nProduct: ${product.title}\nQuantity: ${qty}\nTotal: $${total}\nReply YES to confirm or NO to cancel.`);
      return;
    }

    if (stage === 'awaiting_confirm') {
      const ok = /^y(es)?$/i.test(text.trim());
      if (!ok) {
        await sessionsCol().doc(sid).delete();
        await sendWhatsAppText(phone, 'Order cancelled. Reply BUY <productId> to start again.');
        return;
      }
      // finalize order
      const sessData = (await sessionsCol().doc(sid).get()).data();
      const productDoc = await productsCol().doc(sessData.productId).get();
      const product = productDoc.exists ? productDoc.data() : null;
      if (!product) {
        await sessionsCol().doc(sid).delete();
        await sendWhatsAppText(phone, 'Product not found, order cancelled.');
        return;
      }

      const orderId = genId();
      const order = {
        orderId,
        productId: sessData.productId,
        productTitle: product.title || '',
        price: product.price || '',
        quantity: Number(sessData.quantity) || 1,
        name: sessData.name || '',
        phone,
        address: sessData.address || '',
        createdAt: nowISO(),
        status: 'pending',
        via: 'whatsapp'
      };
      await ordersCol().doc(orderId).set(order);
      // delete session
      await sessionsCol().doc(sid).delete();

      // notify admin
      const adminMsg = `📦 New Order (WhatsApp)\nProduct: ${order.productTitle}\nBuyer: ${order.name}\nPhone: ${order.phone}\nQty: ${order.quantity}\nAddress: ${order.address}\nOrderID: ${order.orderId}`;
      try { if (ADMIN_PHONE) await sendWhatsAppText(ADMIN_PHONE, adminMsg); } catch (e) { console.warn('admin whatsapp failed', e.message); }
      try { await sendTelegram(adminMsg); } catch (e) {}
      try { if (ADMIN_EMAIL) await sendEmail(ADMIN_EMAIL, `New Whatsapp Order: ${order.productTitle}`, `<pre>${adminMsg}</pre>`); } catch (e) {}

      // get payment link (if set)
      let paymentLink = product._paymentLink || product.paymentLink || '';
      // if no direct payment link, construct link to product page where checkout exists
      if (!paymentLink) {
        paymentLink = `${reqProtocolHostPlaceholder()}/stores.html?product=${encodeURIComponent(product.id)}`;
      }

      // message customer with order confirmation and payment link
      await sendWhatsAppText(phone, `✅ Order received! OrderID: ${orderId}\nPay here: ${paymentLink}\nWe will contact you when payment is confirmed.`);

      // return
      return;
    }
  }

  // no session & no BUY — ignore or respond with helper message
  // Optionally: reply with help text suggesting how to buy
  // (commented out to avoid auto replies to all messages)
  // await sendWhatsAppText(phone, 'Reply BUY <productId> to start purchase. Example: BUY abc123');
}

// Helper: placeholder for building product page link if req not available in this context
function reqProtocolHostPlaceholder() {
  // Replace with your base URL if you want (or dynamically provide in flows that have req)
  // I'll use an environment fallback or localhost
  const host = process.env.BASE_URL || `https://your-domain.com`;
  return host;
}

// ---------- Health & root ----------
app.get('/api/health', (req, res) => res.json({ ok: true, time: nowISO() }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// serve stores.html if exists
app.get('/stores.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stores.html'));
});

// ---------- Start server ----------
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
