// --- ฐานข้อมูล V11 CRM & Admin (Discount % + Penalty) ---
const DB_PREFIX = 'pos_v11_';
const DB_TABLES = DB_PREFIX + 'tables';
const DB_ORDERS = DB_PREFIX + 'orders';
const DB_SETTINGS = DB_PREFIX + 'settings';
const DB_MENU = DB_PREFIX + 'menu';
const DB_CAT = DB_PREFIX + 'cat';
const DB_TABLE_LIST = DB_PREFIX + 'table_list';
const DB_CUSTOMERS = DB_PREFIX + 'customers';

const defaultCategories = ['เบียร์', 'เหล้า', 'มิกเซอร์', 'อาหาร', 'ทานเล่น'];
const defaultMenu = [
    { id: 'm1', name: 'เบียร์ช้าง', category: 'เบียร์', price: 90, image: '' },
    { id: 'm2', name: 'เบียร์ลีโอ', category: 'เบียร์', price: 95, image: '' },
    { id: 'm4', name: 'หงส์ทอง', category: 'เหล้า', price: 350, image: '' },
    { id: 'm6', name: 'โซดา', category: 'มิกเซอร์', price: 25, image: '' },
    { id: 'm9', name: 'เฟรนช์ฟรายส์', category: 'อาหาร', price: 80, image: '' }
];

let tableList = [];
let tables = {};
let categories = [];
let menuItems = [];
let orders = [];
let customers = [];
let settings = { storeName: "Tree Bar", promptpayId: "0812345678", profitMargin: 25, nextReceiptNo: 1, logo: "", pointsRatio: 0 };

let currentTableId = null;
let currentCategory = '';
let currentPosMode = 'tables';
let currentReprintOrder = null;
let salesChartInstance = null;
let filteredExportOrders = [];

let numpadTarget = ''; 
let numpadValue = '0';
let numpadContext = null; 
let draggedCatIndex = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
    try { categories = JSON.parse(localStorage.getItem(DB_CAT)) || [...defaultCategories]; } catch(e) { categories = [...defaultCategories]; }
    try { menuItems = JSON.parse(localStorage.getItem(DB_MENU)) || [...defaultMenu]; } catch(e) { menuItems = [...defaultMenu]; }
    try { tableList = JSON.parse(localStorage.getItem(DB_TABLE_LIST)) || Array.from({length: 30}, (_, i) => `T${i+1}`); } catch(e) { tableList = Array.from({length: 30}, (_, i) => `T${i+1}`); }
    try { orders = JSON.parse(localStorage.getItem(DB_ORDERS)) || []; } catch(e) { orders = []; }
    try { customers = JSON.parse(localStorage.getItem(DB_CUSTOMERS)) || []; } catch(e) { customers = []; }
    try { let s = JSON.parse(localStorage.getItem(DB_SETTINGS)); if(s) settings = { ...settings, ...s }; } catch(e) {}

    try {
        let savedTables = JSON.parse(localStorage.getItem(DB_TABLES));
        if (savedTables && typeof savedTables === 'object') {
            tables = savedTables;
            tableList.forEach(t => { 
                if(!tables[t] || !tables[t].items) tables[t] = { status: 'empty', items: [], discount: 0, customerId: null, customerName: '', penaltyAmount: 0, penaltyReason: '' }; 
            });
        } else {
            tableList.forEach(t => tables[t] = { status: 'empty', items: [], discount: 0, customerId: null, customerName: '', penaltyAmount: 0, penaltyReason: '' });
        }
    } catch(e) {
        tables = {};
        tableList.forEach(t => tables[t] = { status: 'empty', items: [], discount: 0, customerId: null, customerName: '', penaltyAmount: 0, penaltyReason: '' });
    }

    if(categories.length > 0) currentCategory = categories[0];
    saveData();

    document.getElementById('display-store-name').innerText = settings.storeName;
    document.getElementById('setting-store-name').value = settings.storeName;
    document.getElementById('setting-promptpay-id').value = settings.promptpayId;
    document.getElementById('setting-profit-margin').value = settings.profitMargin;
    document.getElementById('setting-points-ratio').value = settings.pointsRatio || 0;
    if(settings.logo) document.getElementById('setting-logo-preview').src = settings.logo;

    initSummaryDates(); 
    renderAll();
    switchPosMode('tables');
}

function saveData() {
    localStorage.setItem(DB_CAT, JSON.stringify(categories));
    localStorage.setItem(DB_MENU, JSON.stringify(menuItems));
    localStorage.setItem(DB_TABLE_LIST, JSON.stringify(tableList));
    localStorage.setItem(DB_TABLES, JSON.stringify(tables));
    localStorage.setItem(DB_ORDERS, JSON.stringify(orders));
    localStorage.setItem(DB_CUSTOMERS, JSON.stringify(customers));
    localStorage.setItem(DB_SETTINGS, JSON.stringify(settings));
}

function renderAll() {
    renderTables();
    renderPosMenu();
    renderCart();
    renderManagement();
    renderHistory();
}

function showView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    if (viewName === 'summary') updateSummary();
    if (viewName === 'history') renderHistory();
    if (viewName === 'management') renderManagement();
}

// ========== POS PANEL SWITCHER ==========
function switchPosMode(mode) {
    currentPosMode = mode;
    document.getElementById('tab-tables').classList.remove('active');
    document.getElementById('tab-menu').classList.remove('active');
    document.getElementById(`tab-${mode}`).classList.add('active');
    document.getElementById('pos-view-tables').classList.add('hidden');
    document.getElementById('pos-view-menu').classList.add('hidden');
    document.getElementById(`pos-view-${mode}`).classList.remove('hidden');

    if (mode === 'tables') renderTables();
    if (mode === 'menu') {
        if (!currentTableId) { alert('กรุณาเลือกโต๊ะก่อนสั่งอาหารครับ'); switchPosMode('tables'); return; }
        renderPosMenu();
    }
}

// ========== POS TABLES & CUSTOMER SELECT ==========
function renderTables() {
    const grid = document.getElementById('tables-grid-updated');
    if (!grid) return;
    grid.innerHTML = '';
    tableList.forEach(tId => {
        const table = tables[tId];
        const total = calculateTableTotal(tId);
        let statusClass = 'status-empty'; 
        let amountHtml = '';
        let custHtml = '';
        if (total > 0 || table.items.length > 0 || (table.penaltyAmount || 0) > 0) {
            statusClass = 'status-occupied';
            amountHtml = `<div class="table-amount">฿${total.toFixed(0)}</div>`;
        }
        if (table.customerName) { custHtml = `<div class="table-customer">👤 ${table.customerName}</div>`; }
        const isSelected = currentTableId === tId ? 'selected' : '';
        const btn = document.createElement('div');
        btn.className = `table-btn-pro ${statusClass} ${isSelected}`;
        btn.onclick = () => handleTableClick(tId);
        btn.innerHTML = `<div class="table-name">${tId.replace('T', '')}</div>${custHtml}${amountHtml}`;
        grid.appendChild(btn);
    });
}

