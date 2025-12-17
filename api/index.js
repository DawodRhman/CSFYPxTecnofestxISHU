const express = require('express');
const prisma = require('./prisma');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;


// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- Middleware ---
// Security Headers
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: { error: 'Too many registration attempts, please try again later.' }
});
app.use('/api/register', limiter);

// Using CORS allows your local front-end (if running on a different port) to talk to the server
app.use(cors());
app.use(express.json());

// Serve static files from the public directory (for local development)
// Note: In production, static files are served by Vercel's CDN
app.use(express.static(path.join(__dirname, '..', 'public')));


// Function to verify database connection
async function initializeDB() {
    try {
        // Verify Prisma can connect to the database
        await prisma.$connect();
        console.log('Database connection established successfully.');
    } catch (err) {
        console.error('Failed to connect to database:', err);
        process.exit(1);
    }
}

// --- Utility: Map short event value to full display name for DB storage ---
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

// --- API Route: Registration Endpoint ---
app.post('/api/register', upload.fields([
    { name: 'cnicOrStudentCard', maxCount: 1 },
    { name: 'paymentSlip', maxCount: 1 }
]), async (req, res) => {
    console.log('\n=== REGISTRATION REQUEST RECEIVED ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

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

    // Read image files as binary data
    let cnicOrStudentCardData = null;
    let paymentSlipData = null;

    if (req.files['cnicOrStudentCard']) {
        const filePath = req.files['cnicOrStudentCard'][0].path;
        cnicOrStudentCardData = fs.readFileSync(filePath);
    }

    if (req.files['paymentSlip']) {
        const filePath = req.files['paymentSlip'][0].path;
        paymentSlipData = fs.readFileSync(filePath);
    }

    // Validation
    if (!name || !email || !rollno || !semester || !event || !contact || !program || !transactionId || !accountNo || !cnicOrStudentCardData || !paymentSlipData) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const competitionFullName = mapEventValueToName(event);

    try {
        const registration = await prisma.registration.create({
            data: {
                name,
                email,
                contact,
                program,
                semester,
                rollno,
                event: competitionFullName,
                team: team || null,
                userId: userId || null,
                cnicOrStudentCardUrl: cnicOrStudentCardData,
                transactionId,
                accountNo,
                paymentSlipUrl: paymentSlipData,
            },
        });
        res.status(201).json({
            message: 'Registration successful!',
            registrationId: registration.id,
            eventName: competitionFullName
        });
    } catch (err) {
        console.error('Database error:', err);
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'Duplicate registration.' });
        }
        res.status(500).json({ error: 'Internal Server Error.', details: err.message });
    }
});


// Export the app for Vercel (no server listen)
module.exports = app;