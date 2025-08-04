const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: [true, 'Shop is required']
  },
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    trim: true
  },
  imeiNumber: {
    type: String,
    required: [true, 'IMEI number is required'],
    trim: true,
    validate: {
      validator: function(imei) {
        return /^\d{15}$/.test(imei);
      },
      message: 'IMEI must be 15 digits'
    }
  },
  deviceInfo: {
    brand: {
      type: String,
      trim: true
    },
    model: {
      type: String,
      trim: true
    },
    androidVersion: {
      type: String,
      trim: true
    },
    appVersion: {
      type: String,
      trim: true
    },
    lastKnownLocation: {
      latitude: Number,
      longitude: Number,
      address: String,
      timestamp: Date
    }
  },
  lockStatus: {
    isLocked: {
      type: Boolean,
      default: false
    },
    lockedAt: Date,
    unlockedAt: Date,
    lockReason: {
      type: String,
      enum: ['emi_default', 'manual_lock', 'suspicious_activity', 'maintenance'],
      default: 'emi_default'
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  connectionStatus: {
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: Date,
    lastHeartbeat: Date,
    connectionType: {
      type: String,
      enum: ['wifi', 'mobile', 'offline'],
      default: 'offline'
    }
  },
  security: {
    appInstalled: {
      type: Boolean,
      default: true
    },
    appTampered: {
      type: Boolean,
      default: false
    },
    rootDetected: {
      type: Boolean,
      default: false
    },
    lastSecurityCheck: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
deviceSchema.index({ user: 1 });
deviceSchema.index({ shop: 1 });
deviceSchema.index({ deviceId: 1 }, { unique: true });
deviceSchema.index({ imeiNumber: 1 }, { unique: true });
deviceSchema.index({ 'lockStatus.isLocked': 1 });
deviceSchema.index({ 'connectionStatus.isOnline': 1 });

// Update last seen when device comes online
deviceSchema.methods.updateLastSeen = function() {
  this.connectionStatus.lastSeen = new Date();
  this.connectionStatus.lastHeartbeat = new Date();
  this.connectionStatus.isOnline = true;
  return this.save();
};

// Lock device method
deviceSchema.methods.lockDevice = function(reason, lockedBy) {
  this.lockStatus.isLocked = true;
  this.lockStatus.lockedAt = new Date();
  this.lockStatus.lockReason = reason || 'emi_default';
  this.lockStatus.lockedBy = lockedBy;
  return this.save();
};

// Unlock device method
deviceSchema.methods.unlockDevice = function() {
  this.lockStatus.isLocked = false;
  this.lockStatus.unlockedAt = new Date();
  return this.save();
};

// Transform JSON output to avoid circular references
deviceSchema.methods.toJSON = function() {
  const device = this.toObject();

  // If user is populated, only include essential fields
  if (device.user && typeof device.user === 'object' && device.user._id) {
    device.user = {
      _id: device.user._id,
      name: device.user.name,
      phone: device.user.phone,
      email: device.user.email,
      deviceStatus: device.user.deviceStatus
    };
  }

  // If shop is populated, only include essential fields
  if (device.shop && typeof device.shop === 'object' && device.shop._id) {
    device.shop = {
      _id: device.shop._id,
      name: device.shop.name
    };
  }

  // If lockedBy is populated, only include essential fields
  if (device.lockStatus && device.lockStatus.lockedBy && typeof device.lockStatus.lockedBy === 'object') {
    device.lockStatus.lockedBy = {
      _id: device.lockStatus.lockedBy._id,
      name: device.lockStatus.lockedBy.name
    };
  }

  return device;
};

module.exports = mongoose.model('Device', deviceSchema);
