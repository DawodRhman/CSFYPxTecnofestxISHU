// Authentication middleware for Vercel serverless functions
module.exports.requireAuth = (req, res, next) => {
    // Initialize global sessions if not exists
    if (!global.sessions) {
        global.sessions = new Map();
    }
    
    const sessionId = req.cookies?.admin_session || 
                     (req.headers.cookie && req.headers.cookie.match(/admin_session=([^;]+)/)?.[1]);
    
    if (!sessionId) {
        if (res && !res.headersSent) {
            res.status(401).json({ error: 'Authentication required.' });
        }
        return false;
    }
    
    const session = global.sessions.get(sessionId);
    if (!session || Date.now() > session.expiresAt) {
        if (session) global.sessions.delete(sessionId);
        if (res && !res.headersSent) {
            res.status(401).json({ error: 'Session expired. Please login again.' });
        }
        return false;
    }
    
    session.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    if (req) req.adminSession = session;
    if (next && typeof next === 'function') next();
    return true;
};

