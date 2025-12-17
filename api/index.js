const express = require('express');
const prisma = require('./prisma');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { router: authRouter, requireAuth } = require('./auth');

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
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

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

// --- API Route: Get Image by Registration ID ---
app.get('/api/registration/:id/image/:type', async (req, res) => {
    const { id, type } = req.params;
    
    // Validate image type
    if (type !== 'cnic' && type !== 'payment') {
        return res.status(400).json({ error: 'Invalid image type. Use "cnic" or "payment".' });
    }
    
    try {
        const registration = await prisma.registration.findUnique({
            where: { id: parseInt(id) },
            select: {
                cnicOrStudentCardUrl: type === 'cnic',
                paymentSlipUrl: type === 'payment',
            }
        });
        
        if (!registration) {
            return res.status(404).json({ error: 'Registration not found.' });
        }
        
        const imageData = type === 'cnic' 
            ? registration.cnicOrStudentCardUrl 
            : registration.paymentSlipUrl;
        
        if (!imageData) {
            return res.status(404).json({ error: 'Image not found for this registration.' });
        }
        
        // Convert Buffer to base64 or send directly
        // Set appropriate content type
        res.setHeader('Content-Type', 'image/jpeg'); // Default, can detect from file
        res.setHeader('Content-Length', imageData.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        res.send(imageData);
        
    } catch (err) {
        console.error('Error retrieving image:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// --- Authentication Routes ---
app.use('/api/auth', authRouter);

// --- API Route: Get All Registrations (for admin/viewing) ---
app.get('/api/registrations', requireAuth, async (req, res) => {
    try {
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
                // Include image URLs (will be base64 encoded for display)
                cnicOrStudentCardUrl: true,
                paymentSlipUrl: true,
            }
        });
        
        // Convert binary data to base64 data URLs for display
        const registrationsWithImages = registrations.map(reg => ({
            ...reg,
            cnicOrStudentCardUrl: reg.cnicOrStudentCardUrl 
                ? `data:image/jpeg;base64,${reg.cnicOrStudentCardUrl.toString('base64')}`
                : null,
            paymentSlipUrl: reg.paymentSlipUrl 
                ? `data:image/jpeg;base64,${reg.paymentSlipUrl.toString('base64')}`
                : null,
        }));
        
        res.json(registrationsWithImages);
    } catch (err) {
        console.error('Error retrieving registrations:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});


// Export the app for Vercel (no server listen)
module.exports = app;