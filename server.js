require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const shopRoutes = require('./routes/shops');
const deviceRoutes = require('./routes/devices');
const adminRoutes = require('./routes/admin');
const superadminRoutes = require('./routes/superadmin');
const mobileRoutes = require('./routes/mobile');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL 
      : "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : "http://localhost:3000",
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'EMILocker API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/mobile', mobileRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Join room based on user role and shop
  socket.on('join-room', (data) => {
    const { userId, role, shopId } = data;
    
    if (role === 'superadmin') {
      socket.join('superadmin');
    } else if (role === 'shopowner' && shopId) {
      socket.join(`shop-${shopId}`);
    } else if (role === 'user' && userId) {
      socket.join(`user-${userId}`);
    }
    
    console.log(`User ${userId} joined room for role: ${role}`);
  });

  // Handle device status updates
  socket.on('device-status-update', (data) => {
    const { deviceId, status, shopId } = data;
    
    // Broadcast to shop room
    if (shopId) {
      socket.to(`shop-${shopId}`).emit('device-status-changed', {
        deviceId,
        status,
        timestamp: new Date()
      });
    }
    
    // Broadcast to superadmin
    socket.to('superadmin').emit('device-status-changed', {
      deviceId,
      status,
      shopId,
      timestamp: new Date()
    });
  });

  // Handle real-time notifications
  socket.on('send-notification', (data) => {
    const { targetRoom, message, type } = data;
    
    socket.to(targetRoom).emit('notification', {
      message,
      type,
      timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
🚀 EMILocker Server is running!
📡 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📊 Database: ${process.env.MONGODB_URI}
🔗 Health Check: http://localhost:${PORT}/health
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('Unhandled Promise Rejection:', err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err.message);
  process.exit(1);
});

module.exports = { app, server, io };
