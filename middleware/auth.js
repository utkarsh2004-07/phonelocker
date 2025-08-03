const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Verify JWT Token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).populate('shop');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    // For web platform routes, only allow admin and superadmin
    // Mobile routes are handled separately
    if (!req.path.startsWith('/api/mobile') && user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Web platform access restricted to admin users only'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Shop ownership verification
const verifyShopOwnership = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const user = req.user;

    // Super admin can access all shops
    if (user.role === 'superadmin') {
      return next();
    }

    // Shop owner can only access their own shop
    if (user.role === 'shopowner') {
      if (!user.shop || user.shop._id.toString() !== shopId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own shop.'
        });
      }
    }

    // Regular users cannot access shop management endpoints
    if (user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Users cannot access shop management.'
      });
    }

    next();
  } catch (error) {
    console.error('Shop ownership verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during shop verification.'
    });
  }
};

// User access verification (users can only access their own data)
const verifyUserAccess = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    // Super admin can access all users
    if (currentUser.role === 'superadmin') {
      return next();
    }

    // Shop owners can access users in their shop
    if (currentUser.role === 'shopowner') {
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found.'
        });
      }

      if (targetUser.shop.toString() !== currentUser.shop._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access users in your shop.'
        });
      }
    }

    // Regular users can only access their own data
    if (currentUser.role === 'user') {
      if (currentUser._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own data.'
        });
      }
    }

    next();
  } catch (error) {
    console.error('User access verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user verification.'
    });
  }
};

// Activity logging middleware
const logActivity = (action, category, description) => {
  return async (req, res, next) => {
    try {
      // Store original res.json to intercept response
      const originalJson = res.json;
      
      res.json = function(data) {
        // Only log if the request was successful
        if (res.statusCode < 400) {
          ActivityLog.createLog({
            user: req.user?._id,
            shop: req.user?.shop?._id || req.user?.shop,
            action,
            description,
            category,
            performedBy: req.user?._id,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            metadata: {
              method: req.method,
              url: req.originalUrl,
              params: req.params,
              query: req.query
            }
          }).catch(error => {
            console.error('Error logging activity:', error);
          });
        }
        
        // Call original res.json
        originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Activity logging middleware error:', error);
      next();
    }
  };
};

module.exports = {
  generateToken,
  verifyToken,
  authorize,
  verifyShopOwnership,
  verifyUserAccess,
  logActivity
};
