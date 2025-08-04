const Device = require('../models/Device');
const User = require('../models/User');
const Shop = require('../models/Shop');
const ActivityLog = require('../models/ActivityLog');

// Get all devices with pagination and filtering
const getDevices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      lockStatus = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const currentUser = req.user;
    let filter = {};

    // Apply access control
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    } else if (currentUser.role === 'user') {
      filter.user = currentUser._id;
    }
    // Superadmin can see all devices (no additional filter)

    // Add search filter
    if (search) {
      filter.$or = [
        { deviceId: { $regex: search, $options: 'i' } },
        { imeiNumber: { $regex: search, $options: 'i' } },
        { 'deviceInfo.brand': { $regex: search, $options: 'i' } },
        { 'deviceInfo.model': { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }

    // Add lock status filter
    if (lockStatus === 'locked') {
      filter['lockStatus.isLocked'] = true;
    } else if (lockStatus === 'unlocked') {
      filter['lockStatus.isLocked'] = false;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    // Get devices with pagination
    const devices = await Device.find(filter)
      .populate('user', 'name phone email')
      .populate('shop', 'name')
      .populate('lockStatus.lockedBy', 'name')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Device.countDocuments(filter);

    res.json({
      success: true,
      data: {
        devices,
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
    console.error('Get devices error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching devices',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get single device by ID
const getDeviceById = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const currentUser = req.user;

    let filter = { _id: deviceId };

    // Apply access control
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    } else if (currentUser.role === 'user') {
      filter.user = currentUser._id;
    }

    const device = await Device.findOne(filter)
      .populate('user', 'name phone email emiDetails')
      .populate('shop', 'name')
      .populate('lockStatus.lockedBy', 'name');

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    res.json({
      success: true,
      data: { device }
    });
  } catch (error) {
    console.error('Get device by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching device',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Register new device
const registerDevice = async (req, res) => {
  try {
    const { userId, deviceId, imeiNumber, deviceInfo } = req.body;
    const currentUser = req.user;

    // Find user
    const user = await User.findById(userId).populate('shop');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check access permissions
    if (currentUser.role === 'shopowner') {
      if (user.shop._id.toString() !== currentUser.shop._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. User not in your shop.'
        });
      }
    } else if (currentUser.role === 'user') {
      if (currentUser._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only register your own device.'
        });
      }
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

    // Create device
    const deviceData = {
      user: userId,
      shop: user.shop._id,
      deviceId,
      imeiNumber,
      deviceInfo: deviceInfo || {},
      connectionStatus: {
        isOnline: true,
        lastSeen: new Date(),
        lastHeartbeat: new Date()
      }
    };

    const device = new Device(deviceData);
    await device.save();

    // Update user's device information
    user.deviceId = deviceId;
    user.imeiNumber = imeiNumber;
    await user.save();

    // Update shop statistics
    if (user.shop) {
      await user.shop.updateStatistics();
    }

    // Log activity - Temporarily disabled
    // await ActivityLog.createLog({
    //   user: userId,
    //   shop: user.shop._id,
    //   device: device._id,
    //   action: 'device_registered',
    //   description: `Device registered: ${deviceId}`,
    //   category: 'device',
    //   performedBy: currentUser._id,
    //   ipAddress: req.ip,
    //   userAgent: req.get('User-Agent')
    // });

    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      data: { device }
    });
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while registering device',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Lock device
const lockDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { reason = 'emi_default' } = req.body;
    const currentUser = req.user;

    // Find device with access control
    let filter = { _id: deviceId };
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    } else if (currentUser.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Users cannot lock devices.'
      });
    }

    const device = await Device.findOne(filter).populate('user shop');
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    if (device.lockStatus.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'Device is already locked'
      });
    }

    // Lock the device
    await device.lockDevice(reason, currentUser._id);

    // Update user's device status
    const user = device.user;
    user.deviceStatus.isLocked = true;
    user.deviceStatus.lastLockedAt = new Date();
    user.deviceStatus.lockReason = reason;
    await user.save();

    // Update shop statistics
    await device.shop.updateStatistics();

    // Log activity - Temporarily disabled
    // await ActivityLog.createLog({
    //   user: device.user._id,
    //   shop: device.shop._id,
    //   device: device._id,
    //   action: 'device_locked',
    //   description: `Device locked: ${device.deviceId} (Reason: ${reason})`,
    //   category: 'device',
    //   performedBy: currentUser._id,
    //   ipAddress: req.ip,
    //   userAgent: req.get('User-Agent'),
    //   severity: 'medium'
    // });

    // Here you would typically send a real-time notification to the device
    // For now, we'll just emit a socket event (to be implemented with Socket.IO)
    
    // Prepare clean response data to avoid circular references
    const responseDevice = {
      _id: device._id,
      deviceId: device.deviceId,
      imeiNumber: device.imeiNumber,
      lockStatus: {
        isLocked: device.lockStatus.isLocked,
        lockedAt: device.lockStatus.lockedAt,
        lockReason: device.lockStatus.lockReason,
        lockedBy: device.lockStatus.lockedBy
      },
      connectionStatus: device.connectionStatus,
      security: device.security,
      isActive: device.isActive,
      user: {
        _id: device.user._id,
        name: device.user.name,
        phone: device.user.phone,
        deviceStatus: device.user.deviceStatus
      },
      shop: {
        _id: device.shop._id,
        name: device.shop.name
      },
      createdAt: device.createdAt,
      updatedAt: device.updatedAt
    };

    res.json({
      success: true,
      message: 'Device locked successfully',
      data: { device: responseDevice }
    });
  } catch (error) {
    console.error('Lock device error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while locking device',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Unlock device
const unlockDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const currentUser = req.user;

    // Find device with access control
    let filter = { _id: deviceId };
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    } else if (currentUser.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Users cannot unlock devices.'
      });
    }

    const device = await Device.findOne(filter).populate('user shop');
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    if (!device.lockStatus.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'Device is not locked'
      });
    }

    // Unlock the device
    await device.unlockDevice();

    // Update user's device status
    const user = device.user;
    user.deviceStatus.isLocked = false;
    user.deviceStatus.lastUnlockedAt = new Date();
    user.deviceStatus.lockReason = null;
    await user.save();

    // Update shop statistics
    await device.shop.updateStatistics();

    // Log activity - Temporarily disabled
    // await ActivityLog.createLog({
    //   user: device.user._id,
    //   shop: device.shop._id,
    //   device: device._id,
    //   action: 'device_unlocked',
    //   description: `Device unlocked: ${device.deviceId}`,
    //   category: 'device',
    //   performedBy: currentUser._id,
    //   ipAddress: req.ip,
    //   userAgent: req.get('User-Agent'),
    //   severity: 'low'
    // });

    // Prepare clean response data to avoid circular references
    const responseDevice = {
      _id: device._id,
      deviceId: device.deviceId,
      imeiNumber: device.imeiNumber,
      lockStatus: {
        isLocked: device.lockStatus.isLocked,
        unlockedAt: device.lockStatus.unlockedAt,
        lockReason: device.lockStatus.lockReason
      },
      connectionStatus: device.connectionStatus,
      security: device.security,
      isActive: device.isActive,
      user: {
        _id: device.user._id,
        name: device.user.name,
        phone: device.user.phone,
        deviceStatus: device.user.deviceStatus
      },
      shop: {
        _id: device.shop._id,
        name: device.shop.name
      },
      createdAt: device.createdAt,
      updatedAt: device.updatedAt
    };

    res.json({
      success: true,
      message: 'Device unlocked successfully',
      data: { device: responseDevice }
    });
  } catch (error) {
    console.error('Unlock device error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while unlocking device',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Bulk lock devices
const bulkLockDevices = async (req, res) => {
  try {
    const { deviceIds, reason = 'bulk_operation' } = req.body;
    const currentUser = req.user;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Device IDs array is required'
      });
    }

    // Check permissions
    if (currentUser.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Users cannot perform bulk operations.'
      });
    }

    let filter = { _id: { $in: deviceIds } };
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    }

    const devices = await Device.find(filter).populate('user shop');

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No devices found'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    // Process each device
    for (const device of devices) {
      try {
        if (!device.lockStatus.isLocked) {
          await device.lockDevice(reason, currentUser._id);

          // Update user's device status
          const user = device.user;
          user.deviceStatus.isLocked = true;
          user.deviceStatus.lastLockedAt = new Date();
          user.deviceStatus.lockReason = reason;
          await user.save();

          results.successful.push({
            deviceId: device._id,
            deviceName: device.deviceId,
            userName: user.name
          });

          // Log activity - Temporarily disabled
          // await ActivityLog.createLog({
          //   user: device.user._id,
          //   shop: device.shop._id,
          //   device: device._id,
          //   action: 'bulk_lock',
          //   description: `Device bulk locked: ${device.deviceId}`,
          //   category: 'device',
          //   performedBy: currentUser._id,
          //   ipAddress: req.ip,
          //   userAgent: req.get('User-Agent'),
          //   severity: 'medium'
          // });
        } else {
          results.failed.push({
            deviceId: device._id,
            deviceName: device.deviceId,
            reason: 'Already locked'
          });
        }
      } catch (error) {
        results.failed.push({
          deviceId: device._id,
          deviceName: device.deviceId,
          reason: error.message
        });
      }
    }

    // Update shop statistics for affected shops
    const shopIds = [...new Set(devices.map(d => d.shop._id.toString()))];
    for (const shopId of shopIds) {
      const shop = await Shop.findById(shopId);
      if (shop) {
        await shop.updateStatistics();
      }
    }

    res.json({
      success: true,
      message: `Bulk lock operation completed. ${results.successful.length} devices locked, ${results.failed.length} failed.`,
      data: results
    });
  } catch (error) {
    console.error('Bulk lock devices error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk lock operation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Bulk unlock devices
const bulkUnlockDevices = async (req, res) => {
  try {
    const { deviceIds } = req.body;
    const currentUser = req.user;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Device IDs array is required'
      });
    }

    // Check permissions
    if (currentUser.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Users cannot perform bulk operations.'
      });
    }

    let filter = { _id: { $in: deviceIds } };
    if (currentUser.role === 'shopowner') {
      filter.shop = currentUser.shop._id;
    }

    const devices = await Device.find(filter).populate('user shop');

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No devices found'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    // Process each device
    for (const device of devices) {
      try {
        if (device.lockStatus.isLocked) {
          await device.unlockDevice();

          // Update user's device status
          const user = device.user;
          user.deviceStatus.isLocked = false;
          user.deviceStatus.lastUnlockedAt = new Date();
          user.deviceStatus.lockReason = null;
          await user.save();

          results.successful.push({
            deviceId: device._id,
            deviceName: device.deviceId,
            userName: user.name
          });

          // Log activity - Temporarily disabled
          // await ActivityLog.createLog({
          //   user: device.user._id,
          //   shop: device.shop._id,
          //   device: device._id,
          //   action: 'bulk_unlock',
          //   description: `Device bulk unlocked: ${device.deviceId}`,
          //   category: 'device',
          //   performedBy: currentUser._id,
          //   ipAddress: req.ip,
          //   userAgent: req.get('User-Agent'),
          //   severity: 'low'
          // });
        } else {
          results.failed.push({
            deviceId: device._id,
            deviceName: device.deviceId,
            reason: 'Not locked'
          });
        }
      } catch (error) {
        results.failed.push({
          deviceId: device._id,
          deviceName: device.deviceId,
          reason: error.message
        });
      }
    }

    // Update shop statistics for affected shops
    const shopIds = [...new Set(devices.map(d => d.shop._id.toString()))];
    for (const shopId of shopIds) {
      const shop = await Shop.findById(shopId);
      if (shop) {
        await shop.updateStatistics();
      }
    }

    res.json({
      success: true,
      message: `Bulk unlock operation completed. ${results.successful.length} devices unlocked, ${results.failed.length} failed.`,
      data: results
    });
  } catch (error) {
    console.error('Bulk unlock devices error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk unlock operation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getDevices,
  getDeviceById,
  registerDevice,
  lockDevice,
  unlockDevice,
  bulkLockDevices,
  bulkUnlockDevices
};
