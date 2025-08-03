require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Shop = require('../models/Shop');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected for seeding...');
  } catch (error) {
    console.error('Database connection error:', error.message);
    process.exit(1);
  }
};

const clearDatabase = async () => {
  try {
    await User.deleteMany({});
    await Shop.deleteMany({});
    await Device.deleteMany({});
    await ActivityLog.deleteMany({});
    console.log('Database cleared successfully');
  } catch (error) {
    console.error('Error clearing database:', error);
  }
};

const seedData = async () => {
  try {
    console.log('Starting data seeding...');

    // Create Super Admin
    const superAdmin = new User({
      name: process.env.SUPER_ADMIN_NAME || 'Super Administrator',
      email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@emilocker.com',
      phone: '+1234567890',
      password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123',
      role: 'superadmin',
      isActive: true
    });
    await superAdmin.save();
    console.log('✅ Super Admin created');

    // Create Sample Shops and Shop Owners
    const shops = [];
    const shopOwners = [];

    for (let i = 1; i <= 3; i++) {
      // Create shop owner
      const shopOwner = new User({
        name: `Shop Owner ${i}`,
        email: `shop${i}@example.com`,
        phone: `+123456789${i}`,
        password: 'Shop123@',
        role: 'shopowner',
        isActive: true,
        createdBy: superAdmin._id
      });

      // Create shop
      const shop = new Shop({
        name: `Electronics Shop ${i}`,
        shopId: `shop_${i}_${Date.now()}`,
        description: `Sample electronics shop ${i} for EMI-based device sales`,
        owner: shopOwner._id,
        contactInfo: {
          email: `shop${i}@example.com`,
          phone: `+123456789${i}`,
          alternatePhone: `+987654321${i}`
        },
        address: {
          street: `${i}23 Main Street`,
          city: `City ${i}`,
          state: `State ${i}`,
          zipCode: `1234${i}`,
          country: 'India'
        },
        businessInfo: {
          registrationNumber: `REG${i}23456`,
          gstNumber: `GST${i}234567890`,
          panNumber: `PAN${i}23456`,
          businessType: 'electronics'
        },
        settings: {
          autoLockOnDefault: true,
          gracePeriodDays: 3,
          notificationEnabled: true,
          allowBulkOperations: true
        },
        isActive: true,
        createdBy: superAdmin._id
      });

      // Assign shop to shop owner
      shopOwner.shop = shop._id;
      
      await shopOwner.save();
      await shop.save();
      
      shops.push(shop);
      shopOwners.push(shopOwner);
    }
    console.log('✅ Sample shops and shop owners created');

    // Create Sample Users for each shop
    const users = [];
    const devices = [];

    for (let shopIndex = 0; shopIndex < shops.length; shopIndex++) {
      const shop = shops[shopIndex];
      const shopOwner = shopOwners[shopIndex];

      for (let userIndex = 1; userIndex <= 5; userIndex++) {
        const user = new User({
          name: `User ${shopIndex + 1}-${userIndex}`,
          email: `user${shopIndex + 1}-${userIndex}@example.com`,
          phone: `+91987654${shopIndex}${userIndex}${userIndex}`,
          password: 'User123@',
          role: 'user',
          shop: shop._id,
          deviceId: `DEV${shopIndex + 1}${userIndex}${Date.now().toString().slice(-4)}`,
          imeiNumber: `${shopIndex + 1}${userIndex}${Math.random().toString().slice(2, 15)}`.slice(0, 15),
          address: {
            street: `${userIndex}45 User Street`,
            city: `City ${shopIndex + 1}`,
            state: `State ${shopIndex + 1}`,
            zipCode: `5678${userIndex}`,
            country: 'India'
          },
          emiDetails: {
            totalAmount: 50000 + (userIndex * 10000),
            paidAmount: 10000 + (userIndex * 2000),
            monthlyEmi: 5000 + (userIndex * 500),
            dueDate: new Date(Date.now() + (userIndex * 7 * 24 * 60 * 60 * 1000)), // userIndex weeks from now
            nextDueDate: new Date(Date.now() + ((userIndex + 1) * 7 * 24 * 60 * 60 * 1000)),
            status: userIndex % 4 === 0 ? 'defaulted' : 'active'
          },
          deviceStatus: {
            isLocked: userIndex % 3 === 0, // Every 3rd user has locked device
            lastLockedAt: userIndex % 3 === 0 ? new Date() : null,
            lockReason: userIndex % 3 === 0 ? 'emi_default' : null
          },
          isActive: true,
          createdBy: shopOwner._id
        });

        await user.save();
        users.push(user);

        // Create device for user
        const device = new Device({
          user: user._id,
          shop: shop._id,
          deviceId: user.deviceId,
          imeiNumber: user.imeiNumber,
          deviceInfo: {
            brand: ['Samsung', 'Xiaomi', 'OnePlus', 'Realme', 'Vivo'][userIndex % 5],
            model: `Model ${userIndex}`,
            androidVersion: `${10 + (userIndex % 3)}.0`,
            appVersion: '1.0.0'
          },
          lockStatus: {
            isLocked: user.deviceStatus.isLocked,
            lockedAt: user.deviceStatus.lastLockedAt,
            lockReason: user.deviceStatus.lockReason,
            lockedBy: user.deviceStatus.isLocked ? shopOwner._id : null
          },
          connectionStatus: {
            isOnline: Math.random() > 0.3, // 70% chance of being online
            lastSeen: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Random time in last 24 hours
            lastHeartbeat: new Date(Date.now() - Math.random() * 60 * 60 * 1000), // Random time in last hour
            connectionType: ['wifi', 'mobile'][Math.floor(Math.random() * 2)]
          },
          security: {
            appInstalled: true,
            appTampered: Math.random() > 0.9, // 10% chance of tampering
            rootDetected: Math.random() > 0.95, // 5% chance of root
            lastSecurityCheck: new Date()
          },
          isActive: true
        });

        await device.save();
        devices.push(device);
      }

      // Update shop statistics
      await shop.updateStatistics();
    }
    console.log('✅ Sample users and devices created');

    // Create Sample Activity Logs
    const activities = [];
    const actionTypes = ['user_login', 'device_locked', 'device_unlocked', 'user_created', 'emi_payment'];
    
    for (let i = 0; i < 50; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const randomDevice = devices.find(d => d.user.toString() === randomUser._id.toString());
      const randomAction = actionTypes[Math.floor(Math.random() * actionTypes.length)];
      
      const activity = new ActivityLog({
        user: randomUser._id,
        shop: randomUser.shop,
        device: randomDevice ? randomDevice._id : null,
        action: randomAction,
        description: `Sample activity: ${randomAction} for ${randomUser.name}`,
        category: randomAction.includes('device') ? 'device' : 'user',
        performedBy: randomAction === 'user_login' ? randomUser._id : shopOwners.find(so => so.shop.toString() === randomUser.shop.toString())._id,
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Sample User Agent)',
        severity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random time in last 30 days
      });

      activities.push(activity);
    }

    await ActivityLog.insertMany(activities);
    console.log('✅ Sample activity logs created');

    console.log('\n🎉 Data seeding completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('='.repeat(50));
    console.log('🔑 Super Admin:');
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Password: ${process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123'}`);
    console.log('\n🏪 Shop Owners:');
    shopOwners.forEach((owner, index) => {
      console.log(`   Shop ${index + 1}: ${owner.email} / Shop123@`);
    });
    console.log('\n👤 Sample Users:');
    console.log('   Phone: +919876541* / User123@');
    console.log('   (Replace * with any digit from the seeded users)');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Error seeding data:', error);
  }
};

const main = async () => {
  await connectDB();
  await clearDatabase();
  await seedData();
  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
  process.exit(0);
};

main();
