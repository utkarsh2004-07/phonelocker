const User = require('../models/User');
const Shop = require('../models/Shop');
const ActivityLog = require('../models/ActivityLog');
const { generateToken } = require('../middleware/auth');

// Register new shop owner (only shop owners can register on web platform)
const register = async (req, res) => {
  try {
    const {
      name,
      phone,
      password,
      email,
      shopName,
      shopId,
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

    // Check if shop ID already exists
    const existingShopById = await Shop.findOne({ shopId });
    if (existingShopById) {
      return res.status(400).json({
        success: false,
        message: 'Shop with this ID already exists'
      });
    }

    // Check if shop name already exists
    const existingShopByName = await Shop.findOne({ name: shopName });
    if (existingShopByName) {
      return res.status(400).json({
        success: false,
        message: 'Shop with this name already exists'
      });
    }

    // Create shop owner user
    const shopOwner = new User({
      name,
      email,
      phone,
      password, // Will be hashed by pre-save hook
      role: 'shopowner',
      isActive: true
    });

    await shopOwner.save();

    // Create shop
    const shop = new Shop({
      name: shopName,
      shopId,
      description: shopDescription || `${shopName} - EMI-based device sales`,
      owner: shopOwner._id,
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
      createdBy: shopOwner._id
    });

    await shop.save();

    // Update shop owner with shop reference
    shopOwner.shop = shop._id;
    shopOwner.createdBy = shopOwner._id;
    await shopOwner.save();

    // Log activity - Temporarily disabled
    // await ActivityLog.createLog({
    //   user: shopOwner._id,
    //   shop: shop._id,
    //   action: 'shop_created',
    //   description: `New shop owner registered: ${name} with shop: ${shopName}`,
    //   category: 'shop',
    //   performedBy: shopOwner._id,
    //   ipAddress: req.ip,
    //   userAgent: req.get('User-Agent')
    // });

    // Generate token
    const token = generateToken(shopOwner._id);

    res.status(201).json({
      success: true,
      message: 'Shop owner registered successfully',
      data: {
        user: {
          id: shopOwner._id,
          name: shopOwner.name,
          email: shopOwner.email,
          phone: shopOwner.phone,
          role: shopOwner.role,
          shop: {
            id: shop._id,
            name: shop.name,
            shopId: shop.shopId,
            description: shop.description
          }
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Find user by phone or email
    const query = identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier };

    const user = await User.findOne(query).populate('shop');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Log activity
    const logData = {
      user: user._id,
      action: 'user_login',
      description: `User logged in: ${user.name} (${user.phone || user.email})`,
      category: 'user',
      performedBy: user._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Only add shop if user has one
    if (user.shop) {
      logData.shop = user.shop._id;
    }

    // Temporarily disable ActivityLog to fix hanging issue
    // await ActivityLog.createLog(logData);

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('shop');
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, email, address, deviceId, imeiNumber } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (address) updateData.address = address;
    if (deviceId) updateData.deviceId = deviceId;
    if (imeiNumber) updateData.imeiNumber = imeiNumber;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).populate('shop');

    // Log activity - Temporarily disabled
    // await ActivityLog.createLog({
    //   user: user._id,
    //   shop: user.shop?._id,
    //   action: 'user_updated',
    //   description: `User profile updated: ${user.name}`,
    //   category: 'user',
    //   performedBy: user._id,
    //   ipAddress: req.ip,
    //   userAgent: req.get('User-Agent')
    // });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(userId);

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Log activity - Temporarily disabled
    // await ActivityLog.createLog({
    //   user: user._id,
    //   shop: user.shop,
    //   action: 'user_updated',
    //   description: 'Password changed',
    //   category: 'user',
    //   performedBy: user._id,
    //   ipAddress: req.ip,
    //   userAgent: req.get('User-Agent')
    // });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Logout user
const logout = async (req, res) => {
  try {
    // Log activity - Temporarily disabled
    // await ActivityLog.createLog({
    //   user: req.user._id,
    //   shop: req.user.shop?._id,
    //   action: 'user_logout',
    //   description: `User logged out: ${req.user.name}`,
    //   category: 'user',
    //   performedBy: req.user._id,
    //   ipAddress: req.ip,
    //   userAgent: req.get('User-Agent')
    // });

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  logout
};
