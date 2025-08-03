const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Shop name is required'],
    trim: true,
    maxlength: [100, 'Shop name cannot exceed 100 characters']
  },
  shopId: {
    type: String,
    required: [true, 'Shop ID is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Shop ID cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Shop ID can only contain letters, numbers, hyphens, and underscores']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Shop owner is required']
  },
  contactInfo: {
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(email) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email);
        },
        message: 'Please enter a valid email'
      }
    },
    phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true
    },
    alternatePhone: {
      type: String,
      trim: true
    }
  },
  address: {
    street: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      trim: true,
      default: ''
    },
    state: {
      type: String,
      trim: true,
      default: ''
    },
    zipCode: {
      type: String,
      trim: true,
      default: ''
    },
    country: {
      type: String,
      trim: true,
      default: 'India'
    }
  },
  businessInfo: {
    registrationNumber: {
      type: String,
      trim: true
    },
    gstNumber: {
      type: String,
      trim: true
    },
    panNumber: {
      type: String,
      trim: true
    },
    businessType: {
      type: String,
      enum: ['electronics', 'mobile', 'appliances', 'furniture', 'vehicles', 'other'],
      default: 'electronics'
    }
  },
  settings: {
    autoLockOnDefault: {
      type: Boolean,
      default: true
    },
    gracePeriodDays: {
      type: Number,
      default: 3,
      min: 0,
      max: 30
    },
    notificationEnabled: {
      type: Boolean,
      default: true
    },
    allowBulkOperations: {
      type: Boolean,
      default: true
    }
  },
  statistics: {
    totalUsers: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    lockedDevices: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient queries
shopSchema.index({ owner: 1 });
shopSchema.index({ 'contactInfo.email': 1 });
shopSchema.index({ 'contactInfo.phone': 1 });
shopSchema.index({ isActive: 1 });

// Update statistics before saving
shopSchema.methods.updateStatistics = async function() {
  const User = mongoose.model('User');
  
  const stats = await User.aggregate([
    { $match: { shop: this._id } },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        lockedDevices: { $sum: { $cond: [{ $eq: ['$deviceStatus.isLocked', true] }, 1, 0] } },
        totalRevenue: { $sum: '$emiDetails.paidAmount' }
      }
    }
  ]);

  if (stats.length > 0) {
    this.statistics = {
      totalUsers: stats[0].totalUsers || 0,
      activeUsers: stats[0].activeUsers || 0,
      lockedDevices: stats[0].lockedDevices || 0,
      totalRevenue: stats[0].totalRevenue || 0
    };
  }

  return this.save();
};

module.exports = mongoose.model('Shop', shopSchema);