function handleTableClick(tId) {
    const table = tables[tId];
    if (table.items.length === 0 && calculateTableTotal(tId) === 0 && !(table.penaltyAmount > 0)) { openCustomerSelectModal(tId); } 
    else { selectAndOpenTable(tId); }
}

let pendingTableId = null;
function openCustomerSelectModal(tId) {
    pendingTableId = tId;
    document.getElementById('open-table-name').innerText = tId.replace('T', '');
    const sel = document.getElementById('select-customer-dropdown');
    sel.innerHTML = '<option value="">-- ลูกค้าทั่วไป (ไม่สะสมแต้ม) --</option>';
    customers.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.name} ${c.phone ? `(${c.phone})` : ''}</option>`; });
    document.getElementById('customer-select-modal').classList.remove('hidden');
}

function closeCustomerSelectModal() { document.getElementById('customer-select-modal').classList.add('hidden'); pendingTableId = null; }
function confirmOpenTable() {
    const custId = document.getElementById('select-customer-dropdown').value;
    let cName = '';
    if (custId) { const cust = customers.find(c => c.id === custId); if (cust) cName = cust.name; }
    tables[pendingTableId].customerId = custId || null;
    tables[pendingTableId].customerName = cName;
    saveData();
    const tIdToOpen = pendingTableId;
    closeCustomerSelectModal(); selectAndOpenTable(tIdToOpen);
}

function selectAndOpenTable(tId) {
    currentTableId = tId;
    document.getElementById('current-table-label').innerText = tId.replace('T', '');
    document.getElementById('current-customer-label').innerText = tables[tId].customerName ? `👤 ${tables[tId].customerName}` : 'ลูกค้าทั่วไป';
    switchPosMode('menu'); renderCart(); renderTables(); 
}

// ========== POS MENU VIEW ==========
function renderPosMenu() {
    const catContainer = document.getElementById('modal-category-filters');
    catContainer.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `cat-btn-pro ${currentCategory === cat ? 'active' : ''}`;
        btn.onclick = () => { currentCategory = cat; renderPosMenu(); };
        btn.innerText = cat; catContainer.appendChild(btn);
    });

    const grid = document.getElementById('modal-menu-grid');
    grid.innerHTML = '';
    let defaultImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="%232b3040"><rect width="100" height="100" fill="%2b3040"/><text x="50" y="55" font-family="Arial" font-size="14" fill="%2394a3b8" text-anchor="middle">No Image</text></svg>';

    menuItems.filter(m => m.category === currentCategory).forEach(item => {
        let imgSrc = item.image ? item.image : defaultImg;
        const div = document.createElement('div');
        div.className = 'menu-item-pro';
        div.onclick = () => quickAddItem(item);
        div.innerHTML = `<div class="menu-img-wrapper"><img class="menu-img-pro" src="${imgSrc}"></div>
            <div class="menu-info-pro"><div class="menu-name-pro">${item.name}</div><div class="menu-price-pro">฿${item.price}</div></div>`;
        grid.appendChild(div);
    });
}

function quickAddItem(item) {
    if (!currentTableId) { alert('กรุณาเลือกโต๊ะทางซ้ายมือก่อนครับ'); switchPosMode('tables'); return; }
    const table = tables[currentTableId];
    const existing = table.items.find(i => i.id === item.id);
    let timeStr = new Date().toLocaleTimeString('th-TH');
    if (existing) { existing.qty += 1; if(!existing.history) existing.history = []; existing.history.push({ time: timeStr, log: `+ สั่งเพิ่ม 1 (รวมเป็น ${existing.qty})` }); } 
    else { table.items.push({ ...item, qty: 1, history: [{ time: timeStr, log: `เริ่มสั่งใหม่ (1)` }] }); }
    saveData(); renderCart(); renderTables(); 
}

// ========== CART / RECEIPT ==========
function calculateTableSubtotal(tId) {
    const table = tables[tId]; if (!table || !table.items) return 0;
    return table.items.reduce((s, i) => s + (i.price * i.qty), 0);
}
// คำนวณยอดสุทธิรวม = (ค่าอาหาร - ส่วนลด) + ค่าปรับ
function calculateTableTotal(tId) {
    const table = tables[tId]; if (!table) return 0;
    const sub = calculateTableSubtotal(tId); 
    const netFood = Math.max(0, sub - (table.discount || 0));
    return netFood + (table.penaltyAmount || 0);
}

function renderCart() {
    const tableBody = document.getElementById('cart-table-body');
    if(!tableBody) return; tableBody.innerHTML = '';
    if (!currentTableId) { 
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-muted);">เลือกโต๊ะเพื่อเริ่มรับออเดอร์</td></tr>';
        document.getElementById('cart-subtotal').innerText = '0.00'; document.getElementById('cart-total').innerText = '0.00'; document.getElementById('discount-display').innerText = '0.00'; 
        document.getElementById('cart-penalty-row').classList.add('hidden');
        return; 
    }

    const table = tables[currentTableId];
    document.getElementById('discount-display').innerText = (table.discount || 0).toFixed(2);
    
    const penRow = document.getElementById('cart-penalty-row');
    if (table.penaltyAmount > 0) {
        penRow.classList.remove('hidden');
        document.getElementById('penalty-display').innerText = table.penaltyAmount.toFixed(2);
        document.getElementById('penalty-reason-display').innerText = table.penaltyReason || 'ค่าปรับ';
    } else {
        penRow.classList.add('hidden');
    }

    if (table.items.length === 0) { tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-muted);">โต๊ะนี้ยังไม่มีรายการ<br>เลือกเมนูทางขวาเพื่อสั่งอาหาร</td></tr>'; }

    (table.items || []).forEach((item, idx) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><div style="font-weight:500; color:#fff;">${item.name}</div><div style="font-size:12px; color:var(--text-muted);">@${item.price.toFixed(2)}</div></td>
            <td style="text-align:center;"><button class="cart-qty-btn" onclick="openNumpad('edit_qty', ${idx}, '${item.name}', ${item.qty})">${item.qty}</button></td>
            <td style="text-align:right; font-weight:600; color:#fff;">${(item.price * item.qty).toFixed(2)}</td>
            <td style="text-align:center;"><button class="cart-del-btn" onclick="removeItem(${idx})">✖</button></td>`;
        tableBody.appendChild(row);
    });
    
    document.getElementById('cart-subtotal').innerText = calculateTableSubtotal(currentTableId).toFixed(2);
    document.getElementById('cart-total').innerText = calculateTableTotal(currentTableId).toFixed(2);
}

