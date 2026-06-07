const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://weeecycle.net', 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());


// Helper to generate HMAC token
function generateMechanicToken(username) {
    const secret = process.env.SESSION_SECRET || 'fallback_secret_key_2025';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(username);
    return hmac.digest('hex');
}

// Authentication Middleware for Shop Mechanic (/tracker)
function requireMechanicAuth(req, res, next) {
    const token = req.cookies.mechanic_token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized. Please login.' });
        }
        return res.redirect('https://weeecycle.net/mechanic-login.html');
    }
    const expectedToken = generateMechanicToken(process.env.MECHANIC_USER || 'steve');
    if (token !== expectedToken) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Invalid token. Please login.' });
        }
        return res.redirect('https://weeecycle.net/mechanic-login.html');
    }
    next();
}

// Mount protected /tracker route serving bike-build-app/dist
app.use('/tracker', requireMechanicAuth, express.static(path.join(__dirname, 'bike-build-app/dist')));

// POST /api/mechanic-login
app.post('/api/mechanic-login', (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.MECHANIC_USER || 'steve';
    const validPass = process.env.MECHANIC_PASS || 'weeecycle2025';

    if (username === validUser && password === validPass) {
        const token = generateMechanicToken(username);
        res.cookie('mechanic_token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        return res.json({ success: true, token, redirect: '/tracker/' });
    }
    return res.status(401).json({ error: 'Invalid username or password.' });
});

// POST /api/mechanic-logout
app.post('/api/mechanic-logout', (req, res) => {
    res.clearCookie('mechanic_token', { sameSite: 'none', secure: true });
    res.json({ success: true, redirect: 'https://weeecycle.net/mechanic-login.html' });
});

// SQLite Workshop Database Setup (Permanent Server-Side Persistence)
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'weeecycle-workshop.db');
const workshopDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error opening SQLite database:', err);
    else console.log('SQLite workshop database connected.');
});

workshopDb.serialize(() => {
    workshopDb.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT,
        lastName TEXT,
        phone TEXT,
        email TEXT,
        stripeCustomerId TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zipCode TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )`);

    workshopDb.run(`CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customerId INTEGER,
        title TEXT,
        stage TEXT,
        bikeModel TEXT,
        estimatedCost TEXT,
        notes TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )`);

    workshopDb.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customerId INTEGER,
        type TEXT,
        status TEXT,
        issueDate TEXT,
        dueDate TEXT,
        items TEXT,
        subtotal REAL,
        tax REAL,
        total REAL,
        stripeInvoiceId TEXT,
        hostedInvoiceUrl TEXT,
        notes TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )`);

    workshopDb.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Upgrade migration columns for customers/invoices (ignores duplicate errors)
    workshopDb.run("ALTER TABLE customers ADD COLUMN email TEXT", () => {});
    workshopDb.run("ALTER TABLE customers ADD COLUMN stripeCustomerId TEXT", () => {});
    workshopDb.run("ALTER TABLE invoices ADD COLUMN stripeInvoiceId TEXT", () => {});
    workshopDb.run("ALTER TABLE invoices ADD COLUMN hostedInvoiceUrl TEXT", () => {});
});


// REST API Endpoints for Customers (Protected by requireMechanicAuth)
app.get('/api/customers', requireMechanicAuth, (req, res) => {
    workshopDb.all('SELECT * FROM customers ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/customers', requireMechanicAuth, (req, res) => {
    const { firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode } = req.body;
    const now = new Date().toISOString();
    const sql = `INSERT INTO customers (firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    workshopDb.run(sql, [firstName, lastName, phone, email, stripeCustomerId || null, address, city, state, zipCode, now, now], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode, createdAt: now, updatedAt: now });
    });
});

app.put('/api/customers/:id', requireMechanicAuth, (req, res) => {
    const { firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode } = req.body;
    const now = new Date().toISOString();
    const sql = `UPDATE customers SET firstName=?, lastName=?, phone=?, email=?, stripeCustomerId=?, address=?, city=?, state=?, zipCode=?, updatedAt=? WHERE id=?`;
    workshopDb.run(sql, [firstName, lastName, phone, email, stripeCustomerId || null, address, city, state, zipCode, now, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: req.params.id });
    });
});


app.delete('/api/customers/:id', requireMechanicAuth, (req, res) => {
    workshopDb.run('DELETE FROM jobs WHERE customerId=?', [req.params.id], (err) => {
        if (err) console.error('Error deleting associated jobs:', err);
        workshopDb.run('DELETE FROM customers WHERE id=?', [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// REST API Endpoints for Jobs
app.get('/api/jobs', requireMechanicAuth, (req, res) => {
    workshopDb.all('SELECT * FROM jobs ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/jobs', requireMechanicAuth, (req, res) => {
    const { customerId, title, stage, bikeModel, estimatedCost, notes } = req.body;
    const now = new Date().toISOString();
    const sql = `INSERT INTO jobs (customerId, title, stage, bikeModel, estimatedCost, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    workshopDb.run(sql, [customerId, title, stage, bikeModel, estimatedCost, notes, now, now], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, customerId, title, stage, bikeModel, estimatedCost, notes, createdAt: now, updatedAt: now });
    });
});

