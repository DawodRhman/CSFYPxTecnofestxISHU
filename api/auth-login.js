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

    console.log('Login attempt - Method:', req.method);
    console.log('Login attempt - Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Login attempt - Body:', JSON.stringify(req.body, null, 2));

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown';
    
    if (isLockedOut(ip)) {
        const attempts = global.loginAttempts.get(ip);
        const remainingTime = Math.ceil((attempts.lockedUntil - Date.now()) / 1000 / 60);
        return res.status(429).json({ 
            error: `Too many failed login attempts. Please try again in ${remainingTime} minutes.` 
        });
    }
    
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ error: 'Invalid request body.' });
    }
    
    const { username, password } = body;
    
    if (!username || !password) {
        recordFailedAttempt(ip);
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    
    console.log('Username provided:', username);
    console.log('Username match:', username === ADMIN_USERNAME);
    
    const usernameMatch = username === ADMIN_USERNAME;
    let passwordMatch = false;
    try {
        passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        console.log('Password match:', passwordMatch);
    } catch (e) {
        console.error('Password comparison error:', e);
        return res.status(500).json({ error: 'Authentication error.' });
    }
    
    if (!usernameMatch || !passwordMatch) {
        console.log('Login failed - Username match:', usernameMatch, 'Password match:', passwordMatch);
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
    
    console.log('Login successful - Session ID:', sessionId);
    console.log('Sessions map size:', global.sessions.size);
    
    // Set cookie - Secure only in production (HTTPS)
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    const cookieOptions = [
        `admin_session=${sessionId}`,
        'HttpOnly',
        isProduction ? 'Secure' : '',
        'SameSite=Strict',
        'Max-Age=86400',
        'Path=/'
    ].filter(Boolean).join('; ');
    res.setHeader('Set-Cookie', cookieOptions);
    console.log('Cookie set:', cookieOptions);
    res.json({ 
        message: 'Login successful.',
        sessionId: sessionId
    });
};