function removeItem(idx) { if(!confirm('ลบรายการนี้?')) return; tables[currentTableId].items.splice(idx, 1); saveData(); renderCart(); renderTables(); }

function closeTable() {
    if (!currentTableId) return;
    if (confirm('เคลียร์โต๊ะนี้ โดยไม่คิดเงิน ใช่หรือไม่?')) {
        tables[currentTableId].items = []; tables[currentTableId].discount = 0; tables[currentTableId].customerId = null; tables[currentTableId].customerName = '';
        tables[currentTableId].penaltyAmount = 0; tables[currentTableId].penaltyReason = '';
        currentTableId = null; document.getElementById('current-table-label').innerText = 'ยังไม่เลือก'; document.getElementById('current-customer-label').innerText = 'ลูกค้าทั่วไป';
        saveData(); switchPosMode('tables'); renderAll();
    }
}

// ========== NUMPAD & DISCOUNT SYSTEM ==========
function openNumpad(target, arg1 = null, arg2 = null, arg3 = null) {
    numpadTarget = target; numpadContext = { c1: arg1, c2: arg2, c3: arg3 }; numpadValue = '';
    document.getElementById('numpad-footer-standard').classList.add('hidden'); 
    document.getElementById('numpad-footer-qty').classList.add('hidden');
    document.getElementById('numpad-footer-discount').classList.add('hidden');

    let title = "ระบุตัวเลข";
    if (target === 'edit_qty') { 
        title = `แก้ไขจำนวน: ${arg2} (ปัจจุบัน ${arg3})`; numpadValue = ''; 
        document.getElementById('numpad-footer-qty').classList.remove('hidden'); 
    }
    else if (target === 'discount') { 
        if (!currentTableId) return alert('กรุณาเลือกโต๊ะก่อน'); 
        title = "ใส่ส่วนลด (กดเลือก % หรือ บาท)"; 
        numpadValue = ''; 
        document.getElementById('numpad-footer-discount').classList.remove('hidden');
    }
    else if (target === 'cash') { 
        title = "รับเงินสดมา (บาท)"; numpadValue = ''; 
        document.getElementById('numpad-footer-standard').classList.remove('hidden');
    }
    else if (target === 'promptpay') { 
        title = "แก้ไขยอดโอน (บาท)"; numpadValue = document.getElementById('promptpay-override-display').innerText; 
        document.getElementById('numpad-footer-standard').classList.remove('hidden');
    }

    updateNumpadDisplay(); document.getElementById('numpad-title').innerText = title; document.getElementById('numpad-modal').classList.remove('hidden');
}

function updateNumpadDisplay() { document.getElementById('numpad-display').innerText = numpadValue === '' ? '0' : numpadValue; }
function numPress(num) { if (numpadValue === '0' && num !== '.') numpadValue = num; else numpadValue += num; updateNumpadDisplay(); }
function numClear() { numpadValue = '0'; updateNumpadDisplay(); }
function numDel() { if (numpadValue.length > 1) numpadValue = numpadValue.slice(0, -1); else numpadValue = '0'; updateNumpadDisplay(); }
function closeNumpad() { document.getElementById('numpad-modal').classList.add('hidden'); }

// ปุ่มลดเป็น % หรือ บาท
function applyDiscount(type) {
    let val = parseFloat(numpadValue) || 0;
    let sub = calculateTableSubtotal(currentTableId);
    let disc = 0;
    if (type === 'percent') {
        if(val < 0 || val > 100) return alert('เปอร์เซ็นต์ส่วนลดต้องอยู่ระหว่าง 0-100');
        disc = sub * (val / 100);
    } else {
        disc = val;
    }
    tables[currentTableId].discount = disc; 
    saveData(); renderCart(); renderTables(); closeNumpad();
}

function numConfirm() {
    let val = parseFloat(numpadValue) || 0;
    if (numpadTarget === 'cash') { document.getElementById('cash-received-display').innerText = val; calculateChange(); }
    else if (numpadTarget === 'promptpay') { document.getElementById('promptpay-override-display').innerText = val; updatePromptPay(); }
    closeNumpad();
}

function applyQtyAction(action) {
    let inputVal = parseFloat(numpadValue) || 0; let idx = numpadContext.c1; let item = tables[currentTableId].items[idx];
    if (!item.history) item.history = [];
    let oldQty = item.qty; let newQty = oldQty; let timeStr = new Date().toLocaleTimeString('th-TH');

    if (action === 'add') { if(inputVal <= 0) return alert('ระบุจำนวนที่จะเพิ่ม'); newQty += inputVal; item.history.push({ time: timeStr, log: `+ เพิ่ม ${inputVal} (เดิม ${oldQty} -> เป็น ${newQty})` }); }
    else if (action === 'sub') { if(inputVal <= 0) return alert('ระบุจำนวนที่จะลด'); newQty -= inputVal; if(newQty < 0) newQty = 0; item.history.push({ time: timeStr, log: `- ลด ${inputVal} (เดิม ${oldQty} -> เหลือ ${newQty})` }); }
    else if (action === 'set') { newQty = inputVal; item.history.push({ time: timeStr, log: `= กำหนดใหม่เป็น ${newQty} (เดิม ${oldQty})` }); }
    
    item.qty = newQty; if(item.qty <= 0) tables[currentTableId].items.splice(idx, 1);
    saveData(); renderCart(); renderTables(); closeNumpad();
}

// ========== PENALTY SYSTEM ==========
function openPenaltyModal() {
    if (!currentTableId) return alert('กรุณาเลือกโต๊ะก่อน');
    document.getElementById('penalty-reason-input').value = tables[currentTableId].penaltyReason || '';
    document.getElementById('penalty-amount-input').value = tables[currentTableId].penaltyAmount || '';
    document.getElementById('penalty-modal').classList.remove('hidden');
}
function closePenaltyModal() { document.getElementById('penalty-modal').classList.add('hidden'); }
function savePenalty() {
    let reason = document.getElementById('penalty-reason-input').value.trim();
    let amount = parseFloat(document.getElementById('penalty-amount-input').value) || 0;
    if (amount > 0 && !reason) return alert('กรุณาระบุเหตุผลค่าปรับด้วยครับ');
    tables[currentTableId].penaltyReason = reason;
    tables[currentTableId].penaltyAmount = amount;
    saveData(); renderCart(); renderTables(); closePenaltyModal();
}
function removePenalty() {
    tables[currentTableId].penaltyReason = '';
    tables[currentTableId].penaltyAmount = 0;
    saveData(); renderCart(); renderTables(); closePenaltyModal();
}


