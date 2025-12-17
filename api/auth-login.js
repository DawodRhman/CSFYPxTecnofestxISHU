const bcrypt = require('bcrypt');
const {
    ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH,
    isLockedOut,
    recordFailedAttempt,
    resetLoginAttempts,
    generateToken
} = require('../lib/jwt-auth');

module.exports = async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
        return res.status(200).end();
    }
    
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
    
    // Generate JWT token
    const token = generateToken(ADMIN_USERNAME);
    
    console.log('Login successful - Token generated');
    
    // Set cookie - For Vercel, use SameSite=None with Secure
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
    const cookieOptions = [
        `admin_token=${token}`,
        'HttpOnly',
        'Secure', // Always secure on Vercel (HTTPS)
        isVercel ? 'SameSite=None' : 'SameSite=Strict',
        'Max-Age=86400',
        'Path=/'
    ].join('; ');
    res.setHeader('Set-Cookie', cookieOptions);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    console.log('Cookie set with JWT token');
    res.json({ 
        message: 'Login successful.',
        authenticated: true
    });
};

