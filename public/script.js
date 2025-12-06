// Biến toàn cục
let cart = [];
let products = [];

// Helper: Escape HTML để chống XSS
function escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Helper: Lấy headers với token
function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
}

// 1. Xử lý Đăng nhập / Đăng ký
async function auth(type) {
    const userEl = document.getElementById(type === 'login' ? 'loginUser' : 'regUser');
    const passEl = document.getElementById(type === 'login' ? 'loginPass' : 'regPass');
    const msgEl = document.getElementById(type === 'login' ? 'authMsgLogin' : 'authMsgRegister');
    const btnEl = document.querySelector(type === 'login' ? '.btn-login' : '.btn-register');

    const user = userEl ? userEl.value : '';
    const pass = passEl ? passEl.value : '';

    const showMsg = (text, ok = false) => {
        if (!msgEl) return alert(text);
        msgEl.style.display = 'block';
        msgEl.style.borderLeftColor = ok ? '#28a745' : '#fe724c';
        msgEl.style.color = ok ? '#155724' : '#6c757d';
        msgEl.textContent = text;
    };

    const setLoading = (loading) => {
        if (btnEl) {
            btnEl.disabled = loading;
            btnEl.textContent = loading
                ? (type === 'login' ? 'ĐANG ĐĂNG NHẬP...' : 'ĐANG ĐĂNG KÝ...')
                : (type === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ NGAY');
        }
    };

    if (!user || !pass) return showMsg('Vui lòng nhập đủ thông tin!');

    // Validation phía client - YÊU CẦU PASSWORD MẠNH
    if (user.length < 3 || user.length > 30) {
        return showMsg('Username phải từ 3-30 ký tự!');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(user)) {
        return showMsg('Username chỉ chứa chữ cái, số và _!');
    }
    if (/^\d+$/.test(user)) {
        return showMsg('Username không được toàn là số!');
    }
    if (pass.length < 8) {
        return showMsg('Password phải ít nhất 8 ký tự!');
    }
    
    if (type === 'register') {
        if (!/[a-z]/.test(pass)) {
            return showMsg('Password phải có ít nhất 1 chữ thường (a-z)!');
        }
        if (!/[A-Z]/.test(pass)) {
            return showMsg('Password phải có ít nhất 1 chữ HOA (A-Z)!');
        }
        if (!/[0-9]/.test(pass)) {
            return showMsg('Password phải có ít nhất 1 chữ số (0-9)!');
        }
        if (!/[@$!%*?&#]/.test(pass)) {
            return showMsg('Password phải có ít nhất 1 ký tự đặc biệt (@$!%*?&#)!');
        }
    } else {
        if (!/[a-zA-Z]/.test(pass) || !/[0-9]/.test(pass)) {
            return showMsg('Password phải có cả chữ và số!');
        }
    }

    const endpoint = type === 'login' ? '/api/login' : '/api/register';
    setLoading(true);
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.toLowerCase(), password: pass }) // NORMALIZE
        });

        let data;
        try {
            data = await res.json();
        } catch (e) {
            // Khi server trả về không phải JSON
            return showMsg('Phản hồi không hợp lệ từ server.');
        }

        if (res.ok && data && data.success) {
            if (type === 'login') {
                localStorage.setItem('currentUser', data.username);
                localStorage.setItem('authToken', data.token);
                showMsg('Đăng nhập thành công! Đang chuyển trang...', true);
                setTimeout(() => { window.location.href = 'index.html'; }, 500);
            } else {
                showMsg('Đăng ký thành công! Hãy đăng nhập.', true);
                // Chuyển sang tab đăng nhập
                const loginTabBtn = document.querySelector('[data-bs-target="#login"]');
                if (loginTabBtn) loginTabBtn.click();
            }
        } else {
            // Hiển thị thông báo lỗi cụ thể nếu có
            const msg = (data && data.message) ? data.message : `Lỗi (${res.status}). Vui lòng thử lại.`;
            showMsg(msg);
        }
    } catch (err) {
        showMsg('Lỗi kết nối server!');
        console.error(err);
    } finally {
        setLoading(false);
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
}