// ========== MOVE TABLE ==========
function openMoveTableModal() {
    if (!currentTableId) return alert('กรุณาเลือกโต๊ะก่อน');
    if (tables[currentTableId].items.length === 0 && tables[currentTableId].penaltyAmount === 0) return alert('โต๊ะนี้ไม่มีรายการให้ย้าย');
    document.getElementById('move-from-label').innerText = currentTableId.replace('T','');
    const sel = document.getElementById('move-to-select'); sel.innerHTML = '';
    tableList.forEach(t => {
        if (t !== currentTableId) {
            let status = tables[t].items.length === 0 ? '(ว่าง)' : '(รวมบิล)';
            sel.innerHTML += `<option value="${t}">${t.replace('T','')} ${status}</option>`;
        }
    });
    document.getElementById('move-table-modal').classList.remove('hidden');
}
function closeMoveTableModal() { document.getElementById('move-table-modal').classList.add('hidden'); }
function confirmMoveTable() {
    const toId = document.getElementById('move-to-select').value; if (!toId) return;
    if (confirm(`ยืนยันการย้ายออเดอร์ไป ${toId.replace('T','')} ?`)) {
        const fromItems = tables[currentTableId].items;
        fromItems.forEach(fItem => { let exist = tables[toId].items.find(i => i.id === fItem.id); if (exist) { exist.qty += fItem.qty; } else { tables[toId].items.push({...fItem}); } });
        tables[toId].discount += tables[currentTableId].discount; 
        tables[toId].penaltyAmount += tables[currentTableId].penaltyAmount;
        if(tables[currentTableId].penaltyReason) {
            tables[toId].penaltyReason = tables[toId].penaltyReason ? tables[toId].penaltyReason + ", " + tables[currentTableId].penaltyReason : tables[currentTableId].penaltyReason;
        }
        
        tables[currentTableId] = { status: 'empty', items: [], discount: 0, penaltyAmount: 0, penaltyReason: '', customerId: null, customerName: '' };
        currentTableId = toId; saveData(); renderAll(); closeMoveTableModal(); document.getElementById('current-table-label').innerText = currentTableId.replace('T','');
    }
}

// ========== PAYMENT, QR CODE & PRE-BILL ==========
function generatePromptPayPayload(target, amount) {
    const crc16 = (d) => { let crc = 0xFFFF; for (let i=0; i<d.length; i++) { crc ^= d.charCodeAt(i)<<8; for(let j=0; j<8; j++) crc = (crc&0x8000)?(crc<<1)^0x1021:crc<<1; } return (crc&0xFFFF).toString(16).toUpperCase().padStart(4,'0'); }
    let t = target.replace(/[^0-9]/g, ''); t = t.length >= 13 ? "0213"+t : "01130066"+t.substring(1);
    let a = parseFloat(amount).toFixed(2); let l = a.length.toString().padStart(2,'0');
    let p = `00020101021129370016A000000677010111${t}5802TH530376454${l}${a}6304`;
    return p + crc16(p);
}

function updatePromptPay() {
    const amount = parseFloat(document.getElementById('promptpay-override-display').innerText) || 0;
    const qrContainer = document.getElementById('qrcode-img');
    qrContainer.innerHTML = ''; 
    if (amount > 0 && typeof QRCode !== 'undefined') new QRCode(qrContainer, { text: generatePromptPayPayload(settings.promptpayId, amount), width: 200, height: 200 });
}

function previewPreBill() {
    if (!currentTableId || (tables[currentTableId].items.length === 0 && tables[currentTableId].penaltyAmount === 0)) return alert('ไม่มีรายการในโต๊ะ');
    const t = tables[currentTableId]; const sub = calculateTableSubtotal(currentTableId); const total = calculateTableTotal(currentTableId);
    let logoHtml = settings.logo ? `<div style="text-align:center;"><img src="${settings.logo}" style="max-width:150px; max-height:80px; margin-bottom:10px;"></div>` : '';
    let custHtml = t.customerName ? `<p style="text-align:center;">ลูกค้า: ${t.customerName}</p>` : '';
    let html = `${logoHtml}<h2 style="text-align:center;">${settings.storeName}</h2><p style="text-align:center;">บิลแจ้งยอด</p><p style="text-align:center;">วันที่: ${new Date().toLocaleString('th-TH')}</p><p style="text-align:center;">โต๊ะ: <strong>${currentTableId.replace('T','')}</strong></p>${custHtml}<hr style="border:1px dashed #ccc; margin:10px 0;"><table style="width:100%; text-align:left;"><tr><th>รายการ</th><th style="text-align:center;">จำนวน</th><th style="text-align:right;">ราคา</th></tr>`;
    
    t.items.forEach(i => { html += `<tr><td>${i.name}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${(i.price*i.qty).toFixed(2)}</td></tr>`; });
    
    html += `</table><hr style="border:1px dashed #ccc; margin:10px 0;"><p style="text-align:right;">ค่าอาหาร/เครื่องดื่ม: ฿${sub.toFixed(2)}</p><p style="text-align:right;">ส่วนลด: ฿${(t.discount||0).toFixed(2)}</p>`;
    
    if (t.penaltyAmount > 0) { html += `<p style="text-align:right; color:var(--warning);">ค่าปรับ (${t.penaltyReason}): ฿${t.penaltyAmount.toFixed(2)}</p>`; }
    
    html += `<h3 style="text-align:right; font-size:18px;">รวมต้องชำระ: ฿${total.toFixed(2)}</h3>`;
    if (total > 0 && typeof QRCode !== 'undefined') { html += `<div style="text-align:center; margin-top:15px;"><p>สแกนชำระเงิน</p><div id="preview-qr-container" style="display:inline-block; margin-top:10px;"></div></div>`; }
    document.getElementById('preview-content').innerHTML = html; document.getElementById('preview-modal').classList.remove('hidden');
    if (total > 0 && typeof QRCode !== 'undefined') { new QRCode(document.getElementById('preview-qr-container'), { text: generatePromptPayPayload(settings.promptpayId, total), width: 140, height: 140 }); }
}
function closePreviewModal() { document.getElementById('preview-modal').classList.add('hidden'); }

function confirmPrintPreBill() {
    closePreviewModal(); const t = tables[currentTableId];
    setupReceiptDOM("แจ้งยอด", currentTableId.replace('T',''), new Date().toLocaleString('th-TH'), t.items, calculateTableSubtotal(currentTableId), t.discount||0, calculateTableTotal(currentTableId), "รอชำระเงิน", false, t.customerName, 0, 0, 0, t.penaltyAmount||0, t.penaltyReason||'');
    const qrSec = document.getElementById('receipt-qr-section');
    if (calculateTableTotal(currentTableId) > 0 && typeof QRCode !== 'undefined') {
        qrSec.style.display = 'block'; document.getElementById('receipt-qrcode').innerHTML = '';
        new QRCode(document.getElementById('receipt-qrcode'), { text: generatePromptPayPayload(settings.promptpayId, calculateTableTotal(currentTableId)), width: 140, height: 140 });
    } else { qrSec.style.display = 'none'; }
    setTimeout(() => window.print(), 500);
}

function openPayment(method) {
    if (!currentTableId || (tables[currentTableId].items.length === 0 && tables[currentTableId].penaltyAmount === 0)) return alert('ไม่มีรายการในโต๊ะ');
    const total = calculateTableTotal(currentTableId);
    document.getElementById('payment-modal').classList.remove('hidden');
    document.getElementById('cash-section').classList.add('hidden'); document.getElementById('promptpay-section').classList.add('hidden');
    if (method === 'cash') { document.getElementById('cash-section').classList.remove('hidden'); document.getElementById('cash-due').innerText = total.toFixed(2); document.getElementById('cash-received-display').innerText = '0'; document.getElementById('cash-change').innerText = '0.00'; } 
    else { document.getElementById('promptpay-section').classList.remove('hidden'); document.getElementById('promptpay-due').innerText = total.toFixed(2); document.getElementById('promptpay-override-display').innerText = total.toFixed(2); updatePromptPay(); }
}

function calculateChange() {
    const due = parseFloat(document.getElementById('cash-due').innerText) || 0; const rec = parseFloat(document.getElementById('cash-received-display').innerText) || 0;
    document.getElementById('cash-change').innerText = Math.max(0, rec - due).toFixed(2);
}

function confirmPayment(method) {
    if (!currentTableId) return;
    const t = tables[currentTableId]; 
    const sub = calculateTableSubtotal(currentTableId); 
    const disc = t.discount || 0; 
    const penAmt = t.penaltyAmount || 0;
    const penRes = t.penaltyReason || '';
    const revenue = Math.max(0, sub - disc); // ยอดขายร้าน (ไม่รวมค่าปรับ)
    const total = revenue + penAmt; // ยอดรวมที่ลูกค้าต้องจ่าย
    
    let received = 0; let change = 0;
    if (method === 'cash') {
        received = parseFloat(document.getElementById('cash-received-display').innerText) || 0; change = parseFloat(document.getElementById('cash-change').innerText) || 0;
        if (received < total) { alert('ยอดรับเงินน้อยกว่ายอดสุทธิครับ กรุณาระบุยอดเงินใหม่'); return; }
    } else { received = total; }

    // คำนวณแต้มสะสมจาก "รายได้ร้าน" เท่านั้น (ไม่เอาค่าปรับมาคิดแต้ม)
    let earnedPoints = 0; let ratio = parseFloat(settings.pointsRatio) || 0;
    if (t.customerId && ratio > 0) { 
        earnedPoints = Math.floor(revenue / ratio); 
        let cust = customers.find(c => c.id === t.customerId); 
        if (cust) cust.points = (cust.points || 0) + earnedPoints; 
    }

    const order = { 
        id: Date.now(), receiptNo: settings.nextReceiptNo++, table: currentTableId.replace('T',''), 
        customerId: t.customerId, customerName: t.customerName, earnedPoints: earnedPoints, 
        items: [...t.items], subtotal: sub, discount: disc, penaltyAmount: penAmt, penaltyReason: penRes,
        revenue: revenue, total: total, method: method, received: received, change: change, date: new Date().toLocaleString('th-TH') 
    };
    orders.push(order);
    
    setupReceiptDOM(order.receiptNo.toString().padStart(5,'0'), order.table, order.date, order.items, order.subtotal, order.discount, order.total, method==='cash'?'เงินสด':'พร้อมเพย์', false, order.customerName, earnedPoints, order.received, order.change, order.penaltyAmount, order.penaltyReason, order.revenue);
    document.getElementById('receipt-qr-section').style.display = 'none'; window.print();

    tables[currentTableId] = { status: 'empty', items: [], discount: 0, penaltyAmount: 0, penaltyReason: '', customerId: null, customerName: '' }; currentTableId = null;
    document.getElementById('current-table-label').innerText = 'ยังไม่เลือก'; document.getElementById('current-customer-label').innerText = 'ลูกค้าทั่วไป';
    saveData(); closePaymentModal(); switchPosMode('tables'); renderAll();
}

function setupReceiptDOM(no, table, date, items, sub, disc, total, method, isReprint, customerName, earnedPoints, received = 0, change = 0, penAmt = 0, penRes = '', revenue = 0) {
    const rLogo = document.getElementById('receipt-logo');
    if (settings.logo) { rLogo.src = settings.logo; rLogo.style.display = 'block'; } else { rLogo.style.display = 'none'; }
    document.getElementById('receipt-store').innerText = settings.storeName;
    const badge = document.getElementById('receipt-reprint-badge');
    if(isReprint) { badge.style.display = 'block'; badge.innerText = "*** พิมพ์ซ้ำ (COPY) ***"; } else { badge.style.display = 'none'; }
    
    document.getElementById('receipt-no').innerText = no; document.getElementById('receipt-date').innerText = date; document.getElementById('receipt-table').innerText = table; document.getElementById('receipt-customer').innerText = customerName || '-';

    const tbody = document.getElementById('receipt-items'); tbody.innerHTML = '';
    items.forEach(i => { tbody.innerHTML += `<tr><td class="text-left">${i.name}</td><td class="text-center">${i.qty}</td><td class="text-right">${(i.price*i.qty).toFixed(2)}</td></tr>`; });
    
    document.getElementById('receipt-subtotal').innerText = sub.toFixed(2); document.getElementById('receipt-discount').innerText = disc.toFixed(2);
    
    // โชว์ยอดขายสุทธิของร้าน (ถ้ามีค่าปรับ ค่อยโชว์บรรทัดแยก)
    document.getElementById('receipt-revenue').innerText = (sub - disc).toFixed(2);
    
    const penSec = document.getElementById('receipt-penalty-section');
    if (penAmt > 0) {
        penSec.style.display = 'block';
        document.getElementById('receipt-penalty-reason').innerText = penRes;
        document.getElementById('receipt-penalty-amount').innerText = penAmt.toFixed(2);
    } else { penSec.style.display = 'none'; }

    document.getElementById('receipt-total').innerText = total.toFixed(2);
    
    const cashDetails = document.getElementById('receipt-cash-details');
    if (method === 'เงินสด' && received > 0) {
        cashDetails.style.display = 'block'; document.getElementById('receipt-received').innerText = received.toFixed(2); document.getElementById('receipt-change').innerText = change.toFixed(2);
    } else { cashDetails.style.display = 'none'; }

    document.getElementById('receipt-method').innerText = method;

    const ptSec = document.getElementById('receipt-points-section');
    if (customerName && earnedPoints > 0) { ptSec.style.display = 'block'; ptSec.innerText = `ได้รับคะแนนสะสมบิลนี้: ${earnedPoints} แต้ม`; } else { ptSec.style.display = 'none'; }
}
function closePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); }

