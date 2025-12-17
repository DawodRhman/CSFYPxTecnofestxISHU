const prisma = require('../lib/prisma');
const { requireAuth } = require('../lib/auth');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Check authentication
    const authResult = requireAuth(req, res);
    if (authResult !== true) {
        return; // Response already sent
    }

    try {
        await prisma.$connect();
        const registrations = await prisma.registration.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                contact: true,
                program: true,
                semester: true,
                rollno: true,
                event: true,
                team: true,
                transactionId: true,
                accountNo: true,
                createdAt: true,
                cnicOrStudentCardUrl: true,
                paymentSlipUrl: true,
            }
        });

        const registrationsWithImages = registrations.map(reg => ({
            ...reg,
            cnicOrStudentCardUrl: reg.cnicOrStudentCardUrl ? true : false,
            paymentSlipUrl: reg.paymentSlipUrl ? true : false,
        }));

        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.json(registrationsWithImages);
    } catch (err) {
        console.error('Error retrieving registrations:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
};

