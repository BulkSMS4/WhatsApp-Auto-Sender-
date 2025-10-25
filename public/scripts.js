const $ = id => document.getElementById(id);

$('category').addEventListener('change', ()=>{
  if($('category').value==='Find Jobs'){
    $('productFields').style.display='none';
    $('jobFields').style.display='';
  }else{
    $('productFields').style.display='';
    $('jobFields').style.display='none';
  }
});

$('btnSave').addEventListener('click', async ()=>{
  const pass = $('adminPass').value.trim();
  if(!pass) return alert('Enter admin password');

  const fd = new FormData();
  if($('category').value==='Find Jobs'){
    fd.append('name',$('jobTitle').value);
    fd.append('desc',$('jobDesc').value);
    fd.append('price',$('jobSalary').value);
    fd.append('category','Find Jobs');
    fd.append('website',$('jobContact').value);
  }else{
    fd.append('name',$('productName').value);
    fd.append('desc',$('productDesc').value);
    fd.append('price',$('productPrice').value);
    fd.append('category',$('category').value);
    fd.append('website',$('productWebsite').value);
    fd.append('payment',$('productPayment').value);
    if($('productImage').files[0]) fd.append('image',$('productImage').files[0]);
  }
  fd.append('password',pass);

  const res = await fetch('/api/upload-product',{method:'POST',body:fd});
  const data = await res.json();
  $('saveResult').innerText = data.success ? 'Saved ✓' : 'Error saving';
  loadProducts();
});

async function loadProducts(){
  const res = await fetch('/api/products');
  const products = await res.json();
  const grid = $('productsGrid'); grid.innerHTML='';
  const selCat = $('filterCategory').value || 'All';
  (products||[]).forEach(p=>{
    if(selCat==='All'||p.category===selCat){
      const div = document.createElement('div'); div.className='prod';
      div.innerHTML = `
        <img src="${p.image||'/placeholder.png'}">
        <div><strong>${p.name}</strong></div>
        <div class="small">${p.desc||''}</div>
        <div class="label">${p.category}</div>
        <div class="actions">
          <button onclick="preview('${p.id}')">Preview</button>
        </div>
      `;
      grid.appendChild(div);
    }
  });
}

$('btnRefresh').addEventListener('click',loadProducts);
loadProducts();

window.preview = async function(id){
  const res = await fetch('/api/products');
  const p = (await res.json()).find(x=>x.id===id);
  if(!p) return;
  $('previewContent').innerHTML = `
    <h3>${p.name}</h3>
    <img src="${p.image||'/placeholder.png'}" style="width:100%;max-height:320px;object-fit:cover;border-radius:6px;">
    <p>${p.desc}</p>
    <p><strong>Price:</strong> ${p.price} USD</p>
    <p><strong>Category:</strong> ${p.category}</p>
    <p><strong>Masked:</strong> <a href="${p.maskedLink}" target="_blank">${p.maskedLink||''}</a></p>
  `;
  $('previewModal').style.display='flex';
};

$('closePreview').addEventListener('click',()=> $('previewModal').style.display='none');
