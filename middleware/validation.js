const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Shop owner registration validation rules
const validateUserRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Owner name must be between 2 and 100 characters'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('phone')
    .trim()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

  body('shopName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Shop name must be between 2 and 100 characters'),

  body('shopId')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Shop ID must be 3-50 characters and contain only letters, numbers, hyphens, and underscores'),

  body('shopDescription')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Shop description cannot exceed 500 characters'),

  body('businessInfo')
    .optional()
    .isObject()
    .withMessage('Business info must be an object'),

  body('address')
    .optional()
    .isObject()
    .withMessage('Address must be an object'),

  handleValidationErrors
];

const validateUserLogin = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or phone number is required'),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  handleValidationErrors
];

const validateUserUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('deviceId')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Device ID cannot be empty'),
  
  body('imeiNumber')
    .optional()
    .trim()
    .isLength({ min: 15, max: 15 })
    .isNumeric()
    .withMessage('IMEI number must be exactly 15 digits'),
  
  handleValidationErrors
];

// Shop validation rules
const validateShopRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Shop name must be between 2 and 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('contactInfo.email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('contactInfo.phone')
    .trim()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  body('address.street')
    .trim()
    .notEmpty()
    .withMessage('Street address is required'),
  
  body('address.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  
  body('address.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  
  body('address.zipCode')
    .trim()
    .notEmpty()
    .withMessage('Zip code is required'),
  
  handleValidationErrors
];

// Device validation rules
const validateDeviceRegistration = [
  body('deviceId')
    .trim()
    .notEmpty()
    .withMessage('Device ID is required'),
  
  body('imeiNumber')
    .trim()
    .isLength({ min: 15, max: 15 })
    .isNumeric()
    .withMessage('IMEI number must be exactly 15 digits'),
  
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  
  handleValidationErrors
];

// EMI validation rules
const validateEMIUpdate = [
  body('totalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),
  
  body('paidAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Paid amount must be a positive number'),
  
  body('monthlyEmi')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly EMI must be a positive number'),
  
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  
  body('status')
    .optional()
    .isIn(['active', 'completed', 'defaulted', 'suspended'])
    .withMessage('Status must be one of: active, completed, defaulted, suspended'),
  
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Sort by field cannot be empty'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc', '1', '-1'])
    .withMessage('Sort order must be asc, desc, 1, or -1'),
  
  handleValidationErrors
];

// MongoDB ObjectId validation
const validateObjectId = (field) => [
  param(field)
    .isMongoId()
    .withMessage(`${field} must be a valid MongoDB ObjectId`),
  
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  validateShopRegistration,
  validateDeviceRegistration,
  validateEMIUpdate,
  validatePagination,
  validateObjectId,
  handleValidationErrors
};
