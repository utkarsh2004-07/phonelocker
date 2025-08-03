const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const { verifyToken, authorize } = require('../middleware/auth');

// Apply authentication and superadmin authorization to all routes
router.use(verifyToken);
router.use(authorize('superadmin'));

// @route   GET /api/superadmin/admins
// @desc    Get all shop owners (admins) with their shop details and user counts
// @access  Private (SuperAdmin only)
router.get('/admins', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = { role: 'shopowner' };
    if (search) {
      searchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Get shop owners with their shop details
    const admins = await User.find(searchQuery)
      .populate({
        path: 'shop',
        select: 'name shopId description contactInfo address businessInfo isActive createdAt'
      })
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get user counts for each shop owner
    const adminsWithCounts = await Promise.all(
      admins.map(async (admin) => {
        const adminObj = admin.toObject();

        if (admin.shop) {
          // Count users in this shop
          const usersCount = await User.countDocuments({
            shop: admin.shop._id,
            role: 'user'
          });

          // Count devices in this shop
          const devicesCount = await Device.countDocuments({
            shop: admin.shop._id
          });

          adminObj.usersCount = usersCount;
          adminObj.devicesCount = devicesCount;
        } else {
          adminObj.usersCount = 0;
          adminObj.devicesCount = 0;
        }

        return adminObj;
      })
    );

    // Get total count for pagination
    const totalAdmins = await User.countDocuments(searchQuery);

    res.json({
      success: true,
      data: {
        admins: adminsWithCounts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalAdmins / limit),
          totalItems: totalAdmins,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching admins',
      error: error.message
    });
  }
});

// @route   GET /api/superadmin/admins/:adminId
// @desc    Get detailed information about a specific admin
// @access  Private (SuperAdmin only)
router.get('/admins/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findById(adminId)
      .populate({
        path: 'shop',
        select: 'name shopId description contactInfo address businessInfo isActive createdAt statistics'
      })
      .select('-password');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    if (admin.role !== 'shopowner') {
      return res.status(400).json({
        success: false,
        message: 'User is not a shop owner'
      });
    }

    // Get additional statistics
    let additionalStats = {};
    if (admin.shop) {
      const [usersCount, devicesCount, activeDevices, recentActivity] = await Promise.all([
        User.countDocuments({ shop: admin.shop._id, role: 'user' }),
        Device.countDocuments({ shop: admin.shop._id }),
        Device.countDocuments({ shop: admin.shop._id, isActive: true }),
        ActivityLog.find({ shop: admin.shop._id })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate('user', 'name phone')
      ]);

      additionalStats = {
        usersCount,
        devicesCount,
        activeDevices,
        recentActivity
      };
    }

    res.json({
      success: true,
      data: {
        admin: admin.toObject(),
        statistics: additionalStats
      }
    });
  } catch (error) {
    console.error('Get admin details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching admin details',
      error: error.message
    });
  }
});

// @route   DELETE /api/superadmin/admins/:adminId
// @desc    Delete a shop owner and their shop
// @access  Private (SuperAdmin only)
router.delete('/admins/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findById(adminId).populate('shop');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    if (admin.role !== 'shopowner') {
      return res.status(400).json({
        success: false,
        message: 'User is not a shop owner'
      });
    }

    // Delete all users in the shop
    if (admin.shop) {
      await User.deleteMany({ shop: admin.shop._id, role: 'user' });
      await Device.deleteMany({ shop: admin.shop._id });
      await ActivityLog.deleteMany({ shop: admin.shop._id });
      await Shop.findByIdAndDelete(admin.shop._id);
    }

    // Delete the admin user
    await User.findByIdAndDelete(adminId);

    // Log activity
    await ActivityLog.createLog({
      user: req.user._id,
      action: 'admin_deleted',
      description: `Shop owner deleted: ${admin.name} (${admin.email})`,
      category: 'admin',
      performedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Shop owner and associated data deleted successfully'
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting admin',
      error: error.message
    });
  }
});

// @route   GET /api/superadmin/dashboard/stats
// @desc    Get dashboard statistics for superadmin
// @access  Private (SuperAdmin only)
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalShops,
      totalDevices,
      activeDevices,
      totalShopOwners,
      recentActivity
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Shop.countDocuments(),
      Device.countDocuments(),
      Device.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'shopowner' }),
      ActivityLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('user', 'name email')
        .populate('shop', 'name')
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalShops,
        totalDevices,
        activeDevices,
        totalShopOwners,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics',
      error: error.message
    });
  }
});

module.exports = router;
