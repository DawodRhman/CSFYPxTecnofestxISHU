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

    const sessionId = req.cookies?.admin_session || req.headers.cookie?.match(/admin_session=([^;]+)/)?.[1];
    if (sessionId && global.sessions) {
        global.sessions.delete(sessionId);
    }
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
    const cookieOptions = [
        'admin_session=',
        'HttpOnly',
        'Secure',
        isVercel ? 'SameSite=None' : 'SameSite=Strict',
        'Max-Age=0',
        'Path=/'
    ].join('; ');
    res.setHeader('Set-Cookie', cookieOptions);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.json({ message: 'Logged out successfully.' });
};

