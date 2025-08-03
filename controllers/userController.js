const User = require('../models/User');
const Shop = require('../models/Shop');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

// Get all users (with pagination and filtering)
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role = '',
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const currentUser = req.user;
    let filter = {};

    // Build filter based on user role
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
      filter.role = { $ne: 'superadmin' }; // Shop owners cannot see superadmins
    } else if (currentUser.role === 'user') {
      // Regular users can only see themselves
      filter._id = currentUser._id;
    }
    // Superadmin can see all users (no additional filter)

    // Add search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Add role filter
    if (role) {
      filter.role = role;
    }

    // Add status filter
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    // Get users with pagination
    const users = await User.find(filter)
      .populate('shop', 'name')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: page < Math.ceil(total / parseInt(limit)),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get single user by ID
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    let filter = { _id: userId };

    // Apply access control
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    } else if (currentUser.role === 'user') {
      if (currentUser._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    const user = await User.findOne(filter)
      .populate('shop')
      .populate('createdBy', 'name');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create new user
const createUser = async (req, res) => {
  try {
    const { name, phone, password, email, role, deviceId, imeiNumber, address, emiDetails } = req.body;
    const currentUser = req.user;

    // Check permissions
    if (currentUser.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Users cannot create other users.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    // Determine shop assignment
    let shopId;
    if (currentUser.role === 'superadmin') {
      // Superadmin can assign users to any shop or create shop owners
      shopId = req.body.shopId;
    } else if (currentUser.role === 'shopowner') {
      // Shop owners can only create users in their own shop
      shopId = currentUser.shop._id;
      if (role === 'shopowner' || role === 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Shop owners cannot create other shop owners or superadmins'
        });
      }
    }

    // Validate shop if required
    if (role !== 'superadmin' && !shopId) {
      return res.status(400).json({
        success: false,
        message: 'Shop assignment is required for non-superadmin users'
      });
    }

    let shop = null;
    if (shopId) {
      shop = await Shop.findById(shopId);
      if (!shop) {
        return res.status(400).json({
          success: false,
          message: 'Invalid shop ID'
        });
      }
    }

    // Create user
    const userData = {
      name,
      phone,
      password,
      role: role || 'user',
      ...(email && { email }),
      ...(shop && { shop: shop._id }),
      ...(deviceId && { deviceId }),
      ...(imeiNumber && { imeiNumber }),
      ...(address && { address }),
      ...(emiDetails && { emiDetails }),
      createdBy: currentUser._id
    };

    const user = new User(userData);
    await user.save();

    // Update shop statistics
    if (shop) {
      await shop.updateStatistics();
    }

    // Log activity
    await ActivityLog.createLog({
      user: user._id,
      shop: shop?._id,
      action: 'user_created',
      description: `New user created: ${name} (${phone})`,
      category: 'user',
      performedBy: currentUser._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, address, deviceId, imeiNumber, emiDetails, isActive } = req.body;
    const currentUser = req.user;

    // Find user with access control
    let filter = { _id: userId };
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    } else if (currentUser.role === 'user') {
      if (currentUser._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    const user = await User.findOne(filter);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Build update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (address) updateData.address = address;
    if (deviceId) updateData.deviceId = deviceId;
    if (imeiNumber) updateData.imeiNumber = imeiNumber;
    if (emiDetails) updateData.emiDetails = { ...user.emiDetails, ...emiDetails };
    if (typeof isActive === 'boolean' && currentUser.role !== 'user') {
      updateData.isActive = isActive;
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).populate('shop');

    // Update shop statistics if user status changed
    if (typeof isActive === 'boolean' && user.shop) {
      const shop = await Shop.findById(user.shop);
      if (shop) {
        await shop.updateStatistics();
      }
    }

    // Log activity
    await ActivityLog.createLog({
      user: updatedUser._id,
      shop: updatedUser.shop?._id,
      action: 'user_updated',
      description: `User updated: ${updatedUser.name}`,
      category: 'user',
      performedBy: currentUser._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    // Check permissions
    if (currentUser.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Users cannot delete accounts.'
      });
    }

    // Find user with access control
    let filter = { _id: userId };
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    }

    const user = await User.findOne(filter);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deletion of superadmin by shop owners
    if (currentUser.role === 'shopowner' && user.role === 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Cannot delete superadmin.'
      });
    }

    // Delete associated devices
    await Device.deleteMany({ user: userId });

    // Delete user
    await User.findByIdAndDelete(userId);

    // Update shop statistics
    if (user.shop) {
      const shop = await Shop.findById(user.shop);
      if (shop) {
        await shop.updateStatistics();
      }
    }

    // Log activity
    await ActivityLog.createLog({
      user: userId,
      shop: user.shop,
      action: 'user_deleted',
      description: `User deleted: ${user.name} (${user.phone})`,
      category: 'user',
      performedBy: currentUser._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
