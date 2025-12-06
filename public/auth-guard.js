// auth-guard.js - Login guard cho index.html
(function() {
    const currentUser = localStorage.getItem('currentUser');
    const authToken = localStorage.getItem('authToken');
    
    if (!currentUser || !authToken) {
        alert('Vui lòng đăng nhập để tiếp tục!');
        window.location.href = 'login.html';
        return;
    }
    
    // Cập nhật welcome message khi DOM ready
    window.addEventListener('DOMContentLoaded', function() {
        const welcomeMsg = document.getElementById('welcomeMsg');
        if (welcomeMsg && currentUser) {
            welcomeMsg.innerText = 'Xin chào, ' + currentUser + '!';
        }
        
        // Load sản phẩm
        if (typeof loadProducts === 'function') {
            loadProducts();
        } else {
            console.error('Function loadProducts không tồn tại!');
        }
    });
})();
