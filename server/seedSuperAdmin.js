require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'admin', 'cashier'], default: 'superadmin' },
  isApproved: { type: Boolean, default: true }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

const seedSuperAdmin = async () => {
  try {
    // 1. Connect to MongoDB Atlas
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Atlas ku xirantay!");

    // 2. Hash Password from .env
    const hashedPassword = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 10);

    // 3. Create or Update Super-Admin
    const superAdmin = await User.findOneAndUpdate(
      { role: 'superadmin' },
      {
        username: process.env.SUPER_ADMIN_USERNAME,
        password: hashedPassword,
        role: 'superadmin',
        isApproved: true
      },
      { upsert: true, new: true }
    );

    console.log("----------------------------------------");
    console.log("🎉 Akoonka Super-Admin-ka Waa Diyaar!");
    console.log(`👤 Username: ${superAdmin.username}`);
    console.log(`🔑 Password: ${process.env.SUPER_ADMIN_PASSWORD}`);
    console.log("----------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error Seed SuperAdmin:", error);
    process.exit(1);
  }
};

seedSuperAdmin();
