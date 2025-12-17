const bcrypt = require('bcrypt');
const express = require('express');
const router = express.Router();

// Admin credentials (in production, store in environment variables)
const ADMIN_USERNAME = 'iamadmin';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('tecknofest1@1', 10);

// In-memory session store (for serverless, consider using Redis or database)
const sessions = new Map();

// Rate limiting for login attempts (brute force protection)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

function generateSessionId() {
    return require('crypto').randomBytes(32).toString('hex');
}

function isLockedOut(ip) {
    const attempts = loginAttempts.get(ip);
    if (!attempts) return false;
    
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        return true;
    }
    
    // Reset if lockout expired
    if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
        loginAttempts.delete(ip);
        return false;
    }
    
    return false;
}

function recordFailedAttempt(ip) {
    const attempts = loginAttempts.get(ip) || { count: 0, firstAttempt: Date.now() };
    attempts.count++;
    
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
        attempts.lockedUntil = Date.now() + LOCKOUT_DURATION;
        loginAttempts.set(ip, attempts);
        return true; // Locked out
    }
    
    // Reset count if window expired
    if (Date.now() - attempts.firstAttempt > LOGIN_WINDOW_MS) {
        attempts.count = 1;
        attempts.firstAttempt = Date.now();
    }
    
    loginAttempts.set(ip, attempts);
    return false;
}

function resetLoginAttempts(ip) {
    loginAttempts.delete(ip);
}

// Login endpoint
router.post('/login', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    
    // Check if IP is locked out
    if (isLockedOut(ip)) {
        const attempts = loginAttempts.get(ip);
        const remainingTime = Math.ceil((attempts.lockedUntil - Date.now()) / 1000 / 60);
        return res.status(429).json({ 
            error: `Too many failed login attempts. Please try again in ${remainingTime} minutes.` 
        });
    }
    
    const { username, password } = req.body;
    
    if (!username || !password) {
        recordFailedAttempt(ip);
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    
    // Verify credentials
    const usernameMatch = username === ADMIN_USERNAME;
    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    
    if (!usernameMatch || !passwordMatch) {
        const locked = recordFailedAttempt(ip);
        if (locked) {
            return res.status(429).json({ 
                error: 'Too many failed login attempts. Account locked for 30 minutes.' 
            });
        }
        const attempts = loginAttempts.get(ip);
        const remaining = MAX_LOGIN_ATTEMPTS - attempts.count;
        return res.status(401).json({ 
            error: 'Invalid credentials.',
            remainingAttempts: remaining
        });
    }
    
    // Successful login
    resetLoginAttempts(ip);
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
        username: ADMIN_USERNAME,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    });
    
    res.cookie('admin_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    res.json({ 
        message: 'Login successful.',
        sessionId: sessionId
    });
});

// Logout endpoint
router.post('/logout', (req, res) => {
    const sessionId = req.cookies?.admin_session;
    if (sessionId) {
        sessions.delete(sessionId);
    }
    res.clearCookie('admin_session');
    res.json({ message: 'Logged out successfully.' });
});

// Check authentication status
router.get('/status', (req, res) => {
    const sessionId = req.cookies?.admin_session;
    if (!sessionId) {
        return res.json({ authenticated: false });
    }
    
    const session = sessions.get(sessionId);
    if (!session || Date.now() > session.expiresAt) {
        if (session) sessions.delete(sessionId);
        res.clearCookie('admin_session');
        return res.json({ authenticated: false });
    }
    
    res.json({ authenticated: true, username: session.username });
});

// Middleware to check authentication
function requireAuth(req, res, next) {
    const sessionId = req.cookies?.admin_session;
    
    if (!sessionId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    
    const session = sessions.get(sessionId);
    if (!session || Date.now() > session.expiresAt) {
        if (session) sessions.delete(sessionId);
        res.clearCookie('admin_session');
        return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    
    // Extend session
    session.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    req.adminSession = session;
    next();
}

// Clean up expired sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(sessionId);
        }
    }
}, 60 * 60 * 1000); // Clean up every hour

module.exports = { router, requireAuth };

