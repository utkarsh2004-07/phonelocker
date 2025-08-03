const Shop = require('../models/Shop');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// Get all shops (superadmin only)
const getShops = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const currentUser = req.user;

    // Only superadmin can view all shops
    if (currentUser.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only superadmin can view all shops.'
      });
    }

    let filter = {};

    // Add search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'contactInfo.email': { $regex: search, $options: 'i' } },
        { 'contactInfo.phone': { $regex: search, $options: 'i' } }
      ];
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

    // Get shops with pagination
    const shops = await Shop.find(filter)
      .populate('owner', 'name email phone')
      .populate('createdBy', 'name')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Shop.countDocuments(filter);

    res.json({
      success: true,
      data: {
        shops,
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
    console.error('Get shops error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching shops',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get single shop by ID
const getShopById = async (req, res) => {
  try {
    const { shopId } = req.params;
    const currentUser = req.user;

    let filter = { _id: shopId };

    // Apply access control
    if (currentUser.role === 'shopowner') {
      if (currentUser.shop._id.toString() !== shopId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own shop.'
        });
      }
    }

    const shop = await Shop.findOne(filter)
      .populate('owner', 'name email phone')
      .populate('createdBy', 'name');

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Update statistics
    await shop.updateStatistics();

    res.json({
      success: true,
      data: { shop }
    });
  } catch (error) {
    console.error('Get shop by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching shop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create new shop
const createShop = async (req, res) => {
  try {
    const {
      name,
      description,
      ownerId,
      contactInfo,
      address,
      businessInfo,
      settings
    } = req.body;
    const currentUser = req.user;

    // Only superadmin can create shops
    if (currentUser.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only superadmin can create shops.'
      });
    }

    // Validate owner
    const owner = await User.findById(ownerId);
    if (!owner) {
      return res.status(400).json({
        success: false,
        message: 'Invalid owner ID'
      });
    }

    // Check if owner already has a shop
    const existingShop = await Shop.findOne({ owner: ownerId });
    if (existingShop) {
      return res.status(400).json({
        success: false,
        message: 'User already owns a shop'
      });
    }

    // Create shop
    const shopData = {
      name,
      description,
      owner: ownerId,
      contactInfo,
      address,
      businessInfo,
      settings,
      createdBy: currentUser._id
    };

    const shop = new Shop(shopData);
    await shop.save();

    // Update owner role to shopowner
    owner.role = 'shopowner';
    owner.shop = shop._id;
    await owner.save();

    // Log activity
    await ActivityLog.createLog({
      shop: shop._id,
      action: 'shop_created',
      description: `New shop created: ${name}`,
      category: 'shop',
      performedBy: currentUser._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Shop created successfully',
      data: { shop }
    });
  } catch (error) {
    console.error('Create shop error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating shop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update shop
const updateShop = async (req, res) => {
  try {
    const { shopId } = req.params;
    const {
      name,
      description,
      contactInfo,
      address,
      businessInfo,
      settings,
      isActive
    } = req.body;
    const currentUser = req.user;

    // Find shop with access control
    let filter = { _id: shopId };
    if (currentUser.role === 'shopowner') {
      if (currentUser.shop._id.toString() !== shopId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only update your own shop.'
        });
      }
    }

    const shop = await Shop.findOne(filter);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Build update data
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (contactInfo) updateData.contactInfo = { ...shop.contactInfo, ...contactInfo };
    if (address) updateData.address = { ...shop.address, ...address };
    if (businessInfo) updateData.businessInfo = { ...shop.businessInfo, ...businessInfo };
    if (settings) updateData.settings = { ...shop.settings, ...settings };
    
    // Only superadmin can change active status
    if (typeof isActive === 'boolean' && currentUser.role === 'superadmin') {
      updateData.isActive = isActive;
    }

    // Update shop
    const updatedShop = await Shop.findByIdAndUpdate(
      shopId,
      updateData,
      { new: true, runValidators: true }
    ).populate('owner', 'name email phone');

    // Log activity
    await ActivityLog.createLog({
      shop: updatedShop._id,
      action: 'shop_updated',
      description: `Shop updated: ${updatedShop.name}`,
      category: 'shop',
      performedBy: currentUser._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Shop updated successfully',
      data: { shop: updatedShop }
    });
  } catch (error) {
    console.error('Update shop error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating shop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete shop
const deleteShop = async (req, res) => {
  try {
    const { shopId } = req.params;
    const currentUser = req.user;

    // Only superadmin can delete shops
    if (currentUser.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only superadmin can delete shops.'
      });
    }

    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Delete all users associated with the shop
    await User.deleteMany({ shop: shopId });

    // Delete the shop
    await Shop.findByIdAndDelete(shopId);

    // Log activity
    await ActivityLog.createLog({
      shop: shopId,
      action: 'shop_deleted',
      description: `Shop deleted: ${shop.name}`,
      category: 'shop',
      performedBy: currentUser._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Shop deleted successfully'
    });
  } catch (error) {
    console.error('Delete shop error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting shop',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get shop statistics
const getShopStatistics = async (req, res) => {
  try {
    const { shopId } = req.params;
    const currentUser = req.user;

    // Apply access control
    if (currentUser.role === 'shopowner') {
      if (currentUser.shop._id.toString() !== shopId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own shop statistics.'
        });
      }
    }

    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Update and get latest statistics
    await shop.updateStatistics();

    // Get additional statistics
    const users = await User.find({ shop: shopId });
    const recentActivities = await ActivityLog.find({ shop: shopId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name');

    const statistics = {
      ...shop.statistics,
      recentActivities,
      userBreakdown: {
        total: users.length,
        active: users.filter(u => u.isActive).length,
        inactive: users.filter(u => !u.isActive).length,
        lockedDevices: users.filter(u => u.deviceStatus.isLocked).length
      }
    };

    res.json({
      success: true,
      data: { statistics }
    });
  } catch (error) {
    console.error('Get shop statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching shop statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getShops,
  getShopById,
  createShop,
  updateShop,
  deleteShop,
  getShopStatistics
};