// ========== HISTORY (ADMIN EDIT/DELETE) ==========
function renderHistory() {
    const tbody = document.getElementById('history-table-body');
    if(!tbody) return; tbody.innerHTML = '';
    [...orders].reverse().forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${o.receiptNo.toString().padStart(5,'0')}</td><td>${o.date}</td><td>${o.table}</td><td>${o.customerName || '-'}</td><td class="text-success" style="font-weight:bold;">฿${o.total.toFixed(2)}</td><td>${o.method === 'cash' ? 'เงินสด' : 'พร้อมเพย์'}</td><td><button class="btn-sm btn-primary" onclick="viewHistoryOrder(${o.id})">ดู/จัดการบิล</button></td>`;
        tbody.appendChild(tr);
    });
}

function viewHistoryOrder(id) {
    const order = orders.find(o => o.id === id); if(!order) return; currentReprintOrder = order;
    document.getElementById('hist-no').innerText = order.receiptNo.toString().padStart(5,'0');
    let html = `<p><b>วันที่:</b> ${order.date}</p><p><b>โต๊ะ:</b> ${order.table}</p><p><b>ลูกค้า:</b> ${order.customerName || '-'}</p><p><b>วิธีชำระ:</b> ${order.method}</p><hr style="border-color:#444; margin:10px 0;">`;
    order.items.forEach((i, idx) => { html += `<div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;"><span>${i.name} x${i.qty}</span><div class="flex-row"><span>฿${(i.price*i.qty).toFixed(2)}</span><button class="btn-icon text-danger" title="ลบรายการนี้" onclick="adminRemoveItemFromBill(${order.id}, ${idx})">✖</button></div></div>`; });
    html += `<hr style="border-color:#444; margin:10px 0;"><p class="text-right">ค่าอาหาร/เครื่องดื่ม: ฿${order.subtotal.toFixed(2)}</p><p class="text-right">ส่วนลด: ฿${order.discount.toFixed(2)}</p>`;
    if(order.penaltyAmount > 0) html += `<p class="text-right text-warning">ค่าปรับ (${order.penaltyReason}): ฿${order.penaltyAmount.toFixed(2)}</p>`;
    html += `<h3 class="text-right text-success">สุทธิ: ฿${order.total.toFixed(2)}</h3>`;
    document.getElementById('hist-details').innerHTML = html; document.getElementById('history-modal').classList.remove('hidden');
}

function adminRemoveItemFromBill(orderId, itemIdx) {
    if(!confirm('สิทธิ์แอดมิน: ยืนยันการลบรายการอาหารนี้ออกจากบิลที่ชำระแล้วใช่หรือไม่?')) return;
    const order = orders.find(o => o.id === orderId); order.items.splice(itemIdx, 1);
    order.subtotal = order.items.reduce((s, i) => s + (i.price * i.qty), 0); 
    order.revenue = Math.max(0, order.subtotal - order.discount);
    order.total = order.revenue + (order.penaltyAmount || 0);
    
    if (order.items.length === 0 && !(order.penaltyAmount > 0)) { deleteWholeBillCore(orderId); } 
    else { recalculateOrderPoints(order); saveData(); renderHistory(); viewHistoryOrder(orderId); updateSummary(); }
}

function deleteWholeBill() { if(!currentReprintOrder) return; if(!confirm('สิทธิ์แอดมิน: ยืนยันการ "ลบบิลนี้ทิ้งทั้งใบ" ใช่หรือไม่? (ยอดขายและแต้มลูกค้าจะถูกหักออก)')) return; deleteWholeBillCore(currentReprintOrder.id); }
function deleteWholeBillCore(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (order.customerId && order.earnedPoints) { let cust = customers.find(c => c.id === order.customerId); if(cust) cust.points = Math.max(0, (cust.points || 0) - order.earnedPoints); }
    orders = orders.filter(o => o.id !== orderId); saveData(); renderHistory(); closeHistoryModal(); updateSummary();
}

function recalculateOrderPoints(order) {
    if (!order.customerId) return;
    let ratio = parseFloat(settings.pointsRatio) || 0; let oldPoints = order.earnedPoints || 0; let newPoints = ratio > 0 ? Math.floor(order.revenue / ratio) : 0;
    if (oldPoints !== newPoints) { let cust = customers.find(c => c.id === order.customerId); if(cust) { cust.points = Math.max(0, (cust.points || 0) - oldPoints + newPoints); } order.earnedPoints = newPoints; }
}

function closeHistoryModal() { document.getElementById('history-modal').classList.add('hidden'); currentReprintOrder = null;}
function printReprintBill() {
    if(!currentReprintOrder) return; const o = currentReprintOrder;
    setupReceiptDOM(o.receiptNo.toString().padStart(5,'0'), o.table, o.date, o.items, o.subtotal, o.discount, o.total, o.method==='cash'?'เงินสด':'พร้อมเพย์', true, o.customerName, o.earnedPoints, o.received, o.change, o.penaltyAmount, o.penaltyReason, o.revenue);
    document.getElementById('receipt-qr-section').style.display = 'none'; window.print();
}

