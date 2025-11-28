// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
require('dotenv').config(); 

// --- CẤU HÌNH ---
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// --- KẾT NỐI MONGODB ATLAS ---
const MONGO_URI = process.env.MONGO_URI; 
if (!MONGO_URI) {
    console.error("❌ Lỗi: Chưa cấu hình MONGO_URI trong file .env");
    process.exit(1); 
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Đã kết nối MongoDB Atlas"))
    .catch(err => console.error("❌ Lỗi kết nối:", err));

// --- ĐỊNH NGHĨA DỮ LIỆU (SCHEMAS) ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const ProductSchema = new mongoose.Schema({
    name: String,
    type: String, // 'food' hoặc 'drink'
    price: Number,
    image: String
});
const OrderSchema = new mongoose.Schema({
    username: String,
    items: Array,
    total: Number,
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);

// --- CÁC API XỬ LÝ ---

// 1. Đăng ký
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const newUser = new User({ username, password });
        await newUser.save();
        res.json({ success: true, message: "Đăng ký thành công!" });
    } catch (err) {
        res.json({ success: false, message: "Tên đăng nhập đã tồn tại!" });
    }
});

// 2. Đăng nhập
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) {
        res.json({ success: true, username: user.username });
    } else {
        res.json({ success: false, message: "Sai tài khoản hoặc mật khẩu!" });
    }
});

// 3. Lấy danh sách sản phẩm
app.get('/api/products', async (req, res) => {
    const products = await Product.find();
    res.json(products);
});

// 4. Đặt hàng
app.post('/api/order', async (req, res) => {
    const { username, items, total } = req.body;
    const newOrder = new Order({ username, items, total });
    await newOrder.save();
    res.json({ success: true });
});

// 5. Xem lịch sử
app.get('/api/history/:username', async (req, res) => {
    const orders = await Order.find({ username: req.params.username }).sort({ date: -1 });
    res.json(orders);
});

// Chạy server
app.listen(3000, () => {
    console.log('Server chạy tại: http://localhost:3000');
});