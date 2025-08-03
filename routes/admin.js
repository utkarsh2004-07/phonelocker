const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const {
  verifyToken,
  authorize,
  logActivity
} = require('../middleware/auth');
const {
  validatePagination,
  validateObjectId
} = require('../middleware/validation');

// Apply authentication to all routes
router.use(verifyToken);

// Dashboard statistics (superadmin and shop owners)
router.get('/dashboard',
  authorize('superadmin', 'shopowner'),
  logActivity('dashboard_viewed', 'admin', 'Viewed admin dashboard'),
  async (req, res) => {
    try {
      const currentUser = req.user;
      let filter = {};

      // Apply shop filter for shop owners
      if (currentUser.role === 'shopowner') {
        filter.shop = currentUser.shop._id;
      }

      // Get basic statistics
      const totalUsers = await User.countDocuments(
        currentUser.role === 'shopowner' ? { shop: currentUser.shop._id } : {}
      );
      
      const activeUsers = await User.countDocuments({
        ...filter,
        isActive: true
      });

      const totalDevices = await Device.countDocuments(filter);
      const lockedDevices = await Device.countDocuments({
        ...filter,
        'lockStatus.isLocked': true
      });

      const totalShops = currentUser.role === 'superadmin' 
        ? await Shop.countDocuments({})
        : 1;

      // Get recent activities
      const recentActivities = await ActivityLog.find(
        currentUser.role === 'shopowner' ? { shop: currentUser.shop._id } : {}
      )
        .populate('performedBy', 'name')
        .populate('user', 'name phone')
        .sort({ createdAt: -1 })
        .limit(10);

      // Get user statistics by role
      const usersByRole = await User.aggregate([
        ...(currentUser.role === 'shopowner' ? [{ $match: { shop: currentUser.shop._id } }] : []),
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get device status breakdown
      const deviceStatusBreakdown = await Device.aggregate([
        ...(currentUser.role === 'shopowner' ? [{ $match: { shop: currentUser.shop._id } }] : []),
        {
          $group: {
            _id: '$lockStatus.isLocked',
            count: { $sum: 1 }
          }
        }
      ]);

      const statistics = {
        overview: {
          totalUsers,
          activeUsers,
          totalDevices,
          lockedDevices,
          totalShops
        },
        usersByRole: usersByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        deviceStatus: {
          locked: deviceStatusBreakdown.find(item => item._id === true)?.count || 0,
          unlocked: deviceStatusBreakdown.find(item => item._id === false)?.count || 0
        },
        recentActivities
      };

      res.json({
        success: true,
        data: { statistics }
      });
    } catch (error) {
      console.error('Dashboard statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching dashboard statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get activity logs with pagination
router.get('/logs',
  authorize('superadmin', 'shopowner'),
  validatePagination,
  logActivity('logs_viewed', 'admin', 'Viewed activity logs'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        category = '',
        action = '',
        severity = '',
        startDate = '',
        endDate = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const currentUser = req.user;
      let filter = {};

      // Apply shop filter for shop owners
      if (currentUser.role === 'shopowner') {
        filter.shop = currentUser.shop._id;
      }

      // Add category filter
      if (category) {
        filter.category = category;
      }

      // Add action filter
      if (action) {
        filter.action = action;
      }

      // Add severity filter
      if (severity) {
        filter.severity = severity;
      }

      // Add date range filter
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          filter.createdAt.$lte = new Date(endDate);
        }
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder: sortOrder === 'desc' ? -1 : 1,
        populate: ['performedBy', 'user', 'shop', 'device']
      };

      const result = await ActivityLog.getLogsPaginated(filter, options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get activity logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching activity logs',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get system health status (superadmin only)
router.get('/system/health',
  authorize('superadmin'),
  logActivity('system_health_viewed', 'admin', 'Viewed system health'),
  async (req, res) => {
    try {
      const dbStatus = 'connected'; // You can implement actual DB health check
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      const health = {
        status: 'healthy',
        database: dbStatus,
        uptime: Math.floor(uptime),
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        },
        timestamp: new Date()
      };

      res.json({
        success: true,
        data: { health }
      });
    } catch (error) {
      console.error('System health error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while checking system health',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;
