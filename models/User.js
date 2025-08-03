const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(email) {
        return !email || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email);
      },
      message: 'Please enter a valid email'
    }
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(phone) {
        return /^[\+]?[1-9][\d]{0,15}$/.test(phone);
      },
      message: 'Please enter a valid phone number'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['superadmin', 'shopowner', 'user'],
    default: 'user'
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop'
  },
  deviceId: {
    type: String,
    trim: true,
    sparse: true // Allows multiple null values
  },
  imeiNumber: {
    type: String,
    trim: true,
    sparse: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  emiDetails: {
    totalAmount: {
      type: Number,
      default: 0
    },
    paidAmount: {
      type: Number,
      default: 0
    },
    remainingAmount: {
      type: Number,
      default: 0
    },
    monthlyEmi: {
      type: Number,
      default: 0
    },
    dueDate: Date,
    nextDueDate: Date,
    status: {
      type: String,
      enum: ['active', 'completed', 'defaulted', 'suspended'],
      default: 'active'
    }
  },
  deviceStatus: {
    isLocked: {
      type: Boolean,
      default: false
    },
    lastLockedAt: Date,
    lastUnlockedAt: Date,
    lockReason: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient queries
userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ email: 1 }, { sparse: true });
userSchema.index({ shop: 1, role: 1 });
userSchema.index({ 'emiDetails.status': 1 });
userSchema.index({ 'deviceStatus.isLocked': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Calculate remaining amount before saving
userSchema.pre('save', function(next) {
  if (this.emiDetails.totalAmount && this.emiDetails.paidAmount) {
    this.emiDetails.remainingAmount = this.emiDetails.totalAmount - this.emiDetails.paidAmount;
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get user without sensitive information
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