// 2. Tải danh sách sản phẩm
async function loadProducts() {
    console.log('[LOAD] Bắt đầu tải sản phẩm từ API...');
    
    try {
        console.log('[LOAD] Gọi /api/products...');
        const res = await fetch('/api/products');
        
        console.log('[LOAD] Response status:', res.status, res.statusText);
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status} ${res.statusText}`);
        }
        
        const data = await res.json();
        
        console.log('[LOAD] Dữ liệu nhận được (raw):', data);
        console.log('[LOAD] Loại dữ liệu:', typeof data);
        console.log('[LOAD] Có phải array?', Array.isArray(data));
        console.log('[LOAD] Số lượng sản phẩm:', data ? data.length : 'null');
        
        // Validate response
        if (!Array.isArray(data)) {
            throw new Error('Dữ liệu sản phẩm không hợp lệ - không phải array');
        }
        
        if (data.length === 0) {
            console.warn('[LOAD] CẢNH BÁO: Không có sản phẩm nào!');
            console.warn('[LOAD] Vui lòng chạy: node seed.js');
            
            const foodDiv = document.getElementById('foodList');
            const drinkDiv = document.getElementById('drinkList');
            if (foodDiv) foodDiv.innerHTML = '<div class="col-12 text-center text-danger fw-bold p-4">Không có sản phẩm! Vui lòng chạy: node seed.js</div>';
            if (drinkDiv) drinkDiv.innerHTML = '<div class="col-12 text-center text-danger fw-bold p-4">Không có sản phẩm! Vui lòng chạy: node seed.js</div>';
            return;
        }
        
        products = data;
        console.log('[LOAD] Đã lưu', products.length, 'sản phẩm vào memory');

        const foodDiv = document.getElementById('foodList');
        const drinkDiv = document.getElementById('drinkList');
        
        if (!foodDiv || !drinkDiv) {
            throw new Error('Không tìm thấy container sản phẩm (foodList hoặc drinkList)');
        }
        
        foodDiv.innerHTML = ''; 
        drinkDiv.innerHTML = '';
        
        let foodCount = 0;
        let drinkCount = 0;

        products.forEach((p, idx) => {
            console.log(`[LOAD] Xử lý sản phẩm #${idx}:`, p.name, '- Type:', p.type);
            
            // Validate product data
            if (!p._id || !p.name || typeof p.price !== 'number' || !p.type) {
                console.error('[LOAD] Sản phẩm không hợp lệ:', p);
                return;
            }
            
            const safeName = escapeHtml(p.name);
            const safeImage = escapeHtml(p.image || '');
            
            const html = `
                <div class="col-12 col-sm-6 col-md-4 col-lg-3">
                    <div class="product-card">
                        <div class="product-img-wrapper">
                            <img src="${safeImage}" class="product-img" alt="${safeName}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23999%22 font-size=%2220%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                            <div class="product-badge">${p.type === 'food' ? 'Đồ ăn' : 'Nước uống'}</div>
                        </div>
                        <div class="product-body">
                            <div class="product-name">${safeName}</div>
                            <div class="product-price">${p.price.toLocaleString()}đ</div>
                            <button class="btn-add-cart" data-product-id="${p._id}">Thêm vào giỏ</button>
                        </div>
                    </div>
                </div>
            `;
            if (p.type === 'food') {
                foodDiv.innerHTML += html;
                foodCount++;
            } else if (p.type === 'drink') {
                drinkDiv.innerHTML += html;
                drinkCount++;
            }
        });
        
        console.log(`[LOAD] Hoàn tất! Đã tải ${foodCount} món ăn + ${drinkCount} đồ uống`);
        
        if (foodCount === 0) {
            foodDiv.innerHTML = '<div class="col-12 text-center text-muted">Chưa có món ăn nào</div>';
        }
        if (drinkCount === 0) {
            drinkDiv.innerHTML = '<div class="col-12 text-center text-muted">Chưa có đồ uống nào</div>';
        }
    } catch (err) {
        console.error('[LOAD] LỖI:', err.message);
        console.error('[LOAD] Stack:', err.stack);
        
        const foodDiv = document.getElementById('foodList');
        const drinkDiv = document.getElementById('drinkList');
        if (foodDiv) foodDiv.innerHTML = '<div class="col-12 text-center text-danger"><strong>Lỗi tải dữ liệu:</strong> ' + err.message + '</div>';
        if (drinkDiv) drinkDiv.innerHTML = '<div class="col-12 text-center text-danger"><strong>Lỗi tải dữ liệu:</strong> ' + err.message + '</div>';
    }
}

// 3. Giỏ hàng
let selectedProduct = null;

