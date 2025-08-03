const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  logout
} = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const {
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate
} = require('../middleware/validation');

// Public routes
router.post('/register', validateUserRegistration, register);
router.post('/login', validateUserLogin, login);

// Protected routes
router.use(verifyToken); // Apply authentication to all routes below

router.get('/profile', getProfile);
router.put('/profile', validateUserUpdate, updateProfile);
router.put('/change-password', changePassword);
router.post('/logout', logout);

module.exports = router;
