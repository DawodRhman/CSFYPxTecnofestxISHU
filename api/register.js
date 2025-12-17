
const prisma = require('../prisma');
const formidable = require('formidable');

// Check database connection on cold start
async function checkDbConnection() {
    try {
        await prisma.$connect();
        console.log('✅ Database connection established.');
    } catch (err) {
        console.error('❌ Database connection failed:', err);
    }
}
checkDbConnection();
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

    const form = new formidable.IncomingForm({ multiples: true });
    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Form parse error:', err);
            res.status(400).json({ error: 'Error parsing form data.' });
            return;
        }

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
        } = fields;

        // File URLs (simulate, as Vercel serverless cannot write to disk)
        const cnicOrStudentCardUrl = files.cnicOrStudentCard ? '/uploads/' + files.cnicOrStudentCard.originalFilename : null;
        const paymentSlipUrl = files.paymentSlip ? '/uploads/' + files.paymentSlip.originalFilename : null;

        if (!name || !email || !rollno || !semester || !event || !contact || !program || !transactionId || !accountNo || !cnicOrStudentCardUrl || !paymentSlipUrl) {
            res.status(400).json({ error: 'Missing required fields.' });
            return;
        }

        const competitionFullName = mapEventValueToName(event);

        try {
            // Check DB connection before insert
            await prisma.$connect();
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
            console.error('DB error:', err);
            if (err.code === 'P2002') {
                res.status(409).json({ error: 'Duplicate registration.' });
                return;
            }
            res.status(500).json({ error: 'Internal Server Error.', details: err.message });
        }
    });
};

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
