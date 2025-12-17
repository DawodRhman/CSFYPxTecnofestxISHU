module.exports = async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Parse cookies manually for Vercel
    let sessionId = null;
    if (req.cookies && req.cookies.admin_session) {
        sessionId = req.cookies.admin_session;
    } else if (req.headers.cookie) {
        const match = req.headers.cookie.match(/admin_session=([^;]+)/);
        if (match) {
            sessionId = match[1];
        }
    }
    
    // Initialize sessions if not exists
    if (!global.sessions) {
        global.sessions = new Map();
    }
    
    if (!sessionId) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        return res.json({ authenticated: false });
    }
    
    const session = global.sessions.get(sessionId);
    if (!session || Date.now() > session.expiresAt) {
        if (session) global.sessions.delete(sessionId);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        return res.json({ authenticated: false });
    }
    
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.json({ authenticated: true, username: session.username });
};

