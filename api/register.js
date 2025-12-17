
const prisma = require('../lib/prisma');
const formidable = require('formidable');
const fs = require('fs');

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

    const form = new formidable.IncomingForm({
        multiples: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB limit per file
        maxTotalFileSize: 20 * 1024 * 1024, // 20MB total limit
        keepExtensions: true
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Form parse error:', err);
            if (err.code === 'LIMIT_FILE_SIZE' || err.message.includes('maxFileSize')) {
                res.status(400).json({ error: 'File size too large. Maximum 5MB per file.' });
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
        const nameVal = Array.isArray(name) ? name[0] : name;
        const emailVal = Array.isArray(email) ? email[0] : email;
        const contactVal = Array.isArray(contact) ? contact[0] : contact;
        const programVal = Array.isArray(program) ? program[0] : program;
        const semesterVal = Array.isArray(semester) ? semester[0] : semester;
        const rollnoVal = Array.isArray(rollno) ? rollno[0] : rollno;
        const eventVal = Array.isArray(event) ? event[0] : event;
        const teamVal = Array.isArray(team) ? team[0] || null : team || null;
        const userIdVal = Array.isArray(userId) ? userId[0] || null : userId || null;
        const transactionIdVal = Array.isArray(transactionId) ? transactionId[0] : transactionId;
        const accountNoVal = Array.isArray(accountNo) ? accountNo[0] : accountNo;

        // Read image files as binary data asynchronously (parallel)
        let cnicOrStudentCardData = null;
        let paymentSlipData = null;

        // Read files in parallel for better performance
        const readPromises = [];

        if (files.cnicOrStudentCard) {
            const file = Array.isArray(files.cnicOrStudentCard) ? files.cnicOrStudentCard[0] : files.cnicOrStudentCard;
            readPromises.push(
                fs.promises.readFile(file.filepath).then(data => {
                    cnicOrStudentCardData = data;
                    return fs.promises.unlink(file.filepath).catch(() => { });
                }).catch(err => {
                    console.error('Error reading CNIC file:', err);
                })
            );
        }

        if (files.paymentSlip) {
            const file = Array.isArray(files.paymentSlip) ? files.paymentSlip[0] : files.paymentSlip;
            readPromises.push(
                fs.promises.readFile(file.filepath).then(data => {
                    paymentSlipData = data;
                    return fs.promises.unlink(file.filepath).catch(() => { });
                }).catch(err => {
                    console.error('Error reading payment file:', err);
                })
            );
        }

        // Wait for all files to be read
        await Promise.all(readPromises);

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

