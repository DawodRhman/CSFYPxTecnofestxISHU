module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const sessionId = req.cookies?.admin_session || req.headers.cookie?.match(/admin_session=([^;]+)/)?.[1];
    if (!sessionId || !global.sessions) {
        return res.json({ authenticated: false });
    }
    
    const session = global.sessions.get(sessionId);
    if (!session || Date.now() > session.expiresAt) {
        if (session) global.sessions.delete(sessionId);
        return res.json({ authenticated: false });
    }
    
    res.json({ authenticated: true, username: session.username });
};

