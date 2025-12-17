module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const sessionId = req.cookies?.admin_session || req.headers.cookie?.match(/admin_session=([^;]+)/)?.[1];
    if (sessionId && global.sessions) {
        global.sessions.delete(sessionId);
    }
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    const cookieOptions = [
        'admin_session=',
        'HttpOnly',
        isProduction ? 'Secure' : '',
        'SameSite=Strict',
        'Max-Age=0',
        'Path=/'
    ].filter(Boolean).join('; ');
    res.setHeader('Set-Cookie', cookieOptions);
    res.json({ message: 'Logged out successfully.' });
};

