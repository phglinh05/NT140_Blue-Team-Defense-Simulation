// Biến toàn cục
let cart = [];
let products = [];
const currentUser = localStorage.getItem('currentUser');

if(currentUser) {
    const msg = document.getElementById('welcomeMsg');
    if(msg) msg.innerText = `Xin chào, ${currentUser}!`;
}

// 1. Xử lý Đăng nhập / Đăng ký
async function auth(type) {
    const user = document.getElementById(type === 'login' ? 'loginUser' : 'regUser').value;
    const pass = document.getElementById(type === 'login' ? 'loginPass' : 'regPass').value;

    if (!user || !pass) return alert("Vui lòng nhập đủ thông tin!");

    const endpoint = type === 'login' ? '/api/login' : '/api/register';
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();

    if (data.success) {
        if (type === 'login') {
            localStorage.setItem('currentUser', data.username);
            window.location.href = 'index.html';
        } else {
            alert("Đăng ký thành công! Hãy đăng nhập.");
            location.reload();
        }
    } else {
        alert(data.message);
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

// 2. Tải danh sách sản phẩm
async function loadProducts() {
    const res = await fetch('/api/products');
    products = await res.json();

    const foodDiv = document.getElementById('foodList');
    const drinkDiv = document.getElementById('drinkList');
    foodDiv.innerHTML = ''; 
    drinkDiv.innerHTML = '';

    products.forEach(p => {
        const html = `
            <div class="col-6 col-md-3">
                <div class="card h-100 shadow-sm border-0">
                    <img src="${p.image}" class="card-img-top product-img" alt="${p.name}">
                    <div class="card-body p-2 text-center">
                        <h6 class="card-title">${p.name}</h6>
                        <div class="text-danger fw-bold">${p.price.toLocaleString()} đ</div>
                        <button class="btn btn-sm btn-primary mt-2 w-100" onclick="addToCart('${p._id}')">Mua</button>
                    </div>
                </div>
            </div>
        `;
        if (p.type === 'food') foodDiv.innerHTML += html;
        else drinkDiv.innerHTML += html;
    });
}

// 3. Giỏ hàng
function addToCart(id) {
    const product = products.find(p => p._id === id);
    let qty = prompt(`Nhập số lượng ${product.name}:`, 1);
    
    if (qty && parseInt(qty) > 0) {
        qty = parseInt(qty);
        const exist = cart.find(i => i._id === id);
        if (exist) exist.qty += qty;
        else cart.push({ ...product, qty });
        renderCart();
    }
}

function renderCart() {
    const list = document.getElementById('cartItems');
    const totalEl = document.getElementById('totalPrice');
    list.innerHTML = '';
    let total = 0;

    cart.forEach((item, idx) => {
        const sum = item.price * item.qty;
        total += sum;
        list.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center p-2">
                <div>
                    <div class="fw-bold">${item.name}</div>
                    <small>${item.qty} x ${item.price.toLocaleString()}</small>
                </div>
                <div class="d-flex align-items-center">
                    <span class="me-2">${sum.toLocaleString()}</span>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeFromCart(${idx})">×</button>
                </div>
            </li>
        `;
    });
    totalEl.innerText = total.toLocaleString() + " đ";
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

// 4. Đặt hàng
async function placeOrder() {
    if (cart.length === 0) return alert("Giỏ hàng trống!");
    
    const total = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
    const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, items: cart, total })
    });
    
    const data = await res.json();
    if (data.success) {
        alert("Đặt hàng thành công!");
        cart = [];
        renderCart();
    }
}

// 5. Xem lịch sử
async function showHistory() {
    const res = await fetch(`/api/history/${currentUser}`);
    const orders = await res.json();
    const content = document.getElementById('historyContent');
    content.innerHTML = '';

    if (orders.length === 0) {
        content.innerHTML = '<p class="text-center text-muted">Chưa có đơn hàng nào.</p>';
    } else {
        orders.forEach(order => {
            const date = new Date(order.date).toLocaleString('vi-VN');
            const itemsHtml = order.items.map(i => `<li>${i.name} (x${i.qty})</li>`).join('');
            content.innerHTML += `
                <div class="card mb-3 border-secondary">
                    <div class="card-header bg-secondary text-white d-flex justify-content-between">
                        <span>${date}</span>
                        <span class="fw-bold">${order.total.toLocaleString()} đ</span>
                    </div>
                    <div class="card-body bg-light">
                        <ul class="mb-0">${itemsHtml}</ul>
                    </div>
                </div>
            `;
        });
    }
    const myModal = new bootstrap.Modal(document.getElementById('historyModal'));
    myModal.show();
}