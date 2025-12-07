// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const app = express();
app.set('trust proxy', 1);
require('dotenv').config(); 

// --- BẢO MẬT: JWT SECRET ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('CRITICAL: JWT_SECRET phải được set trong .env và ít nhất 32 ký tự');
    console.error('Tạo secret mạnh: openssl rand -base64 32');
    process.exit(1);
}
const SALT_ROUNDS = 12;

// --- BẢO MẬT: Helmet với CSP an toàn ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// --- BẢO MẬT: Rate Limiting (Chống brute force) ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 5, // Tối đa 5 lần thử
    message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ 
            success: false, 
            message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút." 
        });
    }
});

// Rate limiter riêng cho đăng ký (nghiêm ngặt hơn)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 giờ
    max: 3, // Chỉ 3 lần đăng ký mỗi giờ từ 1 IP
    message: "Quá nhiều lần đăng ký. Vui lòng thử lại sau 1 giờ.",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ 
            success: false, 
            message: "Quá nhiều lần đăng ký từ IP này. Vui lòng thử lại sau 1 giờ." 
        });
    }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 requests mỗi 15 phút
    message: "Quá nhiều yêu cầu từ IP này.",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ 
            success: false, 
            message: "Quá nhiều yêu cầu từ IP này." 
        });
    }
});

// --- CẤU HÌNH CORS ---
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    console.error('CRITICAL: ALLOWED_ORIGINS phải được set trong production');
    console.error('Ví dụ: ALLOWED_ORIGINS=https://yourdomain.com');
    process.exit(1);
}

app.use(cors({
    origin: (origin, callback) => {
        // CHỈ cho phép no-origin trong development (Postman testing)
        if (!origin) {
            if (process.env.NODE_ENV === 'production') {
                console.warn('SECURITY: Blocked request with no origin in production');
                return callback(new Error('Origin required in production'));
            }
            // Development: cho phép Postman/curl testing
            return callback(null, true);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ 
    limit: '10kb',
    strict: true, // CHỈ chấp nhận object/array hợp lệ
    verify: (req, res, buf, encoding) => {
        // Kiểm tra payload có chứa ký tự nguy hiểm
        const dangerousPatterns = [
            /\$where/gi,
            /\$regex/gi, 
            /<script/gi,
            /<iframe/gi,
            /javascript:/gi,
            /on\w+\s*=/gi, // onclick=, onerror=, etc.
            /<!ENTITY/gi, // XXE attack
            /<!DOCTYPE/gi // XXE attack
        ];
        
        const payload = buf.toString(encoding || 'utf8');
        for (const pattern of dangerousPatterns) {
            if (pattern.test(payload)) {
                console.warn(`SECURITY ALERT: Dangerous payload detected from IP ${req.ip}`);
                console.warn(`Pattern matched: ${pattern}`);
                console.warn(`Payload snippet: ${payload.substring(0, 200)}`);
                throw new Error('Invalid request payload');
            }
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// --- BẢO MẬT: ADVANCED NoSQL Injection + Prototype Pollution Prevention ---
app.use((req, res, next) => {
    const sanitize = (obj, depth = 0) => {
        // Chống recursive attack (depth bomb)
        if (depth > 10) {
            console.warn('SECURITY: Deep nested object detected - possible attack');
            return null;
        }
        
        if (obj && typeof obj === 'object') {
            // CHỐNG PROTOTYPE POLLUTION
            const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
            
            Object.keys(obj).forEach(key => {
                try {
                    // Chống NoSQL Injection operators
                    if (key.startsWith('$') || key.includes('.')) {
                        console.warn(`SECURITY: NoSQL injection attempt - key: ${key}`);
                        delete obj[key];
                        return;
                    }
                    
                    // Chống Prototype Pollution
                    if (dangerousKeys.includes(key.toLowerCase())) {
                        console.warn(`SECURITY: Prototype pollution attempt - key: ${key}`);
                        delete obj[key];
                        return;
                    }
                    
                    // Recursive sanitize
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                        obj[key] = sanitize(obj[key], depth + 1);
                    }
                    
                    // Chống Path Traversal trong string values
                    if (typeof obj[key] === 'string') {
                        if (obj[key].includes('../') || obj[key].includes('..\\')) {
                            console.warn(`SECURITY: Path traversal attempt - value: ${obj[key]}`);
                            obj[key] = obj[key].replace(/\.\.[\/\\]/g, '');
                        }
                    }
                } catch (err) {
                    console.warn('Cannot sanitize property:', key, err.message);
                }
            });
        }
        return obj;
    };
    
    // Sanitize body, query, params
    if (req.body && typeof req.body === 'object') {
        req.body = sanitize(req.body);
    }
    
    // Query và params có thể có NoSQL injection qua URL
    if (req.query && typeof req.query === 'object') {
        Object.keys(req.query).forEach(key => {
            if (key.startsWith('$') || key.includes('.')) {
                console.warn(`SECURITY: NoSQL injection in query - key: ${key}`);
                delete req.query[key];
            }
        });
    }
    
    next();
});

// --- BẢO MẬT: Chống Command Injection, SSRF, XXE ---
app.use((req, res, next) => {
    const commandInjectionPatterns = [
        /;.*?(\||&|`|\$\()/gi, // Shell commands
        /\|\s*(cat|ls|wget|curl|nc|bash|sh|powershell|cmd)/gi,
        /&&\s*(rm|del|format|shutdown)/gi,
        /`.*`/g, // Backticks
        /\$\(.*\)/g, // Command substitution
        /\|\|/g, // OR operator
        />\s*\/dev/gi, // File redirection
        /<!--#exec/gi, // SSI injection
    ];
    
    const ssrfPatterns = [
        /localhost|127\.0\.0\.1|0\.0\.0\.0/gi,
        /192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\./gi, // Private IPs
        /metadata\.google\.internal/gi, // Cloud metadata
        /169\.254\.169\.254/gi, // AWS metadata
    ];
    
    const checkValue = (value) => {
        if (typeof value !== 'string') return;
        
        // Check command injection
        for (const pattern of commandInjectionPatterns) {
            if (pattern.test(value)) {
                console.warn(`SECURITY ALERT: Command injection attempt detected`);
                console.warn(`Value: ${value.substring(0, 100)}`);
                console.warn(`IP: ${req.ip}, URL: ${req.url}`);
                throw new Error('Invalid input detected');
            }
        }
        
        // Check SSRF
        for (const pattern of ssrfPatterns) {
            if (pattern.test(value)) {
                console.warn(`SECURITY ALERT: SSRF attempt detected`);
                console.warn(`Value: ${value.substring(0, 100)}`);
                console.warn(`IP: ${req.ip}`);
                throw new Error('Invalid input detected');
            }
        }
    };
    
    try {
        // Check all string values in body
        if (req.body && typeof req.body === 'object') {
            const checkObject = (obj) => {
                for (const key in obj) {
                    if (typeof obj[key] === 'string') {
                        checkValue(obj[key]);
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        checkObject(obj[key]);
                    }
                }
            };
            checkObject(req.body);
        }
        
        // Check query params
        if (req.query && typeof req.query === 'object') {
            for (const key in req.query) {
                checkValue(req.query[key]);
            }
        }
        
        // Check URL params
        if (req.params && typeof req.params === 'object') {
            for (const key in req.params) {
                checkValue(req.params[key]);
            }
        }
        
        next();
    } catch (err) {
        return res.status(400).json({ 
            success: false, 
            message: 'Request bị chặn vì vi phạm chính sách bảo mật' 
        });
    }
});

// --- BẢO MẬT: Chống SQL Injection (Defense in Depth) ---
app.use((req, res, next) => {
    const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi,
        /'.*?OR.*?'.*?=/gi,
        /1=1|1='1/gi,
        /;.*?--|\/\*.*?\*\//gi,
        /xp_cmdshell|sp_executesql/gi
    ];
    
    const checkForSQL = (value) => {
        if (typeof value !== 'string') return false;
        return sqlPatterns.some(pattern => pattern.test(value));
    };
    
    const scanObject = (obj) => {
        for (const key in obj) {
            if (typeof obj[key] === 'string' && checkForSQL(obj[key])) {
                console.warn(`SECURITY: SQL injection attempt - key: ${key}, value: ${obj[key].substring(0, 50)}`);
                return true;
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (scanObject(obj[key])) return true;
            }
        }
        return false;
    };
    
    if (req.body && scanObject(req.body)) {
        console.warn(`SQL Injection blocked from IP: ${req.ip}`);
        return res.status(400).json({ 
            success: false, 
            message: 'Request bị chặn vì chứa nội dung không hợp lệ' 
        });
    }
    
    next();
});

// --- BẢO MẬT: Hide server info ---
app.disable('x-powered-by');

// --- BẢO MẬT: Force HTTPS trong production ---
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
            return res.redirect(301, `https://${req.hostname}${req.url}`);
        }
        next();
    });
}

// --- BẢO MẬT: Prevent cache sensitive data ---
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// --- BẢO MẬT: Request Logging cho Security Monitoring ---
app.use((req, res, next) => {
    const start = Date.now();
    
    // Log khi response hoàn tất
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            timestamp: new Date().toISOString(),
            ip: req.ip || req.connection.remoteAddress,
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('user-agent') || 'Unknown'
        };
        
        // Log suspicious activities
        if (res.statusCode >= 400) {
            if (res.statusCode === 401 || res.statusCode === 403) {
                console.warn(`[AUTH FAILED] ${JSON.stringify(logData)}`);
            } else if (res.statusCode === 429) {
                console.warn(`[RATE LIMIT] ${JSON.stringify(logData)}`);
            } else if (res.statusCode >= 400 && res.statusCode < 500) {
                console.warn(`[CLIENT ERROR] ${JSON.stringify(logData)}`);
            } else if (res.statusCode >= 500) {
                console.error(`[SERVER ERROR] ${JSON.stringify(logData)}`);
            }
        }
    });
    
    next();
});

app.use(express.static('public')); 

// --- KẾT NỐI MONGODB ATLAS ---
const MONGO_URI = process.env.MONGO_URI; 
if (!MONGO_URI) {
    console.error("LỖI: Chưa cấu hình MONGO_URI trong file .env");
    process.exit(1); 
}

console.log("Đang kết nối MongoDB...");
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("Đã kết nối MongoDB Atlas thành công!");
        console.log("Database:", mongoose.connection.name);
    })
    .catch(err => {
        console.error("Lỗi kết nối MongoDB:", err.message);
        process.exit(1);
    });

// --- ĐỊNH NGHĨA DỮ LIỆU (SCHEMAS) ---
const UserSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: [true, 'Username là bắt buộc'],
        unique: true,
        trim: true,
        lowercase: true, // CHỮ THƯỜNG để tránh username enumeration
        minlength: [3, 'Username phải ít nhất 3 ký tự'],
        maxlength: [30, 'Username không quá 30 ký tự'],
        match: [/^[a-zA-Z0-9_]+$/, 'Username chỉ chứa chữ cái, số và _'],
        index: true // INDEX để tăng tốc query
    },
    password: { 
        type: String, 
        required: [true, 'Password là bắt buộc'],
        minlength: [8, 'Password phải ít nhất 8 ký tự'],
        validate: {
            validator: function(v) {
                // Ít nhất 1 chữ hoa, 1 chữ thường, 1 số, 1 ký tự đặc biệt
                return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/.test(v);
            },
            message: 'Password phải có ít nhất 1 chữ HOA, 1 chữ thường, 1 số và 1 ký tự đặc biệt (@$!%*?&#)'
        },
        select: false // KHÔNG TRẢ VỀ password trong query mặc định
    },
    failedLoginAttempts: { type: Number, default: 0 }, // CHỐNG BRUTE FORCE
    lockUntil: { type: Date }, // KHÓA TÀI KHOẢN TẠM THỜI
    createdAt: { type: Date, default: Date.now, index: true }
});

// INDEX compound để tăng tốc
UserSchema.index({ username: 1, createdAt: -1 });

// Hash password trước khi lưu
UserSchema.pre('save', async function() {
    if (!this.isModified('password')) return; 
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});


// Method so sánh password (TIMING-SAFE)
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method check account locked
UserSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method xử lý login failed
UserSchema.methods.incLoginAttempts = async function() {
    // Nếu đã khóa và hết thời gian khóa → reset
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { failedLoginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }
    
    const updates = { $inc: { failedLoginAttempts: 1 } };
    const maxAttempts = 5;
    const lockTime = 15 * 60 * 1000; // 15 phút
    
    // Khóa tài khoản sau 5 lần sai
    if (this.failedLoginAttempts + 1 >= maxAttempts && !this.isLocked()) {
        updates.$set = { lockUntil: Date.now() + lockTime };
    }
    
    return this.updateOne(updates);
};

// Method reset login attempts khi login thành công
UserSchema.methods.resetLoginAttempts = async function() {
    return this.updateOne({
        $set: { failedLoginAttempts: 0 },
        $unset: { lockUntil: 1 }
    });
};

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    type: { 
        type: String, 
        required: true,
        enum: ['food', 'drink']
    },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, required: true }
});

const OrderSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true, lowercase: true, index: true }, // INDEX
    items: [{ 
        _id: mongoose.Schema.Types.ObjectId,
        name: String,
        price: Number,
        qty: { type: Number, min: 1 }
    }],
    total: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now, index: true } // INDEX cho sort
});

// Compound index để tối ưu query history
OrderSchema.index({ username: 1, date: -1 });

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);

// --- MIDDLEWARE XÁC THỰC JWT ---
function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập!' });
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn!' });
            }
            
            // Validate decoded user data
            if (!user || !user.username || !user.userId) {
                return res.status(403).json({ success: false, message: 'Token không hợp lệ!' });
            }
            
            req.user = user;
            next();
        });
    } catch (err) {
        console.error("LỖI AUTHENTICATE:", err.message);
        return res.status(500).json({ success: false, message: 'Lỗi xác thực' });
    }
}

// --- VALIDATION HELPERS ---
function validateUsername(username) {
    if (!username || typeof username !== 'string') return false;
    username = username.trim();
    if (username.length < 3 || username.length > 30) return false;
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return false;
    // Không cho phép username toàn số
    if (/^\d+$/.test(username)) return false;
    
    // CHỐNG UNICODE/HOMOGRAPH ATTACKS
    // Chỉ cho phép ASCII characters (code 32-126)
    for (let i = 0; i < username.length; i++) {
        const code = username.charCodeAt(i);
        if ((code < 48 || code > 57) && // 0-9
            (code < 65 || code > 90) && // A-Z
            (code < 97 || code > 122) && // a-z
            code !== 95) { // _
            console.warn(`SECURITY: Non-ASCII character in username: ${username}`);
            return false;
        }
    }
    
    return true;
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 8 || password.length > 100) return false;
    // Không cho phép password toàn khoảng trắng
    if (password.trim().length === 0) return false;
    
    // YÊU CẦU PASSWORD MẠNH: 1 HOA + 1 thường + 1 số + 1 ký tự đặc biệt
    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[@$!%*?&#]/.test(password);
    
    if (!hasLowerCase || !hasUpperCase || !hasNumber || !hasSpecialChar) {
        return false; // KHÔNG đủ yêu cầu
    }
    
    // Chỉ cho phép các ký tự an toàn
    if (!/^[A-Za-z\d@$!%*?&#]+$/.test(password)) {
        return false; // Có ký tự không được phép
    }
    
    return true;
}

// Validate số nguyên dương an toàn
function validatePositiveInteger(value, min = 1, max = 999) {
    if (typeof value !== 'number') {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) return false;
        value = parsed;
    }
    return Number.isInteger(value) && value >= min && value <= max && isFinite(value);
}

// Validate giá tiền
function validatePrice(price, maxPrice = 999999999) {
    if (typeof price !== 'number') return false;
    return price >= 0 && price <= maxPrice && isFinite(price) && !isNaN(price);
}

// Validate total với overflow protection
function validateTotal(total, maxTotal = 999999999) {
    if (typeof total !== 'number') return false;
    return total >= 0 && total <= maxTotal && isFinite(total) && !isNaN(total);
}

// Sanitize string để chống XSS (defense in depth)
function sanitizeString(str, maxLength = 200) {
    if (typeof str !== 'string') return '';
    // Trim và giới hạn độ dài
    str = str.trim().substring(0, maxLength);
    // Loại bỏ các ký tự nguy hiểm
    str = str.replace(/[<>'"]/g, '');
    
    // CHỐNG NULL BYTE INJECTION
    str = str.replace(/\0/g, '');
    
    // CHỐNG CONTROL CHARACTERS
    str = str.replace(/[\x00-\x1F\x7F]/g, '');
    
    return str;
}

// CHỐNG REGEX DOS (ReDoS)
function isSafeInput(input, maxLength = 1000) {
    if (typeof input !== 'string') return true;
    
    // Giới hạn độ dài để tránh ReDoS
    if (input.length > maxLength) {
        console.warn(`SECURITY: Input too long (${input.length} chars)`);
        return false;
    }
    
    // Kiểm tra ký tự nguy hiểm cơ bản
    // KHÔNG test regex phức tạp vì có thể false positive
    const hasNullByte = input.includes('\0');
    if (hasNullByte) {
        console.warn(`SECURITY: Null byte detected in input`);
        return false;
    }
    
    return true;
}

// --- CÁC API XỬ LÝ ---

// 1. Đăng ký (dùng registerLimiter nghiêm ngặt hơn)
app.post('/api/register', registerLimiter, async (req, res) => {
    console.log('[REGISTER] Request nhận được:', { username: req.body.username });
    try {
        // Kiểm tra DB connection
        if (mongoose.connection.readyState !== 1) {
            console.error('[REGISTER] Database chưa kết nối! State:', mongoose.connection.readyState);
            return res.status(503).json({ 
                success: false, 
                message: "Database chưa sẵn sàng. Vui lòng thử lại sau." 
            });
        }

        let { username, password } = req.body;

        // Normalize username
        username = username ? username.trim().toLowerCase() : '';

        // CHỐNG ReDoS - Check trước khi validate
        if (!isSafeInput(username, 30) || !isSafeInput(password, 100)) {
            console.warn('[REGISTER] Unsafe input detected');
            return res.status(400).json({ 
                success: false, 
                message: "Dữ liệu đầu vào không hợp lệ" 
            });
        }

        // Validation
        if (!validateUsername(username)) {
            console.log('[REGISTER] Username không hợp lệ:', username);
            return res.status(400).json({ 
                success: false, 
                message: "Username phải từ 3-30 ký tự, chỉ chứa chữ cái, số và _, không toàn số" 
            });
        }

        if (!validatePassword(password)) {
            console.log('[REGISTER] Password không hợp lệ');
            return res.status(400).json({ 
                success: false, 
                message: "Password phải từ 8-100 ký tự, có ít nhất 1 chữ HOA, 1 chữ thường, 1 số và 1 ký tự đặc biệt (@$!%*?&#)" 
            });
        }

        // TIMING-SAFE: Luôn check username + delay ngẫu nhiên nhỏ
        const delay = Math.floor(Math.random() * 100);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Kiểm tra username đã tồn tại
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('[REGISTER] Username đã tồn tại:', username);
            return res.status(400).json({ 
                success: false, 
                message: "Tên đăng nhập đã tồn tại!" 
            });
        }

        const newUser = new User({ 
            username, 
            password 
        });
        await newUser.save();
        
        console.log('[REGISTER] Đăng ký thành công:', username);
        res.status(201).json({ success: true, message: "Đăng ký thành công!" });
    } catch (err) {
        console.error("[REGISTER] LỖI:", err.message);
        console.error("[REGISTER] Stack:", err.stack);
        
        // KHÔNG leak thông tin lỗi
        if (err.code === 11000) { // Duplicate key
            return res.status(400).json({ success: false, message: "Tên đăng nhập đã tồn tại!" });
        }
        
        res.status(500).json({ success: false, message: "Lỗi server khi đăng ký" });
    }
});

// 2. Đăng nhập
app.post('/api/login', loginLimiter, async (req, res) => {
    console.log('[LOGIN] Request nhận được:', { username: req.body.username });
    try {
        let { username, password } = req.body;
        
        // Normalize username
        username = username ? username.trim().toLowerCase() : '';
        
        // CHỐNG ReDoS - Check trước khi validate
        if (!isSafeInput(username, 30) || !isSafeInput(password, 100)) {
            console.warn('[LOGIN] Unsafe input detected');
            return res.status(401).json({ 
                success: false, 
                message: "Tài khoản hoặc mật khẩu không đúng!" 
            });
        }
        
        // Validation
        if (!validateUsername(username) || !validatePassword(password)) {
            console.log('[LOGIN] Validation failed');
            // GENERIC error message - CHỐNG USERNAME ENUMERATION
            return res.status(401).json({ 
                success: false, 
                message: "Tài khoản hoặc mật khẩu không đúng!" 
            });
        }

        // Kiểm tra kết nối database
        if (mongoose.connection.readyState !== 1) {
            throw new Error("Database chưa sẵn sàng");
        }

        // TIMING-SAFE: Delay ngẫu nhiên nhỏ
        const delay = Math.floor(Math.random() * 100);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Tìm user - PHẢI SELECT password vì đã set select: false
        const user = await User.findOne({ username }).select('+password');
        
        // CHỐNG USERNAME ENUMERATION: Luôn verify password dù user không tồn tại
        let isPasswordValid = false;
        
        if (user) {
            // CHECK ACCOUNT LOCKED
            if (user.isLocked()) {
                const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
                return res.status(423).json({ 
                    success: false, 
                    message: `Tài khoản đã bị khóa. Vui lòng thử lại sau ${lockTimeRemaining} phút.` 
                });
            }
            
            isPasswordValid = await user.comparePassword(password);
        } else {
            // Fake hash để timing giống nhau
            await bcrypt.compare(password, '$2b$12$fake.hash.to.prevent.timing.attack.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
        }
        
        if (!user || !isPasswordValid) {
            // Tăng failed attempts nếu user tồn tại
            if (user) {
                await user.incLoginAttempts();
            }
            
            // GENERIC error - KHÔNG CHO BIẾT user có tồn tại không
            return res.status(401).json({ 
                success: false, 
                message: "Tài khoản hoặc mật khẩu không đúng!" 
            });
        }

        // Reset failed attempts khi login thành công
        if (user.failedLoginAttempts > 0 || user.lockUntil) {
            await user.resetLoginAttempts();
        }

        // Tạo JWT token
        const token = jwt.sign(
            { username: user.username, userId: user._id },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('[LOGIN] Đăng nhập thành công:', username);
        res.json({ 
            success: true, 
            username: user.username,
            token: token
        });
    } catch (err) {
        console.error("[LOGIN] LỖI:", err.message);
        // GENERIC error message
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});


// 3. Lấy danh sách sản phẩm
app.get('/api/products', generalLimiter, async (req, res) => {
    try {
        console.log('[API] GET /api/products - Bắt đầu...');
        
        // Kiểm tra kết nối database
        const dbState = mongoose.connection.readyState;
        console.log(`[DB] Connection state: ${dbState} (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)`);
        
        if (dbState !== 1) {
            console.error(`[DB] Database không kết nối! State: ${dbState}`);
            return res.status(503).json({ 
                success: false, 
                message: "Database chưa sẵn sàng" 
            });
        }
        
        const products = await Product.find().select('-__v').lean();
        
        console.log(`[API] Tìm thấy ${products.length} sản phẩm`);
        
        // Validate products data
        if (!Array.isArray(products)) {
            throw new Error('Lỗi truy vấn sản phẩm - không phải array');
        }
        
        if (products.length === 0) {
            console.warn('[API] CẢNH BÁO: Không có sản phẩm nào trong database!');
            console.warn('[API] Vui lòng chạy: node seed.js');
        }
        
        res.json(products);
    } catch (err) {
        console.error("[API] LỖI GET PRODUCTS:", err.message);
        console.error("[API] Stack:", err.stack);
        res.status(500).json({ success: false, message: "Không thể tải sản phẩm" });
    }
});

// 4. Đặt hàng
app.post('/api/order', authenticateToken, generalLimiter, async (req, res) => {
    try {
        const { items, total } = req.body;
        const username = req.user.username.toLowerCase(); // NORMALIZE

        // Validation cơ bản
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Giỏ hàng trống!" 
            });
        }

        if (items.length > 100) {
            return res.status(400).json({ 
                success: false, 
                message: "Giỏ hàng không được vượt quá 100 sản phẩm!" 
            });
        }

        // VALIDATE TOTAL trước khi xử lý
        if (!validateTotal(total)) {
            return res.status(400).json({ 
                success: false, 
                message: "Tổng tiền không hợp lệ!" 
            });
        }

        // CHỐNG RACE CONDITION: Dùng Set để check duplicate
        const productIds = new Set();
        
        // Validate từng item
        const validatedItems = [];
        let calculatedTotal = 0;

        for (const item of items) {
            // Check required fields
            if (!item._id || !item.name || item.price === undefined || item.qty === undefined) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Dữ liệu sản phẩm không hợp lệ!" 
                });
            }

            // Validate _id format (MongoDB ObjectId)
            if (!mongoose.Types.ObjectId.isValid(item._id)) {
                return res.status(400).json({ 
                    success: false, 
                    message: `ID sản phẩm không hợp lệ: ${item._id}` 
                });
            }

            // CHECK DUPLICATE product trong cùng 1 order
            if (productIds.has(item._id)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Có sản phẩm trùng lặp trong giỏ hàng!" 
                });
            }
            productIds.add(item._id);

            // Validate price và qty TRƯỚC KHI dùng
            if (!validatePrice(item.price)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Giá sản phẩm không hợp lệ!" 
                });
            }

            if (!validatePositiveInteger(item.qty, 1, 999)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Số lượng phải từ 1-999!" 
                });
            }

            // Verify sản phẩm tồn tại trong database
            const product = await Product.findById(item._id).lean();
            if (!product) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Sản phẩm "${item.name}" không tồn tại!` 
                });
            }

            // Verify giá đúng
            if (Math.abs(product.price - item.price) > 0.01) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Giá sản phẩm "${item.name}" đã thay đổi! Vui lòng tải lại trang.` 
                });
            }

            const qty = parseInt(item.qty, 10);
            
            // DOUBLE CHECK qty sau khi parse
            if (!validatePositiveInteger(qty, 1, 999)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Số lượng phải từ 1-999!" 
                });
            }

            const itemTotal = product.price * qty;
            
            // CHECK OVERFLOW từng item với helper function
            if (!validateTotal(itemTotal)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Giá trị sản phẩm vượt quá giới hạn!" 
                });
            }

            validatedItems.push({
                _id: product._id,
                name: sanitizeString(product.name, 100), // SANITIZE name từ DB
                price: product.price,
                qty: qty
            });

            calculatedTotal += itemTotal;
        }

        // Verify tổng tiền (cho phép sai số nhỏ do floating point)
        if (Math.abs(calculatedTotal - total) > 0.01) {
            console.warn(`PRICE MANIPULATION: User ${username} sent total=${total}, calculated=${calculatedTotal}`);
            return res.status(400).json({ 
                success: false, 
                message: `Tổng tiền không khớp! Vui lòng tải lại trang.` 
            });
        }

        // Kiểm tra tổng tiền không quá lớn (chống overflow) với helper
        if (!validateTotal(calculatedTotal)) {
            return res.status(400).json({ 
                success: false, 
                message: "Tổng tiền vượt quá giới hạn cho phép!" 
            });
        }

        const newOrder = new Order({ 
            username, 
            items: validatedItems, 
            total: Math.round(calculatedTotal * 100) / 100 // ROUND 2 decimal
        });
        await newOrder.save();
        
        res.status(201).json({ success: true, message: "Đặt hàng thành công!" });
    } catch (err) {
        console.error("LỖI ORDER:", err.message);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ" });
        }
        res.status(500).json({ success: false, message: "Lỗi server khi đặt hàng" });
    }
});

