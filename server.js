<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quick Market Store</title>
<style>
body {
  font-family: "Poppins", sans-serif;
  background: #e5ddd5;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
header {
  background: #075e54;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 15px;
  position: sticky;
  top: 0;
  z-index: 999;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}
header .left {
  display: flex;
  align-items: center;
  gap: 10px;
}
header .left h1 { margin: 0; font-size: 1.4em; font-weight: bold; }
header .category-select {
  background: #fff;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  color: #075e54;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.95em;
}
header button {
  background: #fff;
  color: #075e54;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.9em;
}
#searchBox {
  margin-top: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  border: none;
  font-size: 0.9em;
}
main {
  flex: 1;
  padding: 20px;
  max-width: 1200px;
  margin: auto;
}
.category { margin-top: 30px; }
.category h2 {
  background: #25d366;
  color: white;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}
.products {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}
.product {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  overflow: hidden;
  transition: transform .2s ease;
  display: flex;
  flex-direction: column;
}
.product:hover { transform: scale(1.02); }
.product img { width: 100%; height: 180px; object-fit: cover; }
.info { padding: 12px; }
.info h3 { margin: 0; font-size: 1.1em; color: #075e54; }
.info p { color: #555; font-size: 0.9em; margin: 6px 0; }
.price { color: #25d366; font-weight: bold; font-size: 1em; }
.buy-btn, .apply-btn, .sold-btn {
  background: #25d366;
  color: white;
  border: none;
  width: 100%;
  padding: 10px;
  cursor: pointer;
  border-radius: 0 0 12px 12px;
  font-weight: bold;
  transition: 0.3s;
  margin-top: 3px;
}
.buy-btn:hover, .apply-btn:hover, .sold-btn:hover { background: #1ebe5c; }
#deliveryFormModal, #trackModal {
  display: none;
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  overflow: auto;
  z-index: 9999;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
footer {
  background: #075e54;
  color: white;
  text-align: center;
  padding: 6px 5px;
  font-size: 12px;
  line-height: 1.3;
  border-top: 3px solid #25d366;
}
footer a {
  color: #25d366;
  text-decoration: none;
  font-weight: bold;
  font-size: 12px;
}
footer a:hover { text-decoration: underline; }
.footer-social { margin-top: 4px; }
.footer-social a { display: inline-block; margin: 0 4px; font-size: 13px; }
@media (max-width: 768px) {
  header { flex-direction: column; align-items: flex-start; gap: 6px; }
  header .left h1 { font-size: 1.2em; }
  header .category-select { width: 100%; }
  #searchBox { width: 100%; }
}
</style>
</head>

<body>
<header>
  <div class="left">
    <h1>🛍️ Quick Market Store</h1>
    <select id="categorySelect" class="category-select" onchange="filterCategory()">
      <option value="All">All</option>
      <option value="Electronics">📱 Electronics</option>
      <option value="Fashion">👗 Fashion</option>
      <option value="Home">🏠 Home</option>
      <option value="Accessories">💍 Accessories</option>
      <option value="Foods">🍔 Foods</option>
      <option value="Rings">💍 Rings</option>
      <option value="Toys">🧸 Toys</option>
      <option value="Cars">🚗 Cars</option>
      <option value="Trucks">🚚 Trucks</option>
      <option value="Jobs">💼 Jobs</option>
    </select>
    <input type="text" id="searchBox" placeholder="🔍 Search products..." oninput="searchProducts()">
  </div>
  <button onclick="openTrackModal()">Track</button>
</header>

<main id="storeContainer">
  <div id="loading">Loading store products...</div>
</main>

<div id="deliveryFormModal">
  <h3>Delivery Information</h3>
  <input type="hidden" id="currentProductId">
  <input type="hidden" id="currentCategory">
  <label>Name</label>
  <input type="text" id="buyerName" placeholder="Full Name" required>
  <label>Phone Number</label>
  <input type="text" id="buyerPhone" placeholder="e.g. +233501234567" required>
  <label>Address</label>
  <textarea id="buyerAddress" placeholder="Full delivery address" required></textarea>
  <label>Delivery Type</label>
  <select id="deliveryType">
    <option>Standard</option>
    <option>Express</option>
  </select>
  <button id="submitDelivery">Submit & Get Payment Link</button>
  <button class="secondary" onclick="closeDeliveryForm()">Cancel</button>
  <p id="deliveryMsg" style="margin-top:10px; font-weight:bold;"></p>
</div>

<div id="trackModal">
  <h3>📦 Track Your Package</h3>
  <input type="text" id="trackingId" placeholder="Enter Tracking ID">
  <button onclick="checkTracking()">Check Status</button>
  <button class="secondary" onclick="closeTrackModal()">Close</button>
  <p id="trackingResult" style="margin-top:10px; font-weight:bold;"></p>
</div>

<footer>
  <p>💚 Powered by <strong>Quick Market</strong> — Your trusted WhatsApp marketplace.</p>
  <p>
    <a href="https://wa.me/233593231752" target="_blank">WhatsApp Us</a> |
    <a href="mailto:johnofosu20@gmail.com">Email Support</a>
  </p>
  <div class="footer-social">
    <a href="#">🌐 Facebook</a>
    <a href="#">📸 Instagram</a>
    <a href="#">🐦 Twitter</a>
  </div>
  <p style="margin-top:6px;opacity:0.8;">© 2025 Quick Market. All rights reserved.</p>
</footer>

<script>
let productsData=[];
async function loadStore(){
  const res=await fetch('/api/products');
  productsData=await res.json();
  renderStore(productsData);
}

function renderStore(data){
  const container=document.getElementById('storeContainer');
  container.innerHTML='';
  if(!data||data.length===0){ container.innerHTML="<p>No products found.</p>"; return; }
  const categories={};
  data.forEach(p=>{
    if(!categories[p.category]) categories[p.category]=[];
    categories[p.category].push(p);
  });
  for(const [cat,items] of Object.entries(categories)){
    const catDiv=document.createElement('div');
    catDiv.classList.add('category');
    catDiv.innerHTML=`<h2>${cat}</h2><div class="products"></div>`;
    const prodContainer=catDiv.querySelector('.products');
    for(const p of items){
      const prodDiv=document.createElement('div');
      prodDiv.classList.add('product');
      const image=p.images&&p.images.length>0?p.images[0]:'https://via.placeholder.com/400x250?text=No+Image';
      const priceText=cat==='Jobs'?`💼 Salary: $${p.price}`:`💰 Price: $${p.price}`;
      const buttonHTML=cat==='Jobs'?
        `<button class="apply-btn" onclick="openApplyForm('${p.applyForm}','${cat}')">📄 Apply Now</button>`:
        `<button class="buy-btn" onclick="openDeliveryForm('${p.id}','${cat}')">🛒 Buy Now</button>`;
      prodDiv.innerHTML = `
        <img src="${image}" alt="${p.name}">
        <div class="info">
          <h3>${p.name}</h3>
          <p>${p.description || ''}</p>
          <p class="price">${priceText}</p>
        </div>
        ${buttonHTML}
      `;
      prodContainer.appendChild(prodDiv);
    }
    container.appendChild(catDiv);
  }
}

function filterCategory() {
  const selected = document.getElementById('categorySelect').value;
  if(selected === 'All') renderStore(productsData);
  else renderStore(productsData.filter(p => p.category === selected));
}

function searchProducts() {
  const query = document.getElementById('searchBox').value.toLowerCase();
  const filtered = productsData.filter(p => p.name.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query)));
  renderStore(filtered);
}

function openDeliveryForm(id, category) {
  document.getElementById('currentProductId').value = id;
  document.getElementById('currentCategory').value = category;
  document.getElementById('deliveryFormModal').style.display = 'block';
}

function closeDeliveryForm() {
  document.getElementById('deliveryFormModal').style.display = 'none';
}

function openTrackModal() { document.getElementById('trackModal').style.display = 'block'; }
function closeTrackModal() { document.getElementById('trackModal').style.display = 'none'; }
function checkTracking() {
  const id = document.getElementById('trackingId').value;
  document.getElementById('trackingResult').textContent = id ? `Tracking info for ${id} not available.` : 'Enter a valid Tracking ID.';
}

window.onload = loadStore;
</script>

<html>
