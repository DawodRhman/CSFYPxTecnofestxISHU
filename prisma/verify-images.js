const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    throw new Error('DATABASE_URL is missing or empty. Add it to .env before running this verifier.');
}

const prisma = require('../lib/prisma');

async function run() {
    try {
        const ids = [8, 9];
        const outDir = path.join(__dirname, '..', 'public', 'uploads');
        fs.mkdirSync(outDir, { recursive: true });

        for (const id of ids) {
            const reg = await prisma.registration.findUnique({
                where: { id },
                select: {
                    cnicOrStudentCardUrl: true,
                    paymentSlipUrl: true
                }
            });

            if (!reg) {
                console.log(`ID ${id} not found`);
                continue;
            }

            if (reg.cnicOrStudentCardUrl) {
                const outPath = path.join(outDir, `cnic-${id}.bin`);
                fs.writeFileSync(outPath, reg.cnicOrStudentCardUrl);
                console.log(`Wrote CNIC for ${id} -> ${outPath} (${reg.cnicOrStudentCardUrl.length} bytes)`);
            }

            if (reg.paymentSlipUrl) {
                const outPath = path.join(outDir, `payment-${id}.bin`);
                fs.writeFileSync(outPath, reg.paymentSlipUrl);
                console.log(`Wrote Payment for ${id} -> ${outPath} (${reg.paymentSlipUrl.length} bytes)`);
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}

run().catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
});