// 5. Xem lịch sử
app.get('/api/history/:username', authenticateToken, generalLimiter, async (req, res) => {
    try {
        const requestedUsername = req.params.username.toLowerCase(); // NORMALIZE
        const loggedInUsername = req.user.username.toLowerCase(); // NORMALIZE

        // CHỐNG IDOR: Chỉ cho phép xem lịch sử của chính mình
        if (requestedUsername !== loggedInUsername) {
            // LOG suspicious activity
            console.warn(`IDOR ATTEMPT: User ${loggedInUsername} tried to access ${requestedUsername}'s history`);
            return res.status(403).json({ 
                success: false, 
                message: "Bạn không có quyền xem lịch sử này!" 
            });
        }

        // Validate username format
        if (!validateUsername(requestedUsername)) {
            return res.status(400).json({ 
                success: false, 
                message: "Username không hợp lệ!" 
            });
        }

        // PAGINATION để tránh load quá nhiều data
        // Validate query params không phải object (chống NoSQL injection)
        if (typeof req.query.page === 'object' || typeof req.query.limit === 'object') {
            return res.status(400).json({ 
                success: false, 
                message: "Query parameters không hợp lệ!" 
            });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
        const skip = (page - 1) * limit;
        
        // Validate parsed values
        if (page < 1 || !isFinite(page) || skip < 0 || !isFinite(skip)) {
            return res.status(400).json({ 
                success: false, 
                message: "Trang không hợp lệ!" 
            });
        }

        const orders = await Order.find({ username: requestedUsername })
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .select('-__v')
            .lean(); // LEAN để tăng performance
            
        res.json(orders);
    } catch (err) {
        console.error("LỖI HISTORY:", err.message);
        res.status(500).json({ success: false, message: "Không thể tải lịch sử" });
    }
});

// 404 Handler
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: "API không tồn tại" });
});

// Error Handler - PHẢI có 4 parameters
app.use((err, req, res, next) => {
    console.error("GLOBAL ERROR:", err.message);
    console.error("Stack:", err.stack);
    
    // Không leak thông tin lỗi chi tiết trong production
    const message = process.env.NODE_ENV === 'production' 
        ? 'Lỗi server' 
        : err.message;
    
    res.status(err.status || 500).json({ 
        success: false, 
        message: message 
    });
});

// Chạy server
app.listen(3000, () => {
    console.log('\n================================');
    console.log('Server đang chạy tại: http://localhost:3000');
    console.log('Bảo mật: JWT, bcrypt, rate limiting, validation');
    console.log('Test register: http://localhost:3000/login.html');
    console.log('================================\n');
});
