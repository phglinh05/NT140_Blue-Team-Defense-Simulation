// seed.js - Script để thêm dữ liệu mẫu vào database
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ['food', 'drink'] },
    price: { type: Number, required: true },
    image: { type: String, required: true }
});

const Product = mongoose.model('Product', ProductSchema);

const sampleProducts = [
    // ĐỒ ĂN
    {
        name: "Bánh mì thịt nướng",
        type: "food",
        price: 25000,
        image: "https://images.unsplash.com/photo-1598182198871-d3f4ab4fd181?w=400"
    },
    {
        name: "Phở bò đặc biệt",
        type: "food",
        price: 45000,
        image: "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=400"
    },
    {
        name: "Cơm gà xối mỡ",
        type: "food",
        price: 40000,
        image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400"
    },
    {
        name: "Bún bò Huế",
        type: "food",
        price: 42000,
        image: "https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400"
    },
    {
        name: "Pizza hải sản",
        type: "food",
        price: 85000,
        image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400"
    },
    {
        name: "Burger bò phô mai",
        type: "food",
        price: 55000,
        image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400"
    },
    {
        name: "Mì Ý sốt bò bằm",
        type: "food",
        price: 65000,
        image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400"
    },
    {
        name: "Gà rán giòn tan",
        type: "food",
        price: 75000,
        image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400"
    },
    
    // ĐỒ UỐNG
    {
        name: "Trà sữa trân châu đường đen",
        type: "drink",
        price: 30000,
        image: "https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=400"
    },
    {
        name: "Cà phê sữa đá",
        type: "drink",
        price: 25000,
        image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400"
    },
    {
        name: "Sinh tố bơ",
        type: "drink",
        price: 28000,
        image: "https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=400"
    },
    {
        name: "Nước ép cam tươi",
        type: "drink",
        price: 22000,
        image: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400"
    },
    {
        name: "Trà đào cam sả",
        type: "drink",
        price: 32000,
        image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400"
    },
    {
        name: "Matcha latte",
        type: "drink",
        price: 35000,
        image: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=400"
    }
];

async function seedDatabase() {
    try {
        console.log("Đang kết nối MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("Đã kết nối MongoDB!");

        // Xóa dữ liệu cũ
        console.log("Đang xóa dữ liệu cũ...");
        await Product.deleteMany({});
        console.log("Đã xóa dữ liệu cũ!");

        // Thêm dữ liệu mới
        console.log("Đang thêm sản phẩm mẫu...");
        await Product.insertMany(sampleProducts);
        console.log(`Đã thêm ${sampleProducts.length} sản phẩm!`);

        // Hiển thị danh sách
        const products = await Product.find();
        console.log("\nDANH SÁCH SẢN PHẨM:");
        products.forEach(p => {
            console.log(`  - ${p.name} (${p.type}): ${p.price.toLocaleString()}đ`);
        });

        console.log("\nHoàn tất! Server có thể sử dụng được.");
        process.exit(0);
    } catch (err) {
        console.error("LỖI:", err.message);
        process.exit(1);
    }
}

seedDatabase();
