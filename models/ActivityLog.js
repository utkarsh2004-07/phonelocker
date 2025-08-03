const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: false
  },
  device: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device'
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: [
      // Device actions
      'device_locked',
      'device_unlocked',
      'device_registered',
      'device_viewed',
      'devices_viewed',
      'bulk_lock',
      'bulk_unlock',
      // User actions
      'user_login',
      'user_logout',
      'user_created',
      'user_updated',
      'user_deleted',
      'user_viewed',
      'users_viewed',
      // Shop actions
      'shop_created',
      'shop_updated',
      'shop_deleted',
      'shop_viewed',
      'shops_viewed',
      'shop_stats_viewed',
      // Payment actions
      'emi_payment',
      'emi_default',
      // Admin actions
      'admin_action',
      'dashboard_viewed',
      'logs_viewed',
      'system_health_viewed',
      // Security actions
      'security_alert'
    ]
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Performed by is required']
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  category: {
    type: String,
    enum: ['device', 'user', 'shop', 'payment', 'security', 'admin'],
    required: [true, 'Category is required']
  }
}, {
  timestamps: true
});

// Index for efficient queries
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ shop: 1, createdAt: -1 });
activityLogSchema.index({ device: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ performedBy: 1, createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });
activityLogSchema.index({ severity: 1, createdAt: -1 });

// Static method to create activity log
activityLogSchema.statics.createLog = async function(logData) {
  try {
    const log = new this(logData);
    await log.save();
    return log;
  } catch (error) {
    console.error('Error creating activity log:', error);
    throw error;
  }
};

// Static method to get logs with pagination
activityLogSchema.statics.getLogsPaginated = async function(filter = {}, options = {}) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = -1,
    populate = []
  } = options;

  const skip = (page - 1) * limit;

  let query = this.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit);

  // Add population if specified
  if (populate.length > 0) {
    populate.forEach(field => {
      query = query.populate(field);
    });
  }

  const logs = await query.exec();
  const total = await this.countDocuments(filter);

  return {
    logs,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    }
  };
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
