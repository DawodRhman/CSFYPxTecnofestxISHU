const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL || typeof process.env.DATABASE_URL !== 'string' || !process.env.DATABASE_URL.trim()) {
    throw new Error('DATABASE_URL is missing or empty. Add it to .env before running this seed.');
}

const prisma = require('../lib/prisma');

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

const samples = [
    {
        name: 'Seed Test One',
        email: 'seed1@example.com',
        contact: '+92 300 0000001',
        program: 'BS Computer Science',
        semester: '6th',
        rollno: 'SEED-001',
        event: 'speed-programming',
        team: 'Alpha Testers',
        userId: 'SEED-USER-001',
        transactionId: 'TX-SEED-001',
        accountNo: '1234567890',
        cnicPath: path.join(__dirname, '..', 'public', 'images', 'ctf.jpg'),
        paymentPath: path.join(__dirname, '..', 'public', 'images', 'event1.jpg'),
    },
    {
        name: 'Seed Test Two',
        email: 'seed2@example.com',
        contact: '+92 300 0000002',
        program: 'BS Software Engineering',
        semester: '8th',
        rollno: 'SEED-002',
        event: 'web-development',
        team: null,
        userId: 'SEED-USER-002',
        transactionId: 'TX-SEED-002',
        accountNo: '9876543210',
        cnicPath: path.join(__dirname, '..', 'public', 'images', 'webdev.jpg'),
        paymentPath: path.join(__dirname, '..', 'public', 'images', 'event2.jpg'),
    }
];

async function main() {
    for (const sample of samples) {
        const cnicBuffer = fs.readFileSync(sample.cnicPath);
        const paymentBuffer = fs.readFileSync(sample.paymentPath);

        const registration = await prisma.registration.create({
            data: {
                name: sample.name,
                email: sample.email,
                contact: sample.contact,
                program: sample.program,
                semester: sample.semester,
                rollno: sample.rollno,
                event: mapEventValueToName(sample.event),
                team: sample.team,
                userId: sample.userId,
                transactionId: sample.transactionId,
                accountNo: sample.accountNo,
                cnicOrStudentCardUrl: cnicBuffer,
                paymentSlipUrl: paymentBuffer,
            }
        });

        const stored = await prisma.registration.findUnique({
            where: { id: registration.id },
            select: {
                cnicOrStudentCardUrl: true,
                paymentSlipUrl: true,
            }
        });

        console.log(`Seeded registration #${registration.id} (${sample.name})`);
        console.log(`  CNIC bytes: ${stored.cnicOrStudentCardUrl?.length || 0}`);
        console.log(`  Payment slip bytes: ${stored.paymentSlipUrl?.length || 0}`);
    }
}

main()
    .catch(async (err) => {
        console.error('Seeding failed:', err);
        await prisma.$disconnect().catch(() => { });
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => { });
    });
