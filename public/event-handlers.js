// Event handlers for index.html - CSP compliant (no inline onclick)

document.addEventListener('DOMContentLoaded', function() {
    // Navbar buttons
    const btnHistory = document.getElementById('btnHistory');
    const btnLogout = document.getElementById('btnLogout');
    
    if (btnHistory) {
        btnHistory.addEventListener('click', showHistory);
    }
    
    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }
    
    // Cart checkout button
    const btnPlaceOrder = document.getElementById('btnPlaceOrder');
    if (btnPlaceOrder) {
        btnPlaceOrder.addEventListener('click', placeOrder);
    }
    
    // Modal quantity buttons
    const btnDecrementQty = document.getElementById('btnDecrementQty');
    const btnIncrementQty = document.getElementById('btnIncrementQty');
    const btnConfirmAddToCart = document.getElementById('btnConfirmAddToCart');
    
    if (btnDecrementQty) {
        btnDecrementQty.addEventListener('click', decrementQty);
    }
    
    if (btnIncrementQty) {
        btnIncrementQty.addEventListener('click', incrementQty);
    }
    
    if (btnConfirmAddToCart) {
        btnConfirmAddToCart.addEventListener('click', confirmAddToCart);
    }

    // Event delegation for dynamically generated buttons
    // "Thêm vào giỏ" buttons in product cards
    document.body.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('btn-add-cart')) {
            const productId = e.target.getAttribute('data-product-id');
            if (productId) {
                addToCart(productId);
            }
        }
    });

    // "Xóa" buttons in cart items
    document.body.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('btn-remove-cart')) {
            const cartIndex = parseInt(e.target.getAttribute('data-cart-index'), 10);
            if (!isNaN(cartIndex)) {
                removeFromCart(cartIndex);
            }
        }
    });
});
