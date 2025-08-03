const express = require('express');
const router = express.Router();
const {
  getShops,
  getShopById,
  createShop,
  updateShop,
  deleteShop,
  getShopStatistics
} = require('../controllers/shopController');
const {
  verifyToken,
  authorize,
  verifyShopOwnership,
  logActivity
} = require('../middleware/auth');
const {
  validateShopRegistration,
  validatePagination,
  validateObjectId
} = require('../middleware/validation');

// Apply authentication to all routes
router.use(verifyToken);

// Get all shops (superadmin only)
router.get('/',
  authorize('superadmin'),
  validatePagination,
  logActivity('shops_viewed', 'shop', 'Viewed shops list'),
  getShops
);

// Get single shop by ID
router.get('/:shopId',
  validateObjectId('shopId'),
  verifyShopOwnership,
  logActivity('shop_viewed', 'shop', 'Viewed shop details'),
  getShopById
);

// Create new shop (superadmin only)
router.post('/',
  authorize('superadmin'),
  validateShopRegistration,
  logActivity('shop_created', 'shop', 'Created new shop'),
  createShop
);

// Update shop
router.put('/:shopId',
  validateObjectId('shopId'),
  verifyShopOwnership,
  logActivity('shop_updated', 'shop', 'Updated shop'),
  updateShop
);

// Delete shop (superadmin only)
router.delete('/:shopId',
  authorize('superadmin'),
  validateObjectId('shopId'),
  logActivity('shop_deleted', 'shop', 'Deleted shop'),
  deleteShop
);

// Get shop statistics
router.get('/:shopId/statistics',
  validateObjectId('shopId'),
  verifyShopOwnership,
  logActivity('shop_stats_viewed', 'shop', 'Viewed shop statistics'),
  getShopStatistics
);

module.exports = router;