// ========== MANAGEMENT (CRM & Drag/Drop) ==========
function renderManagement() {
    const custList = document.getElementById('mgmt-customer-list');
    if (custList) { custList.innerHTML = ''; customers.forEach(c => { custList.innerHTML += `<tr><td>${c.name}</td><td>${c.phone || '-'}</td><td class="text-accent" style="font-weight:bold;">${c.points || 0}</td><td><button class="btn-sm btn-danger" onclick="deleteCustomer('${c.id}')">ลบ</button></td></tr>`; }); }
    const tList = document.getElementById('mgmt-table-list');
    if(tList) { tList.innerHTML = ''; tableList.forEach(t => tList.innerHTML += `<li><span>${t.replace('T','')}</span> <button class="btn-sm btn-danger" onclick="deleteTable('${t}')">ลบ</button></li>`); }
    const cList = document.getElementById('mgmt-category-list'); const selCat = document.getElementById('new-menu-category');
    if(cList && selCat) {
        cList.innerHTML = ''; selCat.innerHTML = '';
        categories.forEach((c, idx) => {
            cList.innerHTML += `<li class="draggable-item" draggable="true" ondragstart="catDragStart(${idx})" ondragover="event.preventDefault()" ondrop="catDrop(${idx})" title="คลิกค้างเพื่อลากสลับตำแหน่ง"><div><span style="color:#666; cursor:grab; margin-right:10px;">☰</span> ${c}</div> <button class="btn-sm btn-danger" onclick="deleteCategory('${c}')">ลบ</button></li>`;
            selCat.innerHTML += `<option value="${c}">${c}</option>`;
        });
    }
    const mList = document.getElementById('mgmt-menu-list');
    if(mList) {
        mList.innerHTML = ''; let defaultImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%232b3040"><rect width="40" height="40" fill="%232b3040"/><text x="20" y="25" font-family="Arial" font-size="10" fill="%2394a3b8" text-anchor="middle">Img</text></svg>';
        menuItems.forEach(m => {
            let imgSrc = m.image ? m.image : defaultImg;
            mList.innerHTML += `<li><div class="flex-row" style="align-items:center;"><img src="${imgSrc}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;"><div><b>${m.name}</b> <small class="text-muted">(${m.category})</small><br><span class="text-success">฿${m.price}</span></div></div> <div class="flex-row"><button class="btn-sm btn-warning" onclick="openEditMenuModal('${m.id}')">✏️</button><button class="btn-sm btn-danger" onclick="deleteMenuItem('${m.id}')">✖</button></div></li>`;
        });
    }
}

function addCustomer() { const name = document.getElementById('new-cust-name').value.trim(); const phone = document.getElementById('new-cust-phone').value.trim(); if (!name) return alert('กรุณากรอกชื่อลูกค้า'); customers.push({ id: 'c'+Date.now(), name: name, phone: phone, points: 0 }); document.getElementById('new-cust-name').value = ''; document.getElementById('new-cust-phone').value = ''; saveData(); renderManagement(); }
function deleteCustomer(id) { if(!confirm('ลบข้อมูลลูกค้านี้?')) return; customers = customers.filter(c => c.id !== id); saveData(); renderManagement(); }
function catDragStart(idx) { draggedCatIndex = idx; }
function catDrop(idx) { if(draggedCatIndex === null || draggedCatIndex === idx) return; const movedCat = categories.splice(draggedCatIndex, 1)[0]; categories.splice(idx, 0, movedCat); saveData(); renderManagement(); if(currentPosMode === 'menu') renderPosMenu(); }
function addTable() { let val = document.getElementById('new-table-name').value.trim(); if(!val) return; if(!val.startsWith('T')) val = 'T' + val; if(tableList.includes(val)) return alert('ชื่อโต๊ะซ้ำ'); tableList.push(val); tables[val] = { status: 'empty', items: [], discount: 0, penaltyAmount: 0, penaltyReason: '', customerId: null, customerName: '' }; document.getElementById('new-table-name').value = ''; saveData(); renderAll(); }
function deleteTable(t) { if(tables[t] && tables[t].items.length > 0) return alert('โต๊ะนี้มีรายการค้างอยู่ ลบไม่ได้'); if(!confirm(`ลบโต๊ะ ${t.replace('T','')}?`)) return; tableList = tableList.filter(x => x !== t); delete tables[t]; saveData(); renderAll(); }
function addCategory() { const val = document.getElementById('new-category-name').value.trim(); if(!val) return; if(categories.includes(val)) return alert('ชื่อหมวดหมู่ซ้ำ'); categories.push(val); document.getElementById('new-category-name').value = ''; saveData(); renderAll(); }
function deleteCategory(c) { if(menuItems.some(m => m.category === c)) return alert('ต้องลบเมนูในหมวดนี้ออกให้หมดก่อนถึงจะลบหมวดหมู่ได้'); if(!confirm(`ลบหมวด ${c}?`)) return; categories = categories.filter(x => x !== c); if(currentCategory === c) currentCategory = categories[0] || ''; saveData(); renderAll(); }
function addMenuItem() { const name = document.getElementById('new-menu-name').value.trim(); const cat = document.getElementById('new-menu-category').value; const price = parseFloat(document.getElementById('new-menu-price').value); const image = document.getElementById('new-menu-image').value.trim(); if(!name || isNaN(price) || !cat) return alert('กรอกข้อมูลไม่ครบถ้วน'); menuItems.push({ id: 'm'+Date.now(), name, category: cat, price, image }); document.getElementById('new-menu-name').value = ''; document.getElementById('new-menu-price').value = ''; document.getElementById('new-menu-image').value = ''; saveData(); renderAll(); }
function deleteMenuItem(id) { if(!confirm('ลบเมนูนี้?')) return; menuItems = menuItems.filter(m => m.id !== id); saveData(); renderAll(); }
function openEditMenuModal(id) { const item = menuItems.find(m => m.id === id); if(!item) return; document.getElementById('edit-menu-id').value = item.id; document.getElementById('edit-menu-name').value = item.name; document.getElementById('edit-menu-price').value = item.price; document.getElementById('edit-menu-image').value = item.image || ''; const catSelect = document.getElementById('edit-menu-category'); catSelect.innerHTML = ''; categories.forEach(c => { catSelect.innerHTML += `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`; }); document.getElementById('edit-menu-modal').classList.remove('hidden'); }
function closeEditMenuModal() { document.getElementById('edit-menu-modal').classList.add('hidden'); }
function saveEditMenu() { const id = document.getElementById('edit-menu-id').value; const name = document.getElementById('edit-menu-name').value.trim(); const cat = document.getElementById('edit-menu-category').value; const price = parseFloat(document.getElementById('edit-menu-price').value); const image = document.getElementById('edit-menu-image').value.trim(); if(!name || isNaN(price) || !cat) return alert('กรุณากรอกข้อมูลให้ครบถ้วน'); const index = menuItems.findIndex(m => m.id === id); if(index !== -1) { menuItems[index] = { id, name, category: cat, price, image }; saveData(); renderAll(); closeEditMenuModal(); } }

