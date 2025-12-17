module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const sessionId = req.cookies?.admin_session || req.headers.cookie?.match(/admin_session=([^;]+)/)?.[1];
    if (sessionId && global.sessions) {
        global.sessions.delete(sessionId);
    }
    res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
    res.json({ message: 'Logged out successfully.' });
};

