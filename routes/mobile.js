const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Shop = require('../models/Shop');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const { verifyToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @route   GET /api/mobile/shops/search
// @desc    Search shops by name for mobile app
// @access  Public
router.get('/shops/search', [
  body('query').optional().trim().isLength({ min: 1 }).withMessage('Search query must not be empty')
], async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const shops = await Shop.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { 'contactInfo.email': { $regex: query, $options: 'i' } }
          ]
        }
      ]
    })
    .populate('owner', 'name email phone')
    .select('name description contactInfo address businessInfo')
    .limit(20);

    res.json({
      success: true,
      message: 'Shops retrieved successfully',
      data: {
        shops,
        count: shops.length
      }
    });
  } catch (error) {
    console.error('Shop search error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during shop search',
      error: error.message
    });
  }
});

// @route   POST /api/mobile/shopkeeper/register
// @desc    Register a new shopkeeper from mobile app
// @access  Public
router.post('/shopkeeper/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('phone').trim().isMobilePhone().withMessage('Please provide a valid phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('shopName').trim().notEmpty().withMessage('Shop name is required'),
  body('shopDescription').optional().trim(),
  body('businessInfo').optional().isObject(),
  body('address').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      name, 
      email, 
      phone, 
      password, 
      shopName, 
      shopDescription,
      businessInfo = {},
      address = {}
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone already exists'
      });
    }

    // Check if shop name already exists
    const existingShop = await Shop.findOne({ name: shopName });
    if (existingShop) {
      return res.status(400).json({
        success: false,
        message: 'Shop with this name already exists'
      });
    }

    // Create shopkeeper user
    const shopkeeper = new User({
      name,
      email,
      phone,
      password, // Will be hashed by pre-save hook
      role: 'shopowner',
      isActive: true,
      shop: null // Explicitly set to null for shopowners
    });

    await shopkeeper.save();

    // Create shop
    const shop = new Shop({
      name: shopName,
      shopId: `shop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Generate unique shop ID
      description: shopDescription || `${shopName} - EMI-based device sales`,
      owner: shopkeeper._id,
      contactInfo: {
        email,
        phone,
        alternatePhone: address.alternatePhone || ''
      },
      address: {
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        zipCode: address.zipCode || '',
        country: address.country || 'India'
      },
      businessInfo: {
        registrationNumber: businessInfo.registrationNumber || '',
        gstNumber: businessInfo.gstNumber || '',
        panNumber: businessInfo.panNumber || '',
        businessType: businessInfo.businessType || 'electronics'
      },
      isActive: true,
      createdBy: shopkeeper._id
    });

    await shop.save();

    // Update shopkeeper with shop reference
    shopkeeper.shop = shop._id;
    shopkeeper.createdBy = shopkeeper._id;
    await shopkeeper.save();

    // Generate token
    const token = generateToken(shopkeeper._id);

    // Log activity
    await ActivityLog.createLog({
      user: shopkeeper._id,
      shop: shop._id,
      action: 'shop_created',
      description: `New shop registered: ${shopName} by ${name}`,
      category: 'shop',
      performedBy: shopkeeper._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Shopkeeper and shop registered successfully',
      data: {
        user: {
          id: shopkeeper._id,
          name: shopkeeper.name,
          email: shopkeeper.email,
          phone: shopkeeper.phone,
          role: shopkeeper.role,
          shop: {
            id: shop._id,
            name: shop.name,
            description: shop.description
          }
        },
        token
      }
    });
  } catch (error) {
    console.error('Shopkeeper registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
});

// @route   POST /api/mobile/shopkeeper/login
// @desc    Login shopkeeper from mobile app
// @access  Public
router.post('/shopkeeper/login', [
  body('identifier').trim().notEmpty().withMessage('Email or phone is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { identifier, password } = req.body;

    // Find shopkeeper by email or phone
    const query = identifier.includes('@') 
      ? { email: identifier } 
      : { phone: identifier };
    
    const shopkeeper = await User.findOne({
      ...query,
      role: 'shopowner'
    }).populate('shop');

    if (!shopkeeper) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await shopkeeper.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if shopkeeper is active
    if (!shopkeeper.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Update last login
    shopkeeper.lastLogin = new Date();
    await shopkeeper.save();

    // Generate token
    const token = generateToken(shopkeeper._id);

    // Log activity
    const logData = {
      user: shopkeeper._id,
      action: 'user_login',
      description: `Shopkeeper logged in from mobile: ${shopkeeper.name}`,
      category: 'user',
      performedBy: shopkeeper._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    if (shopkeeper.shop) {
      logData.shop = shopkeeper.shop._id;
    }
    
    await ActivityLog.createLog(logData);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: shopkeeper._id,
          name: shopkeeper.name,
          email: shopkeeper.email,
          phone: shopkeeper.phone,
          role: shopkeeper.role,
          shop: shopkeeper.shop ? {
            id: shopkeeper.shop._id,
            name: shopkeeper.shop.name,
            description: shopkeeper.shop.description
          } : null
        },
        token
      }
    });
  } catch (error) {
    console.error('Shopkeeper login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

// @route   POST /api/mobile/users/register
// @desc    Register a new user by shopkeeper from mobile app
// @access  Private (Shopkeeper only)
router.post('/users/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').trim().isMobilePhone().withMessage('Please provide a valid phone number'),
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('deviceId').trim().notEmpty().withMessage('Device ID is required'),
  body('imeiNumber').trim().notEmpty().withMessage('IMEI number is required'),
  body('emiDetails').isObject().withMessage('EMI details are required'),
  body('address').optional().isObject()
], verifyToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Only shopkeepers can register users
    if (req.user.role !== 'shopowner') {
      return res.status(403).json({
        success: false,
        message: 'Only shopkeepers can register users'
      });
    }

    const { 
      name, 
      phone, 
      email,
      deviceId,
      imeiNumber,
      emiDetails,
      address = {}
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    // Check if device already exists
    const existingDevice = await Device.findOne({
      $or: [{ deviceId }, { imeiNumber }]
    });
    if (existingDevice) {
      return res.status(400).json({
        success: false,
        message: 'Device with this ID or IMEI already exists'
      });
    }

    // Create user with default password (phone number)
    const user = new User({
      name,
      phone,
      email: email || '',
      password: phone, // Default password is phone number
      role: 'user',
      shop: req.user.shop,
      deviceId,
      imeiNumber,
      address: {
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        zipCode: address.zipCode || '',
        country: address.country || 'India'
      },
      emiDetails: {
        totalAmount: emiDetails.totalAmount || 0,
        paidAmount: emiDetails.paidAmount || 0,
        remainingAmount: emiDetails.remainingAmount || emiDetails.totalAmount || 0,
        monthlyEmi: emiDetails.monthlyEmi || 0,
        dueDate: emiDetails.dueDate || new Date(),
        status: 'active'
      },
      isActive: true,
      createdBy: req.user._id
    });

    await user.save();

    // Create device record
    const device = new Device({
      deviceId,
      imeiNumber,
      user: user._id,
      shop: req.user.shop,
      isLocked: false,
      status: 'active',
      createdBy: req.user._id
    });

    await device.save();

    // Log activity
    await ActivityLog.createLog({
      user: user._id,
      shop: req.user.shop,
      device: device._id,
      action: 'user_created',
      description: `New user registered by shopkeeper: ${name} (${phone})`,
      category: 'user',
      performedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          deviceId: user.deviceId,
          imeiNumber: user.imeiNumber,
          emiDetails: user.emiDetails,
          defaultPassword: phone // Send default password to shopkeeper
        },
        device: {
          id: device._id,
          deviceId: device.deviceId,
          imeiNumber: device.imeiNumber,
          status: device.status
        }
      }
    });
  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user registration',
      error: error.message
    });
  }
});

module.exports = router;