// ========== REPORTS & CHARTS ==========
function initSummaryDates() { const d = new Date(); const tzOffset = d.getTimezoneOffset() * 60000; const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10); document.getElementById('filter-start-date').value = localISOTime; document.getElementById('filter-end-date').value = localISOTime; }
function setSummaryRange(type) { const d = new Date(); let start, end; const tzOffset = d.getTimezoneOffset() * 60000; if (type === 'daily') { start = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10); end = start; } else if (type === 'monthly') { let firstDay = new Date(d.getFullYear(), d.getMonth(), 1); let lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0); start = (new Date(firstDay - tzOffset)).toISOString().slice(0, 10); end = (new Date(lastDay - tzOffset)).toISOString().slice(0, 10); } else if (type === 'yearly') { let firstDay = new Date(d.getFullYear(), 0, 1); let lastDay = new Date(d.getFullYear(), 11, 31); start = (new Date(firstDay - tzOffset)).toISOString().slice(0, 10); end = (new Date(lastDay - tzOffset)).toISOString().slice(0, 10); } document.getElementById('filter-start-date').value = start; document.getElementById('filter-end-date').value = end; updateSummary(); }
function updateSummary() {
    let startInput = document.getElementById('filter-start-date').value; let endInput = document.getElementById('filter-end-date').value; if(!startInput || !endInput) return; 
    let startTs = new Date(startInput + 'T00:00:00').getTime(); let endTs = new Date(endInput + 'T23:59:59').getTime();
    filteredExportOrders = orders.filter(o => o.id >= startTs && o.id <= endTs); let rangeDays = (endTs - startTs) / (1000 * 3600 * 24);
    
    let ts_revenue = 0, ts_penalty = 0, cs = 0, ps = 0; 
    let counts = {}; let groupedSales = {};
    
    filteredExportOrders.forEach(o => {
        ts_revenue += (o.revenue || 0); // นับเฉพาะรายได้ร้าน ไม่รวมค่าปรับ
        ts_penalty += (o.penaltyAmount || 0);
        if(o.method==='cash') cs += o.total; else ps += o.total; // เงินที่รับจริงคือ total
        
        (o.items||[]).forEach(i => { counts[i.name] = (counts[i.name]||0) + i.qty; });
        let d = new Date(o.id); let sortKey = ''; let displayLabel = '';
        if (rangeDays > 90) { sortKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; displayLabel = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }); } 
        else if (rangeDays > 1) { sortKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; displayLabel = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); } 
        else { sortKey = String(d.getHours()).padStart(2,'0'); displayLabel = d.getHours() + ':00'; }
        
        if(!groupedSales[sortKey]) groupedSales[sortKey] = { label: displayLabel, amount: 0 }; 
        groupedSales[sortKey].amount += (o.revenue || 0); // กราฟโชว์เฉพาะรายได้ร้าน
    });
    
    if(document.getElementById('sum-revenue')) document.getElementById('sum-revenue').innerText = ts_revenue.toFixed(2);
    if(document.getElementById('sum-penalty')) document.getElementById('sum-penalty').innerText = ts_penalty.toFixed(2);
    if(document.getElementById('sum-cash')) document.getElementById('sum-cash').innerText = cs.toFixed(2);
    if(document.getElementById('sum-promptpay')) document.getElementById('sum-promptpay').innerText = ps.toFixed(2);
    if(document.getElementById('sum-bills')) document.getElementById('sum-bills').innerText = filteredExportOrders.length;
    
    let margin = settings.profitMargin || 0; let profit = ts_revenue * (margin / 100);
    if(document.getElementById('sum-profit-percent')) document.getElementById('sum-profit-percent').innerText = margin;
    if(document.getElementById('sum-profit')) document.getElementById('sum-profit').innerText = profit.toFixed(2);
    const list = document.getElementById('top-items-list'); 
    if(list) { list.innerHTML = ''; Object.keys(counts).map(k => ({n:k, q:counts[k]})).sort((a,b) => b.q - a.q).slice(0,5).forEach(i => { list.innerHTML += `<li><span>${i.n}</span> <span class="text-success">ขายได้ ${i.q} ชิ้น</span></li>`; }); if(Object.keys(counts).length === 0) list.innerHTML = '<li style="justify-content:center; color:#888;">ไม่มีข้อมูลยอดขายในช่วงเวลานี้</li>'; }
    renderSalesChart(groupedSales);
}
function renderSalesChart(groupedSales) {
    const ctx = document.getElementById('salesChart'); if(!ctx) return;
    let sortedKeys = Object.keys(groupedSales).sort(); let labels = sortedKeys.map(k => groupedSales[k].label); let data = sortedKeys.map(k => groupedSales[k].amount);
    if (salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'รายได้ร้าน (บาท)', data: data, backgroundColor: '#3b82f6', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } }, plugins: { legend: { labels: { color: '#e2e8f0' } } } } });
}
function exportCSV() {
    if (filteredExportOrders.length === 0) return alert('ไม่มียอดขายให้ส่งออกครับ'); 
    let csv = 'ReceiptNo,Date,Table,Customer,Revenue,PenaltyAmount,PenaltyReason,TotalPaid,Method\n';
    filteredExportOrders.forEach(o => { csv += `${o.receiptNo},"${o.date}",${o.table},"${o.customerName||'-'}",${o.revenue},${o.penaltyAmount||0},"${o.penaltyReason||'-'}",${o.total},${o.method}\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `ยอดขาย_${document.getElementById('filter-start-date').value}_ถึง_${document.getElementById('filter-end-date').value}.csv`; a.click();
}

// ========== SETTINGS ==========
function handleLogoUpload(event) { const file = event.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = function(e) { settings.logo = e.target.result; document.getElementById('setting-logo-preview').src = settings.logo; }; reader.readAsDataURL(file); } }
function clearLogo() { settings.logo = ""; document.getElementById('setting-logo-preview').src = ""; document.getElementById('setting-logo-upload').value = ""; }
function saveSettings() {
    settings.storeName = document.getElementById('setting-store-name').value; settings.promptpayId = document.getElementById('setting-promptpay-id').value; settings.profitMargin = parseFloat(document.getElementById('setting-profit-margin').value) || 0; settings.pointsRatio = parseFloat(document.getElementById('setting-points-ratio').value) || 0;
    document.getElementById('display-store-name').innerText = settings.storeName; saveData(); updateSummary(); alert('บันทึกเรียบร้อย');
}
function hardReset() { if(confirm('คำเตือน: ล้างข้อมูลระบบทั้งหมด? (กู้คืนไม่ได้)')) { localStorage.clear(); location.reload(); } }
function resetDaily() { if(confirm('ยืนยันการลบข้อมูลยอดขายทั้งหมดในระบบ? (ลบแล้วกู้คืนไม่ได้)')) { orders = []; settings.nextReceiptNo = 1; saveData(); updateSummary(); renderHistory(); alert('ล้างยอดขายเรียบร้อยแล้ว'); } }