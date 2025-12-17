const prisma = require('../prisma');
const multer = require('multer');
const path = require('path');

// Multer setup for file uploads (in-memory for serverless)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper to parse multipart/form-data in Vercel serverless
function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
}

function mapEventValueToName(eventValue) {
    switch (eventValue) {
        case 'speed-programming': return 'Speed Programming (Fee: 200)';
        case 'web-development': return 'Web Development (Fee: 200)';
        case 'pitch-your-idea': return 'Pitch Your Idea (Fee: 1000)';
        case 'ctf': return 'Capture the Flag (Fee: 200)';
        case 'data-insights': return 'Data Driven Insights (Fee: 200)';
        case 'hackathon': return 'Hackathon (Fee: 500)';
        default: return 'Unknown Event';
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    await runMiddleware(req, res, upload.fields([
        { name: 'cnicOrStudentCard', maxCount: 1 },
        { name: 'paymentSlip', maxCount: 1 }
    ]));

    const {
        name,
        email,
        contact,
        program,
        semester,
        rollno,
        event,
        team,
        userId,
        transactionId,
        accountNo
    } = req.body;

    // File URLs (simulate, as Vercel serverless cannot write to disk)
    const cnicOrStudentCardUrl = req.files['cnicOrStudentCard'] ? '/uploads/' + req.files['cnicOrStudentCard'][0].originalname : null;
    const paymentSlipUrl = req.files['paymentSlip'] ? '/uploads/' + req.files['paymentSlip'][0].originalname : null;

    if (!name || !email || !rollno || !semester || !event || !contact || !program || !transactionId || !accountNo || !cnicOrStudentCardUrl || !paymentSlipUrl) {
        res.status(400).json({ error: 'Missing required fields.' });
        return;
    }

    const competitionFullName = mapEventValueToName(event);

    try {
        const registration = await prisma.registration.create({
            data: {
                cnicOrStudentCard: name,
                cnicOrStudentCardUrl,
                transactionId,
                accountNo,
                paymentSlipUrl,
            },
        });
        res.status(201).json({
            message: 'Registration successful!',
            registrationId: registration.id,
            eventName: competitionFullName
        });
    } catch (err) {
        if (err.code === 'P2002') {
            res.status(409).json({ error: 'Duplicate registration.' });
            return;
        }
        res.status(500).json({ error: 'Internal Server Error.' });
    }
};
