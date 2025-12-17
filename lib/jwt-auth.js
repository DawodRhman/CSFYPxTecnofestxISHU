const jwt = require('jsonwebtoken');

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'technofest-admin-secret-key-change-in-production-2024';

// Admin credentials
const ADMIN_USERNAME = 'iamadmin';
const ADMIN_PASSWORD_HASH = require('bcrypt').hashSync('tecknofest1@1', 10);

// Rate limiting (in-memory, resets on cold start)
if (!global.loginAttempts) {
    global.loginAttempts = new Map();
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

function isLockedOut(ip) {
    const attempts = global.loginAttempts.get(ip);
    if (!attempts) return false;
    
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        return true;
    }
    
    if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
        global.loginAttempts.delete(ip);
        return false;
    }
    
    return false;
}

function recordFailedAttempt(ip) {
    const attempts = global.loginAttempts.get(ip) || { count: 0, firstAttempt: Date.now() };
    attempts.count++;
    
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
        attempts.lockedUntil = Date.now() + LOCKOUT_DURATION;
        global.loginAttempts.set(ip, attempts);
        return true;
    }
    
    if (Date.now() - attempts.firstAttempt > LOGIN_WINDOW_MS) {
        attempts.count = 1;
        attempts.firstAttempt = Date.now();
    }
    
    global.loginAttempts.set(ip, attempts);
    return false;
}

function resetLoginAttempts(ip) {
    global.loginAttempts.delete(ip);
}

// Generate JWT token
function generateToken(username) {
    return jwt.sign(
        { 
            username: username,
            type: 'admin'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

// Verify JWT token
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

// Middleware to check authentication
function requireAuth(req, res, next) {
    // Parse token from cookie or Authorization header
    let token = null;
    
    if (req.cookies && req.cookies.admin_token) {
        token = req.cookies.admin_token;
    } else if (req.headers.cookie) {
        const match = req.headers.cookie.match(/admin_token=([^;]+)/);
        if (match) {
            token = match[1];
        }
    } else if (req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }
    
    if (!token) {
        if (res && !res.headersSent) {
            res.status(401).json({ error: 'Authentication required.' });
        }
        return false;
    }
    
    const decoded = verifyToken(token);
    if (!decoded || decoded.type !== 'admin') {
        if (res && !res.headersSent) {
            res.status(401).json({ error: 'Invalid or expired token.' });
        }
        return false;
    }
    
    req.adminUser = decoded;
    if (next && typeof next === 'function') next();
    return true;
}

module.exports = {
    ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH,
    isLockedOut,
    recordFailedAttempt,
    resetLoginAttempts,
    generateToken,
    verifyToken,
    requireAuth
};

