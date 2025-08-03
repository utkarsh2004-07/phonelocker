const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/userController');
const {
  verifyToken,
  authorize,
  verifyUserAccess,
  logActivity
} = require('../middleware/auth');
const {
  validateUserRegistration,
  validateUserUpdate,
  validatePagination,
  validateObjectId
} = require('../middleware/validation');

// Apply authentication to all routes
router.use(verifyToken);

// Get all users (with pagination and filtering)
router.get('/',
  validatePagination,
  logActivity('users_viewed', 'user', 'Viewed users list'),
  getUsers
);

// Get single user by ID
router.get('/:userId',
  validateObjectId('userId'),
  verifyUserAccess,
  logActivity('user_viewed', 'user', 'Viewed user details'),
  getUserById
);

// Create new user (shop owners and superadmin only)
router.post('/',
  authorize('shopowner', 'superadmin'),
  validateUserRegistration,
  logActivity('user_created', 'user', 'Created new user'),
  createUser
);

// Update user
router.put('/:userId',
  validateObjectId('userId'),
  verifyUserAccess,
  validateUserUpdate,
  logActivity('user_updated', 'user', 'Updated user'),
  updateUser
);

// Delete user (shop owners and superadmin only)
router.delete('/:userId',
  authorize('shopowner', 'superadmin'),
  validateObjectId('userId'),
  verifyUserAccess,
  logActivity('user_deleted', 'user', 'Deleted user'),
  deleteUser
);

module.exports = router;