app.put('/api/jobs/:id', requireMechanicAuth, (req, res) => {
    const { stage, notes, estimatedCost } = req.body;
    const now = new Date().toISOString();
    let sql, params;
    if (stage && !notes && !estimatedCost) {
        sql = `UPDATE jobs SET stage=?, updatedAt=? WHERE id=?`;
        params = [stage, now, req.params.id];
    } else {
        sql = `UPDATE jobs SET notes=?, estimatedCost=?, updatedAt=? WHERE id=?`;
        params = [notes, estimatedCost, now, req.params.id];
    }
    workshopDb.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: req.params.id });
    });
});

app.delete('/api/jobs/:id', requireMechanicAuth, (req, res) => {
    workshopDb.run('DELETE FROM jobs WHERE id=?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// REST API Endpoints for Invoices (Protected by requireMechanicAuth)
app.get('/api/invoices', requireMechanicAuth, (req, res) => {
    workshopDb.all('SELECT * FROM invoices ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsedRows = rows.map(row => ({
            ...row,
            items: row.items ? JSON.parse(row.items) : []
        }));
        res.json(parsedRows);
    });
});

app.post('/api/invoices', requireMechanicAuth, (req, res) => {
    const { customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes } = req.body;
    const now = new Date().toISOString();
    const itemsStr = JSON.stringify(items || []);
    const sql = `INSERT INTO invoices (customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    workshopDb.run(sql, [customerId, type, status, issueDate, dueDate, itemsStr, subtotal, tax, total, stripeInvoiceId || null, hostedInvoiceUrl || null, notes, now, now], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes, createdAt: now, updatedAt: now });
    });
});

app.put('/api/invoices/:id', requireMechanicAuth, (req, res) => {
    const { customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes } = req.body;
    const now = new Date().toISOString();
    const itemsStr = JSON.stringify(items || []);
    const sql = `UPDATE invoices SET customerId=?, type=?, status=?, issueDate=?, dueDate=?, items=?, subtotal=?, tax=?, total=?, stripeInvoiceId=?, hostedInvoiceUrl=?, notes=?, updatedAt=? WHERE id=?`;
    workshopDb.run(sql, [customerId, type, status, issueDate, dueDate, itemsStr, subtotal, tax, total, stripeInvoiceId || null, hostedInvoiceUrl || null, notes, now, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: req.params.id });
    });
});


app.delete('/api/invoices/:id', requireMechanicAuth, (req, res) => {
    workshopDb.run('DELETE FROM invoices WHERE id=?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Public REST API Endpoints for Customer Portal (No mechanic auth required)
app.post('/api/public/signup', (req, res) => {
    const { firstName, lastName, phone, address, city, state, zipCode, requestedService, bikeModel } = req.body;
    if (!firstName || !lastName || !phone) {
        return res.status(400).json({ error: 'First Name, Last Name, and Phone Number are required.' });
    }
    const now = new Date().toISOString();
    
    // Check if customer already exists by phone
    workshopDb.get('SELECT * FROM customers WHERE phone=?', [phone.trim()], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const handleJobCreation = (id) => {
            if (requestedService && requestedService.trim() !== '') {
                const jobSql = `INSERT INTO jobs (customerId, title, stage, bikeModel, estimatedCost, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                workshopDb.run(jobSql, [id, requestedService.trim(), 'In the shop', bikeModel || 'Customer Bike', '', 'Customer self-service intake request.', now, now], function(jobErr) {
                    if (jobErr) console.error('Error creating initial job:', jobErr);
                    res.json({ success: true, customerId: id, jobId: this?.lastID });
                });
            } else {
                res.json({ success: true, customerId: id });
            }
        };

        if (existing) {
            // Update existing customer info
            const updateSql = `UPDATE customers SET firstName=?, lastName=?, address=?, city=?, state=?, zipCode=?, updatedAt=? WHERE id=?`;
            workshopDb.run(updateSql, [firstName.trim(), lastName.trim(), address?.trim(), city?.trim(), state, zipCode?.trim(), now, existing.id], (upErr) => {
                if (upErr) return res.status(500).json({ error: upErr.message });
                handleJobCreation(existing.id);
            });
        } else {
            // Insert new customer
            const insertSql = `INSERT INTO customers (firstName, lastName, phone, address, city, state, zipCode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            workshopDb.run(insertSql, [firstName.trim(), lastName.trim(), phone.trim(), address?.trim(), city?.trim(), state, zipCode?.trim(), now, now], function(insErr) {
                if (insErr) return res.status(500).json({ error: insErr.message });
                handleJobCreation(this.lastID);
            });
        }
    });
});

app.get('/api/public/status', (req, res) => {
    const { phone } = req.query;
    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required to look up repair status.' });
    }
    workshopDb.get('SELECT * FROM customers WHERE phone=?', [phone.trim()], (err, customer) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!customer) {
            return res.status(404).json({ error: 'No customer found matching that phone number.' });
        }
        workshopDb.all('SELECT id, title, stage, bikeModel, estimatedCost, notes, updatedAt FROM jobs WHERE customerId=? ORDER BY id DESC', [customer.id], (jobErr, jobs) => {
            if (jobErr) return res.status(500).json({ error: jobErr.message });
            res.json({ customer: { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone }, jobs });
        });
    });
});

// Serve static files from root (for public site assets)
app.use(express.static(path.join(__dirname, '/')));

// Email Transporter Setup
let transporter;
if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 465,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    console.log('Nodemailer SMTP transporter configured for:', process.env.SMTP_USER);
} else {
    console.warn('SMTP credentials missing in .env. Email delivery will be disabled.');
}

// Helper to fetch/convert image URL to Buffer for PDFKit
async function fetchImageBuffer(url) {
    try {
        if (!url) return null;
        if (url.startsWith('data:image')) {
            const base64Data = url.replace(/^data:image\/\w+;base64,/, "");
            return Buffer.from(base64Data, 'base64');
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
            const response = await fetch(url);
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } else if (url.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, 'bike-build-app', url);
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath);
            }
        }
    } catch (err) {
        console.error('Error fetching image for PDF:', err);
    }
    return null;
}

// POST /api/send-build-pdf
app.post('/api/send-build-pdf', requireMechanicAuth, async (req, res) => {
    const { customerEmail, buildName, totalPrice, components = [], extras = [], customMessage } = req.body;

    if (!customerEmail) {
        return res.status(400).json({ error: 'Customer email is required.' });
    }

    if (!transporter) {
        return res.status(500).json({ error: 'SMTP email transporter is not configured on the server.' });
    }

    try {
        console.log(`Generating PDF specification for build "${buildName}" to ${customerEmail}...`);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', async () => {
            const pdfBuffer = Buffer.concat(buffers);

            // Send Email
            const mailOptions = {
                from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
                to: customerEmail,
                subject: `Your Custom Bike Build Specification: ${buildName || 'Weeecycle Build'}`,
                html: `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
                        <div style="background: #d97706; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Weeecycle Custom Workshop</h1>
                        </div>
                        <div style="padding: 32px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
                            <h2 style="color: #0f172a; margin-top: 0;">Hello!</h2>
                            <p>Thank you for exploring a custom bike build with Weeecycle. We have completed the initial specification for your build: <strong>${buildName || 'Custom Build'}</strong>.</p>
                            ${customMessage ? `<div style="background: #f8fafc; border-left: 4px solid #d97706; padding: 16px; margin: 24px 0; border-radius: 4px;"><p style="margin: 0; font-style: italic;">"${customMessage}"</p></div>` : ''}
                            <p>Attached to this email is your complete, beautifully formatted PDF specification sheet containing all component choices, pricing details, mechanic notes, and photos.</p>
                            <div style="margin: 32px 0; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center;">
                                <span style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 8px;">Estimated Total Investment</span>
                                <span style="font-size: 32px; font-weight: bold; color: #d97706;">$${parseFloat(totalPrice || 0).toFixed(2)}</span>
                            </div>
                            <p style="margin-bottom: 0;">If you have any questions or are ready to proceed with ordering, please reply directly to this email or reach out to us at the workshop.</p>
                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
                            <p style="font-size: 14px; color: #64748b; margin: 0; text-align: center;">Weeecycle Workshop • Road & Gravel Specialists</p>
                        </div>
                    </div>
                `,
                attachments: [
                    {
                        filename: `${(buildName || 'Bike-Build').replace(/[^a-zA-Z0-9]/g, '_')}_Specification.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            };

            console.log('Sending email with PDF attachment...');
            await transporter.sendMail(mailOptions);
            console.log('Email sent successfully to:', customerEmail);
            res.json({ success: true, message: 'PDF generated and sent successfully!' });
        });

        // --- PDF STYLING & CONTENT ---
        const primaryColor = '#D97706'; // Brand Orange / Amber
        const textColor = '#1E293B';
        const mutedColor = '#64748B';
        const lineItemBg = '#F8FAFC';
        const borderColor = '#E2E8F0';

        // Top Accent Bar
        doc.rect(0, 0, doc.page.width, 16).fill(primaryColor);
        doc.moveDown(2);

        // Header Title
        doc.font('Helvetica-Bold').fontSize(26).fillColor(primaryColor).text('WEEECYCLE WORKSHOP', { align: 'left' });
        doc.font('Helvetica').fontSize(14).fillColor(mutedColor).text('CUSTOM BIKE BUILD SPECIFICATION', { align: 'left' });
        doc.moveDown(1);

        // Metadata Box
        doc.rect(50, doc.y, doc.page.width - 100, 80).fillAndStroke(lineItemBg, borderColor);
        const boxTop = doc.y + 15;
        
        doc.font('Helvetica-Bold').fontSize(16).fillColor(textColor).text(`Build: ${buildName || 'Custom Build'}`, 70, boxTop);
        doc.font('Helvetica').fontSize(12).fillColor(mutedColor).text(`Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 70, boxTop + 25);
        
        // Price callout inside metadata box
        doc.font('Helvetica-Bold').fontSize(22).fillColor(primaryColor).text(`$${parseFloat(totalPrice || 0).toFixed(2)}`, 50, boxTop + 10, { align: 'right', width: doc.page.width - 140 });
        doc.font('Helvetica').fontSize(10).fillColor(mutedColor).text('Total Estimated Price', 50, boxTop + 35, { align: 'right', width: doc.page.width - 140 });
        
        doc.x = 50;
        doc.y = boxTop + 75;
        doc.moveDown(1);

        // Custom Message Section
        if (customMessage) {
            doc.font('Helvetica-Oblique').fontSize(12).fillColor(textColor).text(`"${customMessage}"`, { align: 'left' });
            doc.moveDown(1.5);
        }

        // Section Title: Components
        doc.font('Helvetica-Bold').fontSize(18).fillColor(primaryColor).text('COMPONENT SPECIFICATIONS');
        doc.moveDown(0.5);
        doc.rect(50, doc.y, doc.page.width - 100, 2).fill(primaryColor);
        doc.moveDown(1);

        // Filter valid components
        const validComponents = components.filter(c => c.name && c.name.trim() !== '');

        if (validComponents.length === 0) {
            doc.font('Helvetica').fontSize(12).fillColor(mutedColor).text('No components specified yet.');
            doc.moveDown(2);
        } else {
            for (const comp of validComponents) {
                // Check page break
                if (doc.y > doc.page.height - 180) {
                    doc.addPage();
                    doc.rect(0, 0, doc.page.width, 16).fill(primaryColor);
                    doc.x = 50;
                    doc.y = 50;
                    doc.font('Helvetica-Bold').fontSize(14).fillColor(primaryColor).text('COMPONENT SPECIFICATIONS (CONT.)');
                    doc.moveDown(1);
                }

                const currentY = doc.y;
                doc.rect(50, currentY, doc.page.width - 100, 24).fill('#E2E8F0');
                
                doc.font('Helvetica-Bold').fontSize(12).fillColor(textColor).text((comp.label || comp.type).toUpperCase(), 60, currentY + 6);
                const compPrice = parseFloat(comp.price || 0);
                if (compPrice > 0) {
                    doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor).text(`$${compPrice.toFixed(2)}`, 50, currentY + 6, { align: 'right', width: doc.page.width - 120 });
                }

                doc.x = 60;
                doc.y = currentY + 32;

                doc.font('Helvetica-Bold').fontSize(14).fillColor(textColor).text(comp.name);
                doc.moveDown(0.25);

                if (comp.description) {
                    doc.font('Helvetica').fontSize(11).fillColor(textColor).text(comp.description);
                    doc.moveDown(0.25);
                }

                if (comp.notes) {
                    doc.font('Helvetica-Oblique').fontSize(10).fillColor(mutedColor).text(`Note: ${comp.notes}`);
                    doc.moveDown(0.25);
                }

                doc.moveDown(0.5);

                // Process Images
                if (comp.imageUrls && comp.imageUrls.length > 0) {
                    for (const imgUrl of comp.imageUrls) {
                        const imgBuffer = await fetchImageBuffer(imgUrl);
                        if (imgBuffer) {
                            try {
                                const img = doc.openImage(imgBuffer);
                                const maxW = 220;
                                const maxH = 160;
                                const scale = Math.min(maxW / img.width, maxH / img.height);
                                const renderedW = img.width * scale;
                                const renderedH = img.height * scale;

                                if (doc.y + renderedH > doc.page.height - 50) {
                                    doc.addPage();
                                    doc.rect(0, 0, doc.page.width, 16).fill(primaryColor);
                                    doc.x = 60;
                                    doc.y = 50;
                                }

                                doc.image(img, doc.x, doc.y, { width: renderedW, height: renderedH });
                                doc.y += renderedH + 15;
                            } catch (imgErr) {
                                console.error('Error embedding image in PDFKit:', imgErr);
                            }
                        }
                    }
                }

                doc.x = 50;
                doc.moveDown(1);
            }
        }

        // Section Title: Extras & Accessories
        const validExtras = extras.filter(e => e.name && e.name.trim() !== '');
        if (validExtras.length > 0) {
            if (doc.y > doc.page.height - 180) {
                doc.addPage();
                doc.rect(0, 0, doc.page.width, 16).fill(primaryColor);
                doc.x = 50;
                doc.y = 50;
            }

            doc.font('Helvetica-Bold').fontSize(18).fillColor(primaryColor).text('EXTRAS & ACCESSORIES');
            doc.moveDown(0.5);
            doc.rect(50, doc.y, doc.page.width - 100, 2).fill(primaryColor);
            doc.moveDown(1);

            for (const extra of validExtras) {
                if (doc.y > doc.page.height - 150) {
                    doc.addPage();
                    doc.rect(0, 0, doc.page.width, 16).fill(primaryColor);
                    doc.x = 50;
                    doc.y = 50;
                }

                const currentY = doc.y;
                doc.rect(50, currentY, doc.page.width - 100, 24).fill('#E2E8F0');
                
                doc.font('Helvetica-Bold').fontSize(12).fillColor(textColor).text(extra.name.toUpperCase(), 60, currentY + 6);
                const extraPrice = parseFloat(extra.price || 0);
                const extraQty = parseInt(extra.quantity || 1);
                if (extraPrice > 0) {
                    doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor).text(`${extraQty} x $${extraPrice.toFixed(2)} = $${(extraPrice * extraQty).toFixed(2)}`, 50, currentY + 6, { align: 'right', width: doc.page.width - 120 });
                }

                doc.x = 60;
                doc.y = currentY + 32;

                if (extra.notes) {
                    doc.font('Helvetica-Oblique').fontSize(10).fillColor(mutedColor).text(`Note: ${extra.notes}`);
                    doc.moveDown(0.5);
                }

                if (extra.imageUrls && extra.imageUrls.length > 0) {
                    for (const imgUrl of extra.imageUrls) {
                        const imgBuffer = await fetchImageBuffer(imgUrl);
                        if (imgBuffer) {
                            try {
                                const img = doc.openImage(imgBuffer);
                                const maxW = 200;
                                const maxH = 140;
                                const scale = Math.min(maxW / img.width, maxH / img.height);
                                const renderedW = img.width * scale;
                                const renderedH = img.height * scale;

                                if (doc.y + renderedH > doc.page.height - 50) {
                                    doc.addPage();
                                    doc.rect(0, 0, doc.page.width, 16).fill(primaryColor);
                                    doc.x = 60;
                                    doc.y = 50;
                                }

                                doc.image(img, doc.x, doc.y, { width: renderedW, height: renderedH });
                                doc.y += renderedH + 15;
                            } catch (imgErr) {
                                console.error('Error embedding extra image in PDFKit:', imgErr);
                            }
                        }
                    }
                }

                doc.x = 50;
                doc.moveDown(1);
            }
        }

        // Footer / Sign-off
        doc.moveDown(2);
        doc.font('Helvetica').fontSize(10).fillColor(mutedColor).text('Thank you for choosing Weeecycle Workshop. We look forward to building your dream bike!', { align: 'center' });
        
        doc.end();

    } catch (err) {
        console.error('Error generating PDF or sending email:', err);
        res.status(500).json({ error: err.message });
    }
});

// Settings DB helpers
function getSetting(key) {
    return new Promise((resolve, reject) => {
        workshopDb.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
        });
    });
}

function saveSetting(key, value) {
    return new Promise((resolve, reject) => {
        workshopDb.run('REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function deleteSetting(key) {
    return new Promise((resolve, reject) => {
        workshopDb.run('DELETE FROM settings WHERE key = ?', [key], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function getStripeKeys() {
    let secretKey = null;
    let webhookSecret = null;
    try {
        secretKey = await getSetting('stripe_secret_key');
        webhookSecret = await getSetting('stripe_webhook_secret');
    } catch (err) {
        console.error('Error fetching settings from database:', err);
    }
    
    if (!secretKey) secretKey = process.env.STRIPE_SECRET_KEY;
    if (!webhookSecret) webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    return { secretKey, webhookSecret };
}

function maskKey(key) {
    if (!key) return '';
    if (key.length <= 12) return '********';
    return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

// GET Stripe Settings
app.get('/api/settings/stripe', requireMechanicAuth, async (req, res) => {
    try {
        const { secretKey, webhookSecret } = await getStripeKeys();
        const host = req.headers.host || 'localhost:3000';
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const webhookUrl = `${protocol}://${host}/api/webhooks/stripe`;

        res.json({
            stripeSecretKeyConfigured: !!secretKey && !secretKey.includes('placeholder') && secretKey !== '',
            stripeSecretKeyMasked: maskKey(secretKey),
            stripeWebhookSecretConfigured: !!webhookSecret && !webhookSecret.includes('placeholder') && webhookSecret !== '',
            stripeWebhookSecretMasked: maskKey(webhookSecret),
            webhookUrl,
            isLive: !!secretKey && secretKey.startsWith('sk_live')
        });
    } catch (err) {
        console.error('Error fetching Stripe settings:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST Stripe Settings with credential validation
app.post('/api/settings/stripe', requireMechanicAuth, async (req, res) => {
    const { stripeSecretKey, stripeWebhookSecret } = req.body;

    try {
        const currentKeys = await getStripeKeys();

        // 1. Process Stripe Secret Key
        let targetSecretKey = stripeSecretKey;
        const isMaskedSecret = stripeSecretKey && stripeSecretKey.includes('...');
        
        if (isMaskedSecret) {
            // Keep existing key
            targetSecretKey = currentKeys.secretKey;
        }

        // 2. Validate Stripe Secret Key if it changed and is not empty
        if (targetSecretKey && targetSecretKey !== currentKeys.secretKey) {
            try {
                const stripe = require('stripe')(targetSecretKey);
                // Call a lightweight Stripe API to verify the key works
                await stripe.accounts.retrieve();
            } catch (stripeErr) {
                console.error('Stripe verification failed for key:', stripeErr.message);
                return res.status(400).json({ error: `Stripe validation failed: ${stripeErr.message}` });
            }
        }

        // 3. Process Webhook Secret Key
        let targetWebhookSecret = stripeWebhookSecret;
        const isMaskedWebhook = stripeWebhookSecret && stripeWebhookSecret.includes('...');

        if (isMaskedWebhook) {
            // Keep existing webhook secret
            targetWebhookSecret = currentKeys.webhookSecret;
        }

        // 4. Save to Database
        if (targetSecretKey !== undefined) {
            if (targetSecretKey === '') {
                await deleteSetting('stripe_secret_key');
            } else {
                await saveSetting('stripe_secret_key', targetSecretKey);
            }
        }

        if (targetWebhookSecret !== undefined) {
            if (targetWebhookSecret === '') {
                await deleteSetting('stripe_webhook_secret');
            } else {
                await saveSetting('stripe_webhook_secret', targetWebhookSecret);
            }
        }

        res.json({ success: true, message: 'Stripe settings saved and verified successfully!' });
    } catch (err) {
        console.error('Error saving Stripe settings:', err);
        res.status(500).json({ error: err.message });
    }
});

// Stripe Invoice Operations (Create & Send)
app.post('/api/invoices/:id/send-stripe', requireMechanicAuth, async (req, res) => {
    const invoiceId = req.params.id;
    workshopDb.get('SELECT * FROM invoices WHERE id = ?', [invoiceId], async (err, invoice) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        // Retrieve customer
        workshopDb.get('SELECT * FROM customers WHERE id = ?', [invoice.customerId], async (err, customer) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!customer) return res.status(404).json({ error: 'Customer not found' });
            if (!customer.email) return res.status(400).json({ error: 'Customer must have an email address to send a Stripe invoice.' });

            const items = invoice.items ? JSON.parse(invoice.items) : [];
            const { secretKey: stripeSecret } = await getStripeKeys();
            
            // Fallback to Simulator Mode if secret is not configured
            const isMockMode = !stripeSecret || stripeSecret.includes('placeholder') || stripeSecret === '';

            if (isMockMode) {
                console.log('[Stripe Simulator] Generating mock Stripe hosted invoice.');
                const mockInvoiceId = 'in_mock_' + Math.random().toString(36).substr(2, 9);
                const mockHostedUrl = `https://weeecycle.net/tracker/?mock-pay-invoice=${mockInvoiceId}`;
                
                let customerStripeId = customer.stripeCustomerId || ('cus_mock_' + Math.random().toString(36).substr(2, 9));
                
                workshopDb.run('UPDATE customers SET stripeCustomerId=? WHERE id=?', [customerStripeId, customer.id], (err) => {
                    if (err) console.error('Error updating customer stripeCustomerId:', err);
                });

                // Send email to customer via SMTP in simulator mode
                if (transporter) {
                    const mailHtml = `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
                            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
                                <div style="background: linear-gradient(135deg, #d97706 0%, #b45309 100%); padding: 32px; text-align: center; color: #ffffff;">
                                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">WEEECYCLE WORKSHOP</h1>
                                    <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Road & Gravel Specialists</p>
                                </div>
                                <div style="padding: 32px;">
                                    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a;">New Invoice from Weeecycle</h2>
                                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                                        Hi ${customer.firstName},<br><br>
                                        Your invoice from Weeecycle Workshop is ready for payment. You can pay securely online using your credit or debit card.
                                    </p>
                                    <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
                                            <tr>
                                                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Invoice ID:</td>
                                                <td style="padding: 4px 0; text-align: right;">#${invoiceId}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Issue Date:</td>
                                                <td style="padding: 4px 0; text-align: right;">${invoice.issueDate}</td>
                                            </tr>
                                            ${invoice.dueDate ? `
                                            <tr>
                                                <td style="padding: 4px 0; font-weight: 600; color: #1e293b;">Due Date:</td>
                                                <td style="padding: 4px 0; text-align: right;">${invoice.dueDate}</td>
                                            </tr>` : ''}
                                            <tr style="border-top: 1px solid #cbd5e1;">
                                                <td style="padding: 12px 0 4px 0; font-size: 16px; font-weight: bold; color: #0f172a;">Total Due:</td>
                                                <td style="padding: 12px 0 4px 0; text-align: right; font-size: 18px; font-weight: bold; color: #d97706;">$${(invoice.total || 0).toFixed(2)}</td>
                                            </tr>
                                        </table>
                                    </div>
                                    <div style="text-align: center; margin-bottom: 32px;">
                                        <a href="${mockHostedUrl}" style="background-color: #635bff; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(99, 91, 255, 0.2);">
                                            Pay Invoice Online
                                        </a>
                                    </div>
                                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">
                                        Thank you for your business!<br>
                                        <strong>Weeecycle Workshop</strong>
                                    </p>
                                </div>
                                <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px; text-align: center; font-size: 12px; color: #94a3b8;">
                                    This is a simulated Stripe Invoice email for development/testing purposes.
                                </div>
                            </div>
                        </div>
                    `;
                    const mailOptions = {
                        from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
                        to: customer.email,
                        subject: `[TEST] Invoice #${invoiceId} from Weeecycle Workshop`,
                        html: mailHtml
                    };
                    transporter.sendMail(mailOptions, (mailErr) => {
                        if (mailErr) console.error('Error sending simulated invoice email:', mailErr);
                        else console.log('Simulated invoice email sent successfully to:', customer.email);
                    });
                }

                const now = new Date().toISOString();
                const updateSql = `UPDATE invoices SET stripeInvoiceId=?, hostedInvoiceUrl=?, status=?, updatedAt=? WHERE id=?`;
                workshopDb.run(updateSql, [mockInvoiceId, mockHostedUrl, 'Sent', now, invoiceId], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({
                        success: true,
                        isMock: true,
                        invoice: {
                            ...invoice,
                            items,
                            stripeInvoiceId: mockInvoiceId,
                            hostedInvoiceUrl: mockHostedUrl,
                            status: 'Sent',
                            updatedAt: now
                        }
                    });
                });
            } else {
                try {
                    const stripe = require('stripe')(stripeSecret);
                    let stripeCustomerId = customer.stripeCustomerId;

                    // 1. Create Stripe Customer if missing
                    if (!stripeCustomerId) {
                        const stripeCust = await stripe.customers.create({
                            name: `${customer.firstName} ${customer.lastName}`,
                            email: customer.email,
                            phone: customer.phone || undefined,
                            address: customer.address ? {
                                line1: customer.address,
                                city: customer.city || undefined,
                                state: customer.state || undefined,
                                postal_code: customer.zipCode || undefined,
                                country: 'US'
                            } : undefined
                        });
                        stripeCustomerId = stripeCust.id;
                        
                        workshopDb.run('UPDATE customers SET stripeCustomerId=? WHERE id=?', [stripeCustomerId, customer.id], (err) => {
                            if (err) console.error('Error saving customer stripeCustomerId:', err);
                        });
                    }

                    // 2. Create Stripe Invoice object
                    const stripeInvoice = await stripe.invoices.create({
                        customer: stripeCustomerId,
                        collection_method: 'send_invoice',
                        days_until_due: 30,
                        auto_advance: true
                    });

                    // 3. Create Stripe Line items
                    for (const item of items) {
                        const qty = item.quantity || 1;
                        const priceCents = Math.round((item.price || 0) * 100);
                        
                        let taxRates = [];
                        if (item.taxable) {
                            const rates = await stripe.taxRates.list({ limit: 100 });
                            let kyTaxRate = rates.data.find(r => r.percentage === 6 && r.active);
                            if (!kyTaxRate) {
                                kyTaxRate = await stripe.taxRates.create({
                                    display_name: 'KY Sales Tax',
                                    description: 'Kentucky Sales Tax',
                                    jurisdiction: 'US - KY',
                                    percentage: 6,
                                    inclusive: false,
                                });
                            }
                            taxRates = [kyTaxRate.id];
                        }

                        await stripe.invoiceItems.create({
                            customer: stripeCustomerId,
                            invoice: stripeInvoice.id,
                            amount: priceCents * qty,
                            currency: 'usd',
                            description: item.description,
                            tax_rates: taxRates
                        });
                    }

                    // 4. Send the Stripe Invoice
                    const finalizedInvoice = await stripe.invoices.sendInvoice(stripeInvoice.id);

                    const now = new Date().toISOString();
                    const updateSql = `UPDATE invoices SET stripeInvoiceId=?, hostedInvoiceUrl=?, status=?, updatedAt=? WHERE id=?`;
                    workshopDb.run(updateSql, [finalizedInvoice.id, finalizedInvoice.hosted_invoice_url, 'Sent', now, invoiceId], function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({
                            success: true,
                            isMock: false,
                            invoice: {
                                ...invoice,
                                items,
                                stripeInvoiceId: finalizedInvoice.id,
                                hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url,
                                status: 'Sent',
                                updatedAt: now
                            }
                        });
                    });

                } catch (stripeErr) {
                    console.error('Stripe invoice creation error:', stripeErr);
                    res.status(500).json({ error: `Stripe Error: ${stripeErr.message}` });
                }
            }
        });
    });
});

// Mock Stripe Payment Webhook Simulator
app.post('/api/public/mock-stripe-pay', (req, res) => {
    const { stripeInvoiceId } = req.body;
    if (!stripeInvoiceId) {
        return res.status(400).json({ error: 'Missing stripeInvoiceId' });
    }

    console.log(`[Stripe Simulator] Simulating payment webhook for: ${stripeInvoiceId}`);
    const now = new Date().toISOString();
    
    workshopDb.run("UPDATE invoices SET status=?, updatedAt=? WHERE stripeInvoiceId=?", ['Paid', now, stripeInvoiceId], function(err) {
        if (err) {
            console.error('Error in mock invoice payment update:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, stripeInvoiceId, status: 'Paid', updatedAt: now });
    });
});

// Real Stripe Webhook Handler
app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const { secretKey: stripeSecret, webhookSecret } = await getStripeKeys();

    if (!stripeSecret) {
        return res.status(400).send('Stripe not configured.');
    }

    const stripe = require('stripe')(stripeSecret);
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('Stripe Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'invoice.paid') {
        const stripeInvoice = event.data.object;
        console.log(`[Stripe Webhook] Invoice ${stripeInvoice.id} marked as PAID.`);
        
        const now = new Date().toISOString();
        workshopDb.run('UPDATE invoices SET status=?, updatedAt=? WHERE stripeInvoiceId=?', ['Paid', now, stripeInvoice.id], function(err) {
            if (err) {
                console.error('Failed to update invoice in database:', err);
                return res.status(500).send('Database update failed');
            }
            res.json({ received: true });
        });
    } else {
        res.json({ received: true });
    }
});

app.listen(PORT, () => {
    console.log(`Weeecycle API server running on port ${PORT}`);
});

