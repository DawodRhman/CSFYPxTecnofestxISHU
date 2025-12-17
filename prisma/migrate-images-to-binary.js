const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrateImagesToBinary() {
    const client = await pool.connect();
    
    try {
        console.log('Starting migration: Converting image columns to BYTEA...');
        
        // Check current column types
        const checkQuery = `
            SELECT 
                column_name, 
                data_type 
            FROM information_schema.columns 
            WHERE table_name = 'Registration' 
            AND column_name IN ('cnicOrStudentCardUrl', 'paymentSlipUrl');
        `;
        
        const checkResult = await client.query(checkQuery);
        console.log('Current column types:');
        checkResult.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type}`);
        });
        
        // Check if there's existing data with URLs
        const countQuery = await client.query('SELECT COUNT(*) FROM "Registration"');
        const recordCount = parseInt(countQuery.rows[0].count);
        
        if (recordCount > 0) {
            console.log(`\n⚠️  Found ${recordCount} existing records.`);
            console.log('   Making columns nullable temporarily for migration...');
        }
        
        // Step 1: Make columns nullable temporarily
        console.log('\nStep 1: Making columns nullable...');
        await client.query(`
            ALTER TABLE "Registration" 
            ALTER COLUMN "cnicOrStudentCardUrl" DROP NOT NULL;
        `);
        await client.query(`
            ALTER TABLE "Registration" 
            ALTER COLUMN "paymentSlipUrl" DROP NOT NULL;
        `);
        console.log('✓ Columns are now nullable');
        
        // Step 2: Clear existing URL data (can't convert URLs to binary)
        if (recordCount > 0) {
            console.log('\nStep 2: Clearing existing URL data...');
            await client.query(`
                UPDATE "Registration" 
                SET "cnicOrStudentCardUrl" = NULL, 
                    "paymentSlipUrl" = NULL;
            `);
            console.log('✓ Cleared existing URL data');
        }
        
        // Step 3: Convert column types to BYTEA
        console.log('\nStep 3: Converting cnicOrStudentCardUrl to BYTEA...');
        await client.query(`
            ALTER TABLE "Registration" 
            ALTER COLUMN "cnicOrStudentCardUrl" TYPE BYTEA 
            USING NULL;
        `);
        console.log('✓ cnicOrStudentCardUrl migrated to BYTEA');
        
        console.log('\nStep 4: Converting paymentSlipUrl to BYTEA...');
        await client.query(`
            ALTER TABLE "Registration" 
            ALTER COLUMN "paymentSlipUrl" TYPE BYTEA 
            USING NULL;
        `);
        console.log('✓ paymentSlipUrl migrated to BYTEA');
        
        // Step 5: Handle existing NULL records
        // Option: Delete records with NULL values, or keep columns nullable
        // For now, we'll keep them nullable since we cleared the data
        console.log('\nStep 5: Checking for records with NULL values...');
        const nullCount = await client.query(`
            SELECT COUNT(*) FROM "Registration" 
            WHERE "cnicOrStudentCardUrl" IS NULL OR "paymentSlipUrl" IS NULL;
        `);
        const nullRecords = parseInt(nullCount.rows[0].count);
        
        if (nullRecords > 0) {
            console.log(`   Found ${nullRecords} records with NULL image data.`);
            console.log('   Keeping columns nullable to preserve existing records.');
            console.log('   New registrations will store binary data.');
            console.log('   (You can delete old records later if needed)');
        } else {
            // If no NULL values, make columns NOT NULL
            console.log('   No NULL values found. Making columns required...');
            await client.query(`
                ALTER TABLE "Registration" 
                ALTER COLUMN "cnicOrStudentCardUrl" SET NOT NULL;
            `);
            await client.query(`
                ALTER TABLE "Registration" 
                ALTER COLUMN "paymentSlipUrl" SET NOT NULL;
            `);
            console.log('✓ Columns are now required (NOT NULL)');
        }
        
        // Verify the migration
        const verifyResult = await client.query(checkQuery);
        console.log('\n✓ Migration completed! New column types:');
        verifyResult.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type}`);
        });
        
        console.log('\n✅ Migration successful!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        
        // If columns are already BYTEA or if there's existing binary data, try a simpler approach
        if (error.message.includes('cannot cast') || error.message.includes('invalid input')) {
            console.log('\nAttempting alternative migration approach...');
            try {
                // Try direct conversion - this works if columns are empty or already binary
                await client.query(`
                    ALTER TABLE "Registration" 
                    ALTER COLUMN "cnicOrStudentCardUrl" TYPE BYTEA;
                `);
                await client.query(`
                    ALTER TABLE "Registration" 
                    ALTER COLUMN "paymentSlipUrl" TYPE BYTEA;
                `);
                console.log('✅ Alternative migration successful!');
            } catch (altError) {
                console.error('❌ Alternative migration also failed:', altError.message);
                console.log('\nNote: If columns already contain binary data, they may already be BYTEA type.');
                console.log('You may need to clear existing data or handle the conversion manually.');
                throw altError;
            }
        } else {
            throw error;
        }
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the migration
migrateImagesToBinary()
    .then(() => {
        console.log('\nMigration script completed.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\nMigration script failed:', error);
        process.exit(1);
    });

