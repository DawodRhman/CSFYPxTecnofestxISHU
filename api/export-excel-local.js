const prisma = require('./prisma');
const XLSX = require('xlsx');

module.exports = async (req, res) => {

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
            }
        });
        
        // Prepare data for Excel
        const excelData = registrations.map(reg => ({
            'ID': reg.id,
            'Name': reg.name,
            'Email': reg.email,
            'Contact': reg.contact,
            'Program': reg.program,
            'Semester': reg.semester,
            'Roll No': reg.rollno,
            'Event': reg.event,
            'Team': reg.team || 'N/A',
            'Transaction ID': reg.transactionId,
            'Account No': reg.accountNo,
            'Registration Date': new Date(reg.createdAt).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })
        }));
        
        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        const columnWidths = [
            { wch: 5 },   // ID
            { wch: 25 },  // Name
            { wch: 30 },  // Email
            { wch: 15 },  // Contact
            { wch: 20 },  // Program
            { wch: 10 },  // Semester
            { wch: 15 },  // Roll No
            { wch: 35 },  // Event
            { wch: 20 },  // Team
            { wch: 20 },  // Transaction ID
            { wch: 15 },  // Account No
            { wch: 25 }   // Registration Date
        ];
        worksheet['!cols'] = columnWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
        
        // Generate Excel file buffer
        const excelBuffer = XLSX.write(workbook, { 
            type: 'buffer', 
            bookType: 'xlsx' 
        });
        
        // Set response headers
        const filename = `Technofest_Registrations_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', excelBuffer.length);
        
        // Send Excel file
        res.send(excelBuffer);
        
    } catch (err) {
        console.error('Error exporting to Excel:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
};

