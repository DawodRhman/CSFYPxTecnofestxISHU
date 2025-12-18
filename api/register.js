
const prisma = require('../lib/prisma');
const formidable = require('formidable');
const { Writable } = require('stream');

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


function toSingle(value) {
    return Array.isArray(value) ? value[0] : value;
}

function getFileBuffer(fileInput) {
    const file = Array.isArray(fileInput) ? fileInput[0] : fileInput;
    return file?.buffer || null;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const form = new formidable.IncomingForm({
        multiples: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB limit per file
        maxTotalFileSize: 20 * 1024 * 1024, // 20MB total limit
        keepExtensions: true,
        // Capture uploads directly into memory buffers so we can persist them to the DB
        fileWriteStreamHandler: (file) => {
            const chunks = [];
            const writable = new Writable({
                write(chunk, _enc, cb) {
                    chunks.push(chunk);
                    cb();
                },
                final(cb) {
                    file.buffer = Buffer.concat(chunks);
                    cb();
                }
            });
            return writable;
        }
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Form parse error:', err);
            if (err.code === 'LIMIT_FILE_SIZE' || err.message.includes('maxFileSize')) {
                res.status(400).json({ error: 'File size too large. Maximum 10MB per file.' });
            } else {
                res.status(400).json({ error: 'Error parsing form data.' });
            }
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

        // Extract first value from arrays (formidable returns arrays)
        const nameVal = toSingle(name);
        const emailVal = toSingle(email);
        const contactVal = toSingle(contact);
        const programVal = toSingle(program);
        const semesterVal = toSingle(semester);
        const rollnoVal = toSingle(rollno);
        const eventVal = toSingle(event);
        const teamVal = toSingle(team) || null;
        const userIdVal = toSingle(userId) || null;
        const transactionIdVal = toSingle(transactionId);
        const accountNoVal = toSingle(accountNo);

        // Grab uploaded file buffers straight from formidable
        const cnicOrStudentCardData = getFileBuffer(files.cnicOrStudentCard);
        const paymentSlipData = getFileBuffer(files.paymentSlip);

        if (!nameVal || !emailVal || !rollnoVal || !semesterVal || !eventVal || !contactVal || !programVal || !transactionIdVal || !accountNoVal || !cnicOrStudentCardData || !paymentSlipData) {
            res.status(400).json({ error: 'Missing required fields.' });
            return;
        }

        const competitionFullName = mapEventValueToName(eventVal);

        try {
            // Check DB connection before insert
            await prisma.$connect();
            const registration = await prisma.registration.create({
                data: {
                    name: nameVal,
                    email: emailVal,
                    contact: contactVal,
                    program: programVal,
                    semester: semesterVal,
                    rollno: rollnoVal,
                    event: competitionFullName,
                    team: teamVal,
                    userId: userIdVal,
                    cnicOrStudentCardUrl: cnicOrStudentCardData,
                    transactionId: transactionIdVal,
                    accountNo: accountNoVal,
                    paymentSlipUrl: paymentSlipData,
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

