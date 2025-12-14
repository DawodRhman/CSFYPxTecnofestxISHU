const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const cors = require('cors');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL connection setup using Neon DB URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon
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

// Note: Static files are served by Vercel's CDN, not this Express app.


// Function to check/create the 'registrations' table
async function initializeDB() {
    try {
        // NOTE: The student_id is set as UNIQUE to prevent duplicate entries for one student
        await pool.query(`
            CREATE TABLE IF NOT EXISTS registrations (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                contact VARCHAR(50),
                program VARCHAR(100),
                student_id VARCHAR(50) UNIQUE NOT NULL,
                semester VARCHAR(50) NOT NULL,
                event_name VARCHAR(255) NOT NULL,
                team_name TEXT,
                registered_by_user_id VARCHAR(50),
                registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database table "registrations" checked/created successfully.');
    } catch (err) {
        console.error('Failed to initialize DB:', err);
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
app.post('/api/register', async (req, res) => {
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
        userId
    } = req.body;

    console.log('Extracted fields:', { name, email, contact, program, semester, rollno, event, team, userId });

    // Server-side validation
    if (!name || !email || !rollno || !semester || !event || !contact || !program) {
        console.log('❌ Validation failed - missing required fields');
        return res.status(400).json({ error: 'Missing required fields (Name, Email, Student-ID, Semester, Event, Contact, Program).' });
    }

    console.log('✓ Validation passed');

    // Map the short event value to the full name for clean database storage
    const competitionFullName = mapEventValueToName(event);
    console.log('Mapped event name:', competitionFullName);

    try {
        console.log('Connecting to database...');
        const client = await pool.connect();
        console.log('✓ Database connected');

        console.log('Executing INSERT query...');
        const result = await client.query(
            `INSERT INTO registrations (full_name, email, contact, program, student_id, semester, event_name, team_name, registered_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, full_name, event_name, email`,
            [
                name,
                email,
                contact,
                program,
                rollno,
                semester,
                competitionFullName,
                team,
                userId
            ]
        );

        console.log('✓ INSERT successful, result:', result.rows[0]);

        client.release();
        console.log('✓ Database connection released');

        const response = {
            message: 'Registration successful!',
            registrationId: result.rows[0].id,
            eventName: competitionFullName
        };
        console.log('Sending success response:', response);
        res.status(201).json(response);
        console.log('✓ Response sent');

    } catch (err) {
        console.log('❌ ERROR CAUGHT:');
        console.log('Error code:', err.code);
        console.log('Error message:', err.message);
        console.log('Full error:', err);

        // Handle unique constraint violation (duplicate student ID)
        if (err.code === '23505') {
            console.log('Sending 409 - duplicate student ID');
            return res.status(409).json({ error: 'A student with this ID is already registered.' });
        }
        console.error('Error during registration:', err.message);
        console.log('Sending 500 - internal server error');
        res.status(500).json({ error: 'Internal Server Error.' });
    }
    console.log('=== REQUEST COMPLETE ===\n');
});


// Start the server only after the DB initialization is successful
// Export the app for Vercel
module.exports = app;

// Start the server only if running directly (e.g. locally)
if (require.main === module) {
    initializeDB().then(() => {
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
            console.log(`Access the registration form at http://localhost:${port}/index.html`);
        });
    });
} else {
    // Ensure DB is initialized when running as a module (e.g. on Vercel)
    initializeDB().catch(err => console.error("DB Init Error:", err));
}