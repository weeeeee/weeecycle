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
app.use(express.json({ limit: '50mb' }));
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

app.listen(PORT, () => {
    console.log(`Weeecycle API server running on port ${PORT}`);
});