function addToCart(id) {
    const product = products.find(p => p._id === id);
    if (!product) {
        alert('Sản phẩm không tồn tại!');
        return;
    }
    
    selectedProduct = product;
    
    // Hiển thị modal
    const modalEl = document.getElementById('quantityModal');
    const productNameEl = document.getElementById('modalProductName');
    const productPriceEl = document.getElementById('modalProductPrice');
    const qtyInputEl = document.getElementById('modalQuantityInput');
    
    if (productNameEl) productNameEl.textContent = product.name;
    if (productPriceEl) productPriceEl.textContent = product.price.toLocaleString() + 'đ';
    if (qtyInputEl) {
        qtyInputEl.value = 1;
        qtyInputEl.focus();
    }
    
    if (modalEl && typeof bootstrap !== 'undefined') {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

function confirmAddToCart() {
    if (!selectedProduct) return;
    
    const qtyInputEl = document.getElementById('modalQuantityInput');
    const qty = parseInt(qtyInputEl.value, 10);
    
    if (isNaN(qty) || qty < 1 || qty > 999) {
        alert('Số lượng phải là số từ 1-999!');
        return;
    }
    
    const exist = cart.find(i => i._id === selectedProduct._id);
    
    if (exist) {
        const newQty = exist.qty + qty;
        if (newQty > 999) {
            alert('Tổng số lượng không được vượt quá 999!');
            return;
        }
        exist.qty = newQty;
    } else {
        cart.push({ ...selectedProduct, qty });
    }
    
    renderCart();
    
    // Đóng modal
    const modalEl = document.getElementById('quantityModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
    
    selectedProduct = null;
}

function renderCart() {
    const list = document.getElementById('cartItems');
    const totalEl = document.getElementById('totalPrice');
    
    if (!list || !totalEl) {
        console.error('Không tìm thấy element giỏ hàng');
        return;
    }
    
    list.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        list.innerHTML = `
            <div class="cart-empty">
                <p>Giỏ hàng trống</p>
            </div>
        `;
        totalEl.innerText = '0đ';
        return;
    }

    cart.forEach((item, idx) => {
        // Validate item data
        if (!item || typeof item.price !== 'number' || typeof item.qty !== 'number') {
            console.error('Item không hợp lệ:', item);
            return;
        }
        
        const sum = item.price * item.qty;
        total += sum;
        const safeName = escapeHtml(item.name);
        
        list.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-name">${safeName}</div>
                <div class="cart-item-details">
                    <span class="cart-item-qty">${item.qty} x ${item.price.toLocaleString()}đ</span>
                    <span class="cart-item-price">${sum.toLocaleString()}đ</span>
                </div>
                <button class="btn btn-sm btn-outline-danger mt-2 w-100 btn-remove-cart" data-cart-index="${idx}">Xóa</button>
            </div>
        `;
    });
    totalEl.innerText = total.toLocaleString() + "đ";
}

function removeFromCart(index) {
    // Validate index
    if (typeof index !== 'number' || index < 0 || index >= cart.length) {
        console.error('Index không hợp lệ:', index);
        return;
    }
    cart.splice(index, 1);
    renderCart();
}

// 4. Đặt hàng
async function placeOrder() {
    if (cart.length === 0) return alert("Giỏ hàng trống!");
    
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        alert("Vui lòng đăng nhập lại!");
        logout();
        return;
    }
    
    const total = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
    
    try {
        const res = await fetch('/api/order', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ items: cart, total })
        });
        
        const data = await res.json();
        
        if (res.status === 401 || res.status === 403) {
            alert("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!");
            logout();
            return;
        }
        
        if (data.success) {
            alert("Đặt hàng thành công!");
            cart = [];
            renderCart();
        } else {
            alert(data.message || "Có lỗi xảy ra!");
        }
    } catch (err) {
        alert("Lỗi kết nối server!");
        console.error(err);
    }
}

// 5. Xem lịch sử
async function showHistory() {
    const authToken = localStorage.getItem('authToken');
    const currentUser = localStorage.getItem('currentUser');
    
    if (!authToken) {
        alert("Vui lòng đăng nhập lại!");
        logout();
        return;
    }
    
    if (!currentUser) {
        alert("Không tìm thấy thông tin người dùng!");
        logout();
        return;
    }
    
    try {
        const res = await fetch(`/api/history/${encodeURIComponent(currentUser)}`, {
            headers: getAuthHeaders()
        });
        
        if (res.status === 401 || res.status === 403) {
            alert("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!");
            logout();
            return;
        }
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const orders = await res.json();
        const content = document.getElementById('historyContent');
        
        if (!content) {
            throw new Error('Không tìm thấy history content element');
        }
        
        content.innerHTML = '';

        if (!Array.isArray(orders) || orders.length === 0) {
            content.innerHTML = '<p class="text-center text-muted py-5">Chưa có đơn hàng nào.</p>';
        } else {
            orders.forEach(order => {
                // Validate order data
                if (!order || !order.date || !Array.isArray(order.items)) {
                    console.error('Order không hợp lệ:', order);
                    return;
                }
                
                const date = new Date(order.date).toLocaleString('vi-VN');
                const itemsHtml = order.items.map(i => {
                    if (!i || !i.name) return '';
                    const safeName = escapeHtml(i.name);
                    const qty = i.qty || 0;
                    return `<li class="history-order-item"><i class="bi bi-check-circle-fill history-order-item-icon"></i>${safeName} (x${qty})</li>`;
                }).filter(Boolean).join('');
                
                const total = typeof order.total === 'number' ? order.total : 0;
                
                content.innerHTML += `
                    <div class="card mb-3 border-0 shadow-sm history-order-card">
                        <div class="card-header d-flex justify-content-between align-items-center history-order-header">
                            <span class="history-order-date"><i class="bi bi-calendar-event"></i> ${date}</span>
                            <span class="badge history-order-total">${total.toLocaleString()}đ</span>
                        </div>
                        <div class="card-body history-order-body">
                            <ul class="mb-0 history-order-items">${itemsHtml || '<li class="history-order-empty">Không có sản phẩm</li>'}</ul>
                        </div>
                    </div>
                `;
            });
        }
        
        const modalEl = document.getElementById('historyModal');
        if (modalEl && typeof bootstrap !== 'undefined') {
            const myModal = new bootstrap.Modal(modalEl);
            myModal.show();
        } else {
            console.error('Bootstrap modal không khả dụng');
        }
    } catch (err) {
        alert("Lỗi khi tải lịch sử: " + err.message);
        console.error('Show history error:', err);
    }
}
