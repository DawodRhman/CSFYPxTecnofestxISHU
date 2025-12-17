const bcrypt = require('bcrypt');

// Admin credentials
const ADMIN_USERNAME = 'iamadmin';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('tecknofest1@1', 10);

// Simple in-memory store (for serverless, consider using external storage)
// In production, use Redis or database
if (!global.loginAttempts) {
    global.loginAttempts = new Map();
    global.sessions = new Map();
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

function generateSessionId() {
    return require('crypto').randomBytes(32).toString('hex');
}

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

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown';
    
    if (isLockedOut(ip)) {
        const attempts = global.loginAttempts.get(ip);
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
    
    const usernameMatch = username === ADMIN_USERNAME;
    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    
    if (!usernameMatch || !passwordMatch) {
        const locked = recordFailedAttempt(ip);
        if (locked) {
            return res.status(429).json({ 
                error: 'Too many failed login attempts. Account locked for 30 minutes.' 
            });
        }
        const attempts = global.loginAttempts.get(ip);
        const remaining = MAX_LOGIN_ATTEMPTS - attempts.count;
        return res.status(401).json({ 
            error: 'Invalid credentials.',
            remainingAttempts: remaining
        });
    }
    
    resetLoginAttempts(ip);
    const sessionId = generateSessionId();
    global.sessions.set(sessionId, {
        username: ADMIN_USERNAME,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    });
    
    res.setHeader('Set-Cookie', `admin_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/`);
    res.json({ 
        message: 'Login successful.',
        sessionId: sessionId
    });
};

