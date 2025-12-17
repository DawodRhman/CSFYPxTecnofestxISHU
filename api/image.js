const prisma = require('../lib/prisma');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { id, type } = req.query;
    
    if (!id || !type) {
        res.status(400).json({ error: 'Missing id or type parameter. Use ?id=1&type=cnic or ?id=1&type=payment' });
        return;
    }
    
    if (type !== 'cnic' && type !== 'payment') {
        res.status(400).json({ error: 'Invalid image type. Use "cnic" or "payment".' });
        return;
    }
    
    try {
        await prisma.$connect();
        const registration = await prisma.registration.findUnique({
            where: { id: parseInt(id) },
            select: {
                cnicOrStudentCardUrl: type === 'cnic',
                paymentSlipUrl: type === 'payment',
            }
        });
        
        if (!registration) {
            res.status(404).json({ error: 'Registration not found.' });
            return;
        }
        
        const imageData = type === 'cnic' 
            ? registration.cnicOrStudentCardUrl 
            : registration.paymentSlipUrl;
        
        if (!imageData) {
            res.status(404).json({ error: 'Image not found for this registration.' });
            return;
        }
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Length', imageData.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.send(imageData);
        
    } catch (err) {
        console.error('Error retrieving image:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
};

