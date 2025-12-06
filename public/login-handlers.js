// Event handlers for login.html - CSP compliant (no inline onclick)

document.addEventListener('DOMContentLoaded', function() {
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    
    if (btnLogin) {
        btnLogin.addEventListener('click', function() {
            auth('login');
        });
    }
    
    if (btnRegister) {
        btnRegister.addEventListener('click', function() {
            auth('register');
        });
    }
    
    // Allow Enter key to submit
    const loginUser = document.getElementById('loginUser');
    const loginPass = document.getElementById('loginPass');
    const regUser = document.getElementById('regUser');
    const regPass = document.getElementById('regPass');
    
    if (loginUser && loginPass) {
        [loginUser, loginPass].forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    auth('login');
                }
            });
        });
    }
    
    if (regUser && regPass) {
        [regUser, regPass].forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    auth('register');
                }
            });
        });
    }
});
