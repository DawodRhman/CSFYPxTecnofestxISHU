const express = require('express');
const prisma = require('./prisma');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;


// Multer setup for file uploads - using memory storage for better performance
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit per file
        files: 2 // Maximum 2 files
    },
    fileFilter: (req, file, cb) => {
        // Accept images and PDFs
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
        }
    }
});

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
app.post('/api/register', (req, res, next) => {
    upload.fields([
        { name: 'cnicOrStudentCard', maxCount: 1 },
        { name: 'paymentSlip', maxCount: 1 }
    ])(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: 'File size too large. Maximum 5MB per file.' });
                }
                return res.status(400).json({ error: 'File upload error: ' + err.message });
            }
            return res.status(400).json({ error: err.message || 'File upload error' });
        }
        next();
    });
}, async (req, res) => {
    // Handle multer file errors
    if (!req.files || !req.files['cnicOrStudentCard'] || !req.files['paymentSlip']) {
        return res.status(400).json({ error: 'Both CNIC/Student Card and Payment Slip files are required.' });
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
    } = req.body;

    // Get image files from memory (already loaded by multer)
    const cnicOrStudentCardData = req.files['cnicOrStudentCard']?.[0]?.buffer || null;
    const paymentSlipData = req.files['paymentSlip']?.[0]?.buffer || null;

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