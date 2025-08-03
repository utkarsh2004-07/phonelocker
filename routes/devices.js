const express = require('express');
const router = express.Router();
const {
  getDevices,
  getDeviceById,
  registerDevice,
  lockDevice,
  unlockDevice,
  bulkLockDevices,
  bulkUnlockDevices
} = require('../controllers/deviceController');
const {
  verifyToken,
  authorize,
  logActivity
} = require('../middleware/auth');
const {
  validateDeviceRegistration,
  validatePagination,
  validateObjectId
} = require('../middleware/validation');

// Apply authentication to all routes
router.use(verifyToken);

// Get all devices (with pagination and filtering)
router.get('/',
  validatePagination,
  logActivity('devices_viewed', 'device', 'Viewed devices list'),
  getDevices
);

// Get single device by ID
router.get('/:deviceId',
  validateObjectId('deviceId'),
  logActivity('device_viewed', 'device', 'Viewed device details'),
  getDeviceById
);

// Register new device
router.post('/register',
  validateDeviceRegistration,
  logActivity('device_registered', 'device', 'Registered new device'),
  registerDevice
);

// Lock device (shop owners and superadmin only)
router.post('/:deviceId/lock',
  authorize('shopowner', 'superadmin'),
  validateObjectId('deviceId'),
  logActivity('device_locked', 'device', 'Locked device'),
  lockDevice
);

// Unlock device (shop owners and superadmin only)
router.post('/:deviceId/unlock',
  authorize('shopowner', 'superadmin'),
  validateObjectId('deviceId'),
  logActivity('device_unlocked', 'device', 'Unlocked device'),
  unlockDevice
);

// Bulk lock devices (shop owners and superadmin only)
router.post('/bulk/lock',
  authorize('shopowner', 'superadmin'),
  logActivity('bulk_lock', 'device', 'Bulk locked devices'),
  bulkLockDevices
);

// Bulk unlock devices (shop owners and superadmin only)
router.post('/bulk/unlock',
  authorize('shopowner', 'superadmin'),
  logActivity('bulk_unlock', 'device', 'Bulk unlocked devices'),
  bulkUnlockDevices
);

module.exports = router;
