process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
});

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { TEMPLATES: WORK_ORDER_TEMPLATES, cleanWorkOrderData, renderWorkOrderPdf } = require('./workOrderPdf');
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
    origin: ['https://weeecycle.net', 'https://chili-cultural-disrupt.ngrok-free.dev', 'http://localhost:3000', 'http://localhost:5173'],
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

// Helper to generate HMAC token for comment moderation one-click links
function generateCommentToken(commentId, action) {
    const secret = process.env.SESSION_SECRET || 'fallback_secret_key_2025';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`comment:${commentId}:${action}`);
    return hmac.digest('hex');
}

// Authentication Middleware for Shop Mechanic (/tracker)
function requireMechanicAuth(req, res, next) {
    const token = req.cookies.mechanic_token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized. Please login.' });
        }
        return res.redirect('/mechanic-login.html');
    }
    const expectedToken = generateMechanicToken(process.env.MECHANIC_USER || 'steve');
    if (token !== expectedToken) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Invalid token. Please login.' });
        }
        return res.redirect('/mechanic-login.html');
    }
    next();
}

// Health check (public, no auth)
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Mount protected /tracker route
app.use('/tracker', requireMechanicAuth, express.static(path.join(__dirname, 'tracker')));

// POST /api/mechanic-login
app.post('/api/mechanic-login', (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.MECHANIC_USER || 'steve';
    const validPass = process.env.MECHANIC_PASS || 'weeecycle2025';

    if (username === validUser && password === validPass) {
        const token = generateMechanicToken(username);
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('mechanic_token', token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: isSecure ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        return res.json({ success: true, token, redirect: '/tracker/' });
    }
    return res.status(401).json({ error: 'Invalid username or password.' });
});

// POST /api/mechanic-logout
app.post('/api/mechanic-logout', (req, res) => {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('mechanic_token', { sameSite: isSecure ? 'none' : 'lax', secure: isSecure });
    res.json({ success: true, redirect: '/mechanic-login.html' });
});

// SQLite Workshop Database Setup (Permanent Server-Side Persistence)
let BetterSQLite;
try { BetterSQLite = require('better-sqlite3'); }
catch (err) { console.error('FATAL: better-sqlite3 failed to load:', err.message); }

const dbPath = process.env.DB_PATH || path.join(__dirname, 'weeecycle-workshop.db');
let workshopDb;
try {
    if (!BetterSQLite) throw new Error('better-sqlite3 not loaded');
    workshopDb = new BetterSQLite(dbPath);
    workshopDb.exec(`
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            firstName TEXT, lastName TEXT, phone TEXT, email TEXT,
            stripeCustomerId TEXT, address TEXT, city TEXT, state TEXT,
            zipCode TEXT, createdAt TEXT, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerId INTEGER, title TEXT, stage TEXT, bikeModel TEXT,
            estimatedCost TEXT, notes TEXT, createdAt TEXT, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerId INTEGER, type TEXT, status TEXT, issueDate TEXT,
            dueDate TEXT, items TEXT, subtotal REAL, tax REAL, total REAL,
            stripeInvoiceId TEXT, hostedInvoiceUrl TEXT, notes TEXT,
            createdAt TEXT, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS manual_parts_costs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerId INTEGER, name TEXT, price REAL, createdAt TEXT
        );
        CREATE TABLE IF NOT EXISTS work_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            edition TEXT, customerId INTEGER, data TEXT,
            createdAt TEXT, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerId INTEGER, date TEXT, vendor TEXT, category TEXT,
            description TEXT, amount REAL, fileName TEXT, fileType TEXT,
            thumb TEXT, fileData TEXT, createdAt TEXT, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS builds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, description TEXT, customerId INTEGER,
            createdAt TEXT, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buildId INTEGER, type TEXT, name TEXT,
            imageUrls TEXT, price TEXT, description TEXT,
            notes TEXT, sourceUrl TEXT, status TEXT
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buildId INTEGER, componentType TEXT, itemName TEXT,
            vendor TEXT, price TEXT, orderDate TEXT,
            expectedDelivery TEXT, trackingNumber TEXT,
            status TEXT, notes TEXT, createdAt TEXT
        );
        CREATE TABLE IF NOT EXISTS extras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buildId INTEGER, name TEXT, category TEXT,
            quantity TEXT, price TEXT, description TEXT,
            notes TEXT, sourceUrl TEXT, imageUrls TEXT,
            status TEXT, createdAt TEXT
        );
        CREATE TABLE IF NOT EXISTS geometry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buildId INTEGER UNIQUE, seatTubeCC TEXT,
            seatTubeCT TEXT, effectiveTopTube TEXT,
            stack TEXT, reach TEXT, standOver TEXT,
            headTube TEXT, headTubeAngle TEXT,
            seatTubeAngle TEXT, bbHeight TEXT, bbDrop TEXT,
            chainstay TEXT, wheelbase TEXT, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS blog_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_slug TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_website TEXT,
            body TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            ip TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_blog_comments_slug_status ON blog_comments(post_slug, status);
    `);
    // Safe migration: add columns that may not exist in older db files
    for (const sql of [
        "ALTER TABLE customers ADD COLUMN email TEXT",
        "ALTER TABLE customers ADD COLUMN stripeCustomerId TEXT",
        "ALTER TABLE customers ADD COLUMN company TEXT",
        "ALTER TABLE invoices ADD COLUMN stripeInvoiceId TEXT",
        "ALTER TABLE invoices ADD COLUMN hostedInvoiceUrl TEXT",
        "ALTER TABLE invoices ADD COLUMN discount REAL DEFAULT 0",
        "ALTER TABLE invoices ADD COLUMN bikeImage TEXT",
    ]) { try { workshopDb.exec(sql); } catch (_) {} }

    // Backfill: give every existing build a Tire component panel (new builds get one from BUILD_COMPONENT_TYPES already)
    try {
        const missingTire = workshopDb.prepare(
            `SELECT id FROM builds WHERE id NOT IN (SELECT buildId FROM components WHERE type='tire')`
        ).all();
        if (missingTire.length) {
            const insertTire = workshopDb.prepare(
                `INSERT INTO components (buildId,type,name,imageUrls,price,description,notes,sourceUrl,status) VALUES (?,'tire','','[]','','','','','planned')`
            );
            workshopDb.transaction(() => { for (const b of missingTire) insertTire.run(b.id); })();
            console.log(`Added Tire component to ${missingTire.length} existing build(s).`);
        }
    } catch (err) { console.error('Tire backfill failed:', err.message); }

    console.log('SQLite workshop database connected.');
} catch (err) {
    console.error('Error opening SQLite database:', err);
}


// REST API Endpoints for Customers (Protected by requireMechanicAuth)
app.get('/api/customers', requireMechanicAuth, (req, res) => {
    try { res.json(workshopDb.prepare('SELECT * FROM customers ORDER BY id DESC').all()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', requireMechanicAuth, (req, res) => {
    const { firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode } = req.body;
    const company = String(req.body.company || '').trim();
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare(
            `INSERT INTO customers (firstName,lastName,company,phone,email,stripeCustomerId,address,city,state,zipCode,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(firstName, lastName, company, phone, email, stripeCustomerId || null, address, city, state, zipCode, now, now);
        res.json({ id: info.lastInsertRowid, firstName, lastName, company, phone, email, stripeCustomerId, address, city, state, zipCode, createdAt: now, updatedAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/customers/:id', requireMechanicAuth, (req, res) => {
    const { firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode } = req.body;
    const company = String(req.body.company || '').trim();
    const now = new Date().toISOString();
    try {
        workshopDb.prepare(
            `UPDATE customers SET firstName=?,lastName=?,company=?,phone=?,email=?,stripeCustomerId=?,address=?,city=?,state=?,zipCode=?,updatedAt=? WHERE id=?`
        ).run(firstName, lastName, company, phone, email, stripeCustomerId || null, address, city, state, zipCode, now, req.params.id);
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/customers/:id', requireMechanicAuth, (req, res) => {
    try {
        workshopDb.prepare('DELETE FROM jobs WHERE customerId=?').run(req.params.id);
        workshopDb.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// REST API Endpoints for Jobs
app.get('/api/jobs', requireMechanicAuth, (req, res) => {
    try { res.json(workshopDb.prepare('SELECT * FROM jobs ORDER BY id DESC').all()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/jobs', requireMechanicAuth, (req, res) => {
    const { customerId, title, stage, bikeModel, estimatedCost, notes } = req.body;
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare(
            `INSERT INTO jobs (customerId,title,stage,bikeModel,estimatedCost,notes,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`
        ).run(customerId, title, stage, bikeModel, estimatedCost, notes, now, now);
        res.json({ id: info.lastInsertRowid, customerId, title, stage, bikeModel, estimatedCost, notes, createdAt: now, updatedAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/jobs/:id', requireMechanicAuth, (req, res) => {
    const { stage, notes, estimatedCost, bikeModel } = req.body;
    const now = new Date().toISOString();
    try {
        if (stage && !notes && !estimatedCost) {
            workshopDb.prepare(`UPDATE jobs SET stage=?,updatedAt=? WHERE id=?`).run(stage, now, req.params.id);
        } else {
            // bikeModel is optional here: when a request doesn't send it, the saved bike is left alone (an empty string clears it)
            workshopDb.prepare(`UPDATE jobs SET bikeModel=COALESCE(?,bikeModel),notes=?,estimatedCost=?,updatedAt=? WHERE id=?`)
                .run(bikeModel === undefined ? null : String(bikeModel).slice(0, 200), notes, estimatedCost, now, req.params.id);
        }
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/jobs/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM jobs WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// REST API Endpoints for Invoices (Protected by requireMechanicAuth)
app.get('/api/invoices', requireMechanicAuth, (req, res) => {
    try {
        const rows = workshopDb.prepare(
            `SELECT id,customerId,type,status,issueDate,dueDate,items,subtotal,tax,discount,total,stripeInvoiceId,hostedInvoiceUrl,notes,createdAt,updatedAt,
                    (bikeImage IS NOT NULL AND bikeImage != '') AS hasBikeImage
             FROM invoices ORDER BY id DESC`
        ).all();
        res.json(rows.map(row => ({ ...row, hasBikeImage: !!row.hasBikeImage, items: row.items ? JSON.parse(row.items) : [] })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Optional bike photo on a quote/invoice. Stored on the invoice row but only served by the /image endpoint.
const BIKE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
function parseBikeImage(dataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || '');
    if (!m || Math.floor(m[2].length * 3 / 4) > BIKE_IMAGE_MAX_BYTES) return null;
    return { type: m[1].toLowerCase(), buffer: Buffer.from(m[2], 'base64') };
}
const BIKE_IMAGE_ERROR = 'Bike photo must be a JPEG, PNG or WebP image under 4 MB.';

app.get('/api/invoices/:id/image', requireMechanicAuth, (req, res) => {
    try {
        const row = workshopDb.prepare('SELECT bikeImage FROM invoices WHERE id=?').get(req.params.id);
        const img = row && parseBikeImage(row.bikeImage);
        if (!img) return res.status(404).json({ error: 'No bike photo on this document' });
        res.set({ 'Content-Type': img.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-cache' });
        res.send(img.buffer);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/invoices', requireMechanicAuth, (req, res) => {
    const { customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes } = req.body;
    const discount = Math.max(0, parseFloat(req.body.discount) || 0);
    const bikeImage = req.body.bikeImage || null;
    if (bikeImage && !parseBikeImage(bikeImage)) return res.status(400).json({ error: BIKE_IMAGE_ERROR });
    const now = new Date().toISOString();
    const itemsStr = JSON.stringify(items || []);
    try {
        const info = workshopDb.prepare(
            `INSERT INTO invoices (customerId,type,status,issueDate,dueDate,items,subtotal,tax,discount,total,stripeInvoiceId,hostedInvoiceUrl,notes,bikeImage,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(customerId, type, status, issueDate, dueDate, itemsStr, subtotal, tax, discount, total, stripeInvoiceId || null, hostedInvoiceUrl || null, notes, bikeImage, now, now);
        res.json({ id: info.lastInsertRowid, customerId, type, status, issueDate, dueDate, items, subtotal, tax, discount, total, stripeInvoiceId, hostedInvoiceUrl, notes, hasBikeImage: !!bikeImage, createdAt: now, updatedAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/invoices/:id', requireMechanicAuth, (req, res) => {
    const { customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes } = req.body;
    const discount = Math.max(0, parseFloat(req.body.discount) || 0);
    const changesPhoto = 'bikeImage' in req.body;
    const bikeImage = req.body.bikeImage || null;
    if (bikeImage && !parseBikeImage(bikeImage)) return res.status(400).json({ error: BIKE_IMAGE_ERROR });
    const now = new Date().toISOString();
    const itemsStr = JSON.stringify(items || []);
    try {
        const prev = workshopDb.prepare('SELECT status FROM invoices WHERE id=?').get(req.params.id);
        workshopDb.prepare(
            `UPDATE invoices SET customerId=?,type=?,status=?,issueDate=?,dueDate=?,items=?,subtotal=?,tax=?,discount=?,total=?,stripeInvoiceId=?,hostedInvoiceUrl=?,notes=?,updatedAt=? WHERE id=?`
        ).run(customerId, type, status, issueDate, dueDate, itemsStr, subtotal, tax, discount, total, stripeInvoiceId || null, hostedInvoiceUrl || null, notes, now, req.params.id);
        if (changesPhoto) workshopDb.prepare('UPDATE invoices SET bikeImage=? WHERE id=?').run(bikeImage, req.params.id);
        if (prev && prev.status !== 'Paid' && status === 'Paid') sendReceiptForInvoice(req.params.id, null);
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/invoices/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM invoices WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// Stripe API Helpers & Endpoints
function getStripeConfig() {
    const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    const isMock = !secretKey || secretKey.startsWith('sk_live_...') || secretKey.startsWith('sk_test_...') || secretKey.includes('placeholder');
    return { secretKey, webhookSecret, isMock };
}

// Pass `receipt` ({ paidAt, paidVia }) to send a payment receipt instead of the invoice.
async function sendInvoiceEmail({ customer, invoice, hostedUrl, customMessage, receipt }) {
    if (!customer.email || !customer.email.trim()) {
        throw new Error('Customer has no email address.');
    }
    if (!transporter) {
        throw new Error('Email delivery is not configured on the server (check SMTP/Resend in .env).');
    }

    const items = invoice.items ? (typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items) : [];
    const isQuote = invoice.type === 'quote';
    const docTitle = receipt ? 'Receipt' : (isQuote ? 'Quote' : 'Invoice');
    const totalFormatted = (parseFloat(invoice.total) || 0).toFixed(2);
    const subtotalFormatted = (parseFloat(invoice.subtotal) || 0).toFixed(2);
    const taxFormatted = (parseFloat(invoice.tax) || 0).toFixed(2);
    const discount = parseFloat(invoice.discount) || 0;

    const itemsHtml = items.map(item => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 8px; color: #1e293b; font-size: 14px;">${item.description}</td>
            <td style="padding: 10px 8px; text-align: center; color: #64748b; font-size: 14px;">${item.quantity || 1}</td>
            <td style="padding: 10px 8px; text-align: right; color: #1e293b; font-size: 14px;">$${(parseFloat(item.price) || 0).toFixed(2)}</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #0f172a; font-size: 14px;">$${((item.quantity || 1) * (parseFloat(item.price) || 0)).toFixed(2)}</td>
        </tr>
    `).join('');

    const paidDate = receipt ? new Date(receipt.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' }) : '';
    const paidBannerHtml = receipt ? `
        <div style="margin: 28px 0; text-align: center; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px;">
            <div style="font-size: 20px; font-weight: bold; color: #059669;">✅ PAID $${totalFormatted}</div>
            <p style="margin: 6px 0 0; font-size: 13px; color: #047857;">${paidDate}${receipt.paidVia ? ` • ${receipt.paidVia}` : ''}</p>
        </div>
    ` : '';

    const payButtonHtml = receipt ? paidBannerHtml : hostedUrl ? `
        <div style="margin: 28px 0; text-align: center;">
            <a href="${hostedUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #635bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(99, 91, 255, 0.3);">
                💳 Pay Online ($${totalFormatted})
            </a>
            <p style="margin: 10px 0 0; font-size: 12px; color: #64748b;">Accepts Card, Apple Pay, & Google Pay</p>
        </div>
    ` : '';

    const mailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1e293b; line-height: 1.6; background: #f8fafc; padding: 24px;">
            <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="background: #FF8000; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: -0.5px;">Weeecycle Workshop</h1>
                    <p style="color: #fff; margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Road & Gravel Specialists • Lexington, KY</p>
                </div>
                <div style="padding: 32px 28px;">
                    <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Hello ${customer.firstName},</h2>
                    <p style="color: #475569; font-size: 15px; margin-top: 4px;">
                        ${receipt
                            ? `Thank you! We've received your payment for invoice <strong>#${invoice.id}</strong>. This email is your receipt.`
                            : `Here is your ${docTitle.toLowerCase()} <strong>#${invoice.id}</strong> from Weeecycle Workshop.`}
                    </p>
                    ${customMessage ? `<div style="background: #f1f5f9; border-left: 4px solid #FF8000; padding: 12px 16px; margin: 20px 0; border-radius: 4px; font-style: italic; color: #334155;">"${customMessage}"</div>` : ''}
                    
                    ${payButtonHtml}

                    <div style="margin-top: 24px;">
                        <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">Line Items</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <thead>
                                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                    <th style="padding: 8px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Description</th>
                                    <th style="padding: 8px; text-align: center; font-size: 12px; color: #64748b; text-transform: uppercase; width: 50px;">Qty</th>
                                    <th style="padding: 8px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase; width: 80px;">Price</th>
                                    <th style="padding: 8px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase; width: 80px;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>

                        <div style="width: 240px; margin-left: auto; margin-top: 12px;">
                            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; padding: 4px 0;">
                                <span>Subtotal:</span><span>$${subtotalFormatted}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; padding: 4px 0;">
                                <span>KY Tax (6%):</span><span>$${taxFormatted}</span>
                            </div>
                            ${discount > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #059669; padding: 4px 0;">
                                <span>Discount:</span><span>-$${discount.toFixed(2)}</span>
                            </div>` : ''}
                            <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 8px; margin-top: 4px;">
                                <span>Total:</span><span>$${totalFormatted}</span>
                            </div>
                        </div>
                    </div>

                    ${invoice.notes ? `
                        <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                            <h4 style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; color: #64748b;">Terms & Notes</h4>
                            <p style="margin: 0; font-size: 13px; color: #64748b; white-space: pre-wrap;">${invoice.notes}</p>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 36px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                        <p style="margin: 0;">Weeecycle Workshop • steve@weeecycle.net</p>
                        <p style="margin: 4px 0 0;">Thank you for your business!</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    return transporter.sendMail({
        from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
        to: customer.email.trim(),
        subject: receipt
            ? `Weeecycle Workshop Receipt for Invoice #${invoice.id} ($${totalFormatted} paid)`
            : `Weeecycle Workshop ${docTitle} #${invoice.id} ($${totalFormatted})`,
        html: mailHtml
    });
}

// Email a Weeecycle receipt for a paid invoice. Never throws: a mail failure must not undo the payment update.
async function sendReceiptForInvoice(invoiceId, paidVia) {
    try {
        const invoice = workshopDb.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
        if (!invoice || invoice.type !== 'invoice') return;
        const customer = workshopDb.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customerId);
        if (!customer?.email?.trim()) return;
        await sendInvoiceEmail({ customer, invoice, receipt: { paidAt: new Date(), paidVia } });
        console.log(`[Receipt] Emailed receipt for invoice #${invoiceId} to ${customer.email.trim()}`);
    } catch (err) {
        console.error(`Receipt email error for invoice #${invoiceId}:`, err.message);
    }
}

async function ensureStripeInvoice(invoice, customer) {
    const { secretKey, isMock } = getStripeConfig();

    // Reuse an existing hosted invoice, unless it's a simulator one and a real key is now configured.
    const cachedIsMock = !!invoice.hostedInvoiceUrl && invoice.hostedInvoiceUrl.includes('/mock/');
    if (invoice.hostedInvoiceUrl && (isMock || !cachedIsMock)) {
        return {
            stripeInvoiceId: invoice.stripeInvoiceId,
            hostedInvoiceUrl: invoice.hostedInvoiceUrl,
            isMock: cachedIsMock
        };
    }
    const items = invoice.items ? (typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items) : [];

    if (isMock) {
        console.log(`[Stripe Simulator] Generating mock Stripe hosted invoice for invoice #${invoice.id}`);
        const mockInvoiceId = 'in_mock_' + Math.random().toString(36).substring(2, 11);
        const mockHostedUrl = `https://invoice.stripe.com/mock/${mockInvoiceId}`;
        const stripeCustomerId = customer.stripeCustomerId || ('cus_mock_' + Math.random().toString(36).substring(2, 11));
        try { workshopDb.prepare('UPDATE customers SET stripeCustomerId=? WHERE id=?').run(stripeCustomerId, customer.id); } catch (_) {}
        const now = new Date().toISOString();
        workshopDb.prepare('UPDATE invoices SET stripeInvoiceId=?,hostedInvoiceUrl=?,status=?,updatedAt=? WHERE id=?')
            .run(mockInvoiceId, mockHostedUrl, 'Sent', now, invoice.id);
        return { stripeInvoiceId: mockInvoiceId, hostedInvoiceUrl: mockHostedUrl, isMock: true };
    }

    const stripe = require('stripe')(secretKey);
    let stripeCustomerId = customer.stripeCustomerId;

    if (stripeCustomerId && !stripeCustomerId.startsWith('cus_mock_')) {
        try {
            await stripe.customers.retrieve(stripeCustomerId);
        } catch (_) {
            stripeCustomerId = null;
        }
    }

    if (!stripeCustomerId || stripeCustomerId.startsWith('cus_mock_')) {
        const stripeCust = await stripe.customers.create({
            name: `${customer.firstName} ${customer.lastName}`.trim(),
            email: customer.email?.trim() || undefined,
            phone: customer.phone || undefined,
            address: customer.address ? {
                line1: customer.address,
                city: customer.city || undefined,
                state: customer.state || undefined,
                postal_code: customer.zipCode || undefined,
                country: 'US'
            } : undefined,
            metadata: { workshopCustomerId: String(customer.id) }
        });
        stripeCustomerId = stripeCust.id;
        try { workshopDb.prepare('UPDATE customers SET stripeCustomerId=? WHERE id=?').run(stripeCustomerId, customer.id); } catch (_) {}
    }

    let kyTaxRateId = null;
    if (items.some(i => i.taxable)) {
        const rates = await stripe.taxRates.list({ limit: 100 });
        let kyTaxRate = rates.data.find(r => r.percentage === 6 && r.active);
        if (!kyTaxRate) {
            kyTaxRate = await stripe.taxRates.create({
                display_name: 'KY Sales Tax',
                description: 'Kentucky Sales Tax (6%)',
                jurisdiction: 'US - KY',
                percentage: 6,
                inclusive: false,
            });
        }
        kyTaxRateId = kyTaxRate.id;
    }

    const stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        collection_method: 'send_invoice',
        days_until_due: 30,
        // We finalize manually and email the customer ourselves, so Stripe never sends its own invoice email.
        auto_advance: false,
        description: `Weeecycle Workshop Invoice #${invoice.id}`,
        metadata: { workshopInvoiceId: String(invoice.id), customerId: String(customer.id) }
    });

    for (const item of items) {
        const qty = parseInt(item.quantity) || 1;
        const priceCents = Math.round((parseFloat(item.price) || 0) * 100);
        await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice: stripeInvoice.id,
            amount: priceCents * qty,
            currency: 'usd',
            description: `${item.description}${qty > 1 ? ` (${qty} @ $${parseFloat(item.price).toFixed(2)})` : ''}`,
            tax_rates: item.taxable && kyTaxRateId ? [kyTaxRateId] : []
        });
    }

    const discountAmount = Math.max(0, parseFloat(invoice.discount) || 0);
    if (discountAmount > 0) {
        const discountCents = Math.round(discountAmount * 100);
        const coupon = await stripe.coupons.create({
            amount_off: discountCents,
            currency: 'usd',
            duration: 'once',
            name: `Discount ($${discountAmount.toFixed(2)})`
        });
        await stripe.invoices.update(stripeInvoice.id, {
            discounts: [{ coupon: coupon.id }]
        });
    }

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id, { auto_advance: false });
    const now = new Date().toISOString();
    workshopDb.prepare('UPDATE invoices SET stripeInvoiceId=?,hostedInvoiceUrl=?,status=?,updatedAt=? WHERE id=?')
        .run(finalizedInvoice.id, finalizedInvoice.hosted_invoice_url, 'Sent', now, invoice.id);

    return {
        stripeInvoiceId: finalizedInvoice.id,
        hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url,
        isMock: false
    };
}

// POST /api/invoices/:id/send - Email the invoice (with Stripe pay link) to the customer
app.post('/api/invoices/:id/send', requireMechanicAuth, async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const { customMessage } = req.body;

        const invoice = workshopDb.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

        const customer = workshopDb.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customerId);
        if (!customer) return res.status(404).json({ error: 'Customer not found.' });

        if (!customer.email || !customer.email.trim()) {
            return res.status(400).json({ error: `Cannot send email: ${customer.firstName} ${customer.lastName} has no email address on file.` });
        }

        let stripeInfo = null;
        if (invoice.type === 'invoice') {
            stripeInfo = await ensureStripeInvoice(invoice, customer);
        }

        const hostedUrl = stripeInfo?.hostedInvoiceUrl || invoice.hostedInvoiceUrl || null;
        await sendInvoiceEmail({ customer, invoice, hostedUrl, customMessage });

        if (invoice.status === 'Draft') {
            workshopDb.prepare('UPDATE invoices SET status=?,updatedAt=? WHERE id=?').run('Sent', new Date().toISOString(), invoiceId);
        }

        const updatedInvoice = workshopDb.prepare(
            `SELECT id,customerId,type,status,issueDate,dueDate,items,subtotal,tax,discount,total,stripeInvoiceId,hostedInvoiceUrl,notes,createdAt,updatedAt,
                    (bikeImage IS NOT NULL AND bikeImage != '') AS hasBikeImage
             FROM invoices WHERE id = ?`
        ).get(invoiceId);

        if (updatedInvoice) {
            updatedInvoice.hasBikeImage = !!updatedInvoice.hasBikeImage;
            updatedInvoice.items = updatedInvoice.items ? JSON.parse(updatedInvoice.items) : [];
        }

        res.json({ success: true, emailSent: true, invoice: updatedInvoice });
    } catch (err) {
        console.error('Send invoice error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/webhooks/stripe - Public Webhook for Stripe Events (e.g. invoice.paid)
app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const { secretKey, webhookSecret, isMock } = getStripeConfig();

    if (isMock || !secretKey) {
        return res.status(400).send('Stripe is not configured in live mode.');
    }

    const stripe = require('stripe')(secretKey);
    let event;

    if (!webhookSecret) {
        // Without signature verification anyone could POST a fake invoice.paid event.
        console.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not set.');
        return res.status(400).send('Webhook secret not configured.');
    }

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('Stripe Webhook signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        const stripeInvoice = event.data.object;
        console.log(`[Stripe Webhook] Invoice ${stripeInvoice.id} paid successfully.`);
        const now = new Date().toISOString();
        try {
            const row = workshopDb.prepare('SELECT id,status FROM invoices WHERE stripeInvoiceId=?').get(stripeInvoice.id);
            workshopDb.prepare('UPDATE invoices SET status=?,updatedAt=? WHERE stripeInvoiceId=?').run('Paid', now, stripeInvoice.id);
            // Stripe may deliver the same event more than once; only send the receipt on the first transition to Paid.
            if (row && row.status !== 'Paid') sendReceiptForInvoice(row.id, 'Paid online');
            res.json({ received: true });
        } catch (dbErr) {
            console.error('Error updating invoice status from Stripe webhook:', dbErr);
            res.status(500).send('Database error');
        }
    } else {
        res.json({ received: true });
    }
});

// POST /api/public/mock-stripe-pay - Simulator Payment Helper
app.post('/api/public/mock-stripe-pay', (req, res) => {
    const { stripeInvoiceId } = req.body;
    if (!stripeInvoiceId) return res.status(400).json({ error: 'Missing stripeInvoiceId' });
    // Public endpoint: only simulator invoices may be marked paid here, never real Stripe ones.
    if (!String(stripeInvoiceId).startsWith('in_mock_')) return res.status(403).json({ error: 'Only simulator invoices can be paid here.' });
    const now = new Date().toISOString();
    try {
        workshopDb.prepare('UPDATE invoices SET status=?,updatedAt=? WHERE stripeInvoiceId=?').run('Paid', now, stripeInvoiceId);
        res.json({ success: true, stripeInvoiceId, status: 'Paid', updatedAt: now });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// REST API Endpoints for Manual Parts Costs (Protected by requireMechanicAuth)
app.get('/api/manual-parts-costs', requireMechanicAuth, (_req, res) => {
    try { res.json(workshopDb.prepare('SELECT * FROM manual_parts_costs ORDER BY id ASC').all()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/manual-parts-costs', requireMechanicAuth, (req, res) => {
    const { customerId, name, price } = req.body;
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare(
            `INSERT INTO manual_parts_costs (customerId,name,price,createdAt) VALUES (?,?,?,?)`
        ).run(customerId, name, parseFloat(price) || 0, now);
        res.json({ id: info.lastInsertRowid, customerId, name, price: parseFloat(price) || 0, createdAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/manual-parts-costs/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM manual_parts_costs WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// REST API Endpoints for Receipts (Protected by requireMechanicAuth)
// The list endpoint returns metadata + a small thumbnail only; the full file is fetched per receipt.
const RECEIPT_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const RECEIPT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const RECEIPT_COLUMNS = 'id,customerId,date,vendor,category,description,amount,fileName,fileType,thumb,createdAt,updatedAt';

function parseReceiptDataUrl(dataUrl) {
    const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || '');
    if (!m) return null;
    const type = m[1].toLowerCase();
    if (!RECEIPT_FILE_TYPES.includes(type)) return null;
    if (Math.floor(m[2].length * 3 / 4) > RECEIPT_MAX_FILE_BYTES) return null;
    return { type, buffer: Buffer.from(m[2], 'base64') };
}

app.get('/api/receipts', requireMechanicAuth, (_req, res) => {
    try { res.json(workshopDb.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts ORDER BY date DESC, id DESC`).all()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/receipts', requireMechanicAuth, (req, res) => {
    const { customerId, date, vendor, category, description, amount, fileName, fileData, thumb } = req.body;
    const file = parseReceiptDataUrl(fileData);
    if (!file) return res.status(400).json({ error: 'Receipt must be a JPEG, PNG, WebP or PDF file under 8 MB.' });
    if (thumb && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(thumb)) return res.status(400).json({ error: 'Invalid thumbnail.' });
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare(
            `INSERT INTO receipts (customerId,date,vendor,category,description,amount,fileName,fileType,thumb,fileData,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(customerId ? parseInt(customerId) : null, date || now.slice(0, 10), vendor || '', category || 'Other', description || '',
              parseFloat(amount) || 0, String(fileName || 'receipt').slice(0, 200), file.type, thumb || null, fileData, now, now);
        res.json(workshopDb.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id=?`).get(info.lastInsertRowid));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/receipts/:id', requireMechanicAuth, (req, res) => {
    const { customerId, date, vendor, category, description, amount } = req.body;
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare(
            `UPDATE receipts SET customerId=?,date=?,vendor=?,category=?,description=?,amount=?,updatedAt=? WHERE id=?`
        ).run(customerId ? parseInt(customerId) : null, date, vendor || '', category || 'Other', description || '', parseFloat(amount) || 0, now, req.params.id);
        if (!info.changes) return res.status(404).json({ error: 'Receipt not found' });
        res.json(workshopDb.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id=?`).get(req.params.id));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/receipts/:id/file', requireMechanicAuth, (req, res) => {
    try {
        const row = workshopDb.prepare('SELECT fileName,fileData FROM receipts WHERE id=?').get(req.params.id);
        const file = row && parseReceiptDataUrl(row.fileData);
        if (!file) return res.status(404).json({ error: 'Receipt file not found' });
        res.set({
            'Content-Type': file.type,
            'Content-Disposition': `inline; filename="${String(row.fileName).replace(/[^\w.\- ]/g, '_')}"`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=3600'
        });
        res.send(file.buffer);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/receipts/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM receipts WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// REST API Endpoints for Work Orders / Inspection Checklists (Protected by requireMechanicAuth)
function hydrateWorkOrder(row) {
    let data = {};
    try { data = JSON.parse(row.data || '{}'); } catch (e) { /* damaged row: treated as empty */ }
    return { ...row, data: cleanWorkOrderData(row.edition, data) };
}

app.get('/api/work-order-templates', requireMechanicAuth, (_req, res) => res.json(WORK_ORDER_TEMPLATES));

app.get('/api/work-orders', requireMechanicAuth, (_req, res) => {
    try { res.json(workshopDb.prepare('SELECT * FROM work_orders ORDER BY updatedAt DESC, id DESC').all().map(hydrateWorkOrder)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/work-orders', requireMechanicAuth, (req, res) => {
    const { edition, customerId } = req.body;
    if (!WORK_ORDER_TEMPLATES[edition]) return res.status(400).json({ error: 'Edition must be "rim" or "disc".' });
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare('INSERT INTO work_orders (edition,customerId,data,createdAt,updatedAt) VALUES (?,?,?,?,?)')
            .run(edition, customerId ? parseInt(customerId) : null, JSON.stringify(cleanWorkOrderData(edition, req.body.data)), now, now);
        res.json(hydrateWorkOrder(workshopDb.prepare('SELECT * FROM work_orders WHERE id=?').get(info.lastInsertRowid)));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/work-orders/:id', requireMechanicAuth, (req, res) => {
    try {
        const row = workshopDb.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Work order not found' });
        workshopDb.prepare('UPDATE work_orders SET customerId=?,data=?,updatedAt=? WHERE id=?')
            .run(req.body.customerId ? parseInt(req.body.customerId) : null, JSON.stringify(cleanWorkOrderData(row.edition, req.body.data)), new Date().toISOString(), req.params.id);
        res.json(hydrateWorkOrder(workshopDb.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id)));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/work-orders/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM work_orders WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

const workOrderPdfName = (order) => `work-order-${String(order.data.header.woTag || order.id).replace(/[^\w.-]+/g, '_').slice(0, 40)}.pdf`;

app.get('/api/work-orders/:id/pdf', requireMechanicAuth, async (req, res) => {
    try {
        const row = workshopDb.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Work order not found' });
        const order = hydrateWorkOrder(row);
        const pdf = await renderWorkOrderPdf(order);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${workOrderPdfName(order)}"`, 'Cache-Control': 'no-store' });
        res.send(pdf);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Builds, Components, Orders, Extras, Geometry ─────────────────────────────

const BUILD_COMPONENT_TYPES = ['frame','wheelset','bottomBracket','crank','frontDerailleur','rearDerailleur','levers','cassette','chain','seat','seatPost','headset','stem','fork','handlebars','tire'];

// Helper: parse imageUrls JSON from SQLite row
function parseImageUrls(row) {
    try { return row.imageUrls ? JSON.parse(row.imageUrls) : []; }
    catch (_) { return []; }
}

// GET /api/builds — returns all builds + all nested data for sync
app.get('/api/builds', requireMechanicAuth, (_req, res) => {
    try {
        const builds = workshopDb.prepare('SELECT * FROM builds ORDER BY createdAt ASC').all();
        const components = workshopDb.prepare('SELECT * FROM components ORDER BY id ASC').all()
            .map(r => ({ ...r, imageUrls: parseImageUrls(r) }));
        const orders = workshopDb.prepare('SELECT * FROM orders ORDER BY id ASC').all();
        const extras = workshopDb.prepare('SELECT * FROM extras ORDER BY id ASC').all()
            .map(r => ({ ...r, imageUrls: parseImageUrls(r) }));
        const geometry = workshopDb.prepare('SELECT * FROM geometry ORDER BY id ASC').all();
        res.json({ builds, components, orders, extras, geometry });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/builds — create build + 15 component stubs
app.post('/api/builds', requireMechanicAuth, (req, res) => {
    const { name, description } = req.body;
    const now = new Date().toISOString();
    try {
        const buildInfo = workshopDb.prepare(
            `INSERT INTO builds (name,description,createdAt,updatedAt) VALUES (?,?,?,?)`
        ).run(name || 'Untitled Build', description || '', now, now);
        const buildId = buildInfo.lastInsertRowid;

        const insertComp = workshopDb.prepare(
            `INSERT INTO components (buildId,type,name,imageUrls,price,description,notes,sourceUrl,status) VALUES (?,?,?,?,?,?,?,?,?)`
        );
        const components = [];
        workshopDb.transaction(() => {
            for (const type of BUILD_COMPONENT_TYPES) {
                const ci = insertComp.run(buildId, type, '', '[]', '', '', '', '', 'planned');
                components.push({ id: ci.lastInsertRowid, buildId, type, name: '', imageUrls: [], price: '', description: '', notes: '', sourceUrl: '', status: 'planned' });
            }
        })();

        res.json({ build: { id: buildId, name, description: description || '', customerId: null, createdAt: now, updatedAt: now }, components });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/builds/:id — update build name / description / customerId
app.put('/api/builds/:id', requireMechanicAuth, (req, res) => {
    const { name, description, customerId } = req.body;
    const now = new Date().toISOString();
    try {
        workshopDb.prepare(`UPDATE builds SET name=?,description=?,customerId=?,updatedAt=? WHERE id=?`)
            .run(name, description || '', customerId !== undefined ? customerId : null, now, req.params.id);
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/builds/:id — cascade delete build + all children
app.delete('/api/builds/:id', requireMechanicAuth, (req, res) => {
    try {
        workshopDb.transaction(() => {
            workshopDb.prepare('DELETE FROM components WHERE buildId=?').run(req.params.id);
            workshopDb.prepare('DELETE FROM orders WHERE buildId=?').run(req.params.id);
            workshopDb.prepare('DELETE FROM extras WHERE buildId=?').run(req.params.id);
            workshopDb.prepare('DELETE FROM geometry WHERE buildId=?').run(req.params.id);
            workshopDb.prepare('DELETE FROM builds WHERE id=?').run(req.params.id);
        })();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/components — adds a single missing component stub to an existing build
// (used to self-heal builds created before a component type like "tire" existed)
app.post('/api/components', requireMechanicAuth, (req, res) => {
    const { buildId, type } = req.body;
    if (!buildId || !BUILD_COMPONENT_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid buildId or component type.' });
    try {
        const build = workshopDb.prepare('SELECT id FROM builds WHERE id=?').get(buildId);
        if (!build) return res.status(404).json({ error: 'Build not found on the server.' });
        const existing = workshopDb.prepare('SELECT * FROM components WHERE buildId=? AND type=?').get(buildId, type);
        if (existing) return res.json({ ...existing, imageUrls: parseImageUrls(existing) });
        const info = workshopDb.prepare(
            `INSERT INTO components (buildId,type,name,imageUrls,price,description,notes,sourceUrl,status) VALUES (?,?,'','[]','','','','','planned')`
        ).run(buildId, type);
        res.json({ id: info.lastInsertRowid, buildId: parseInt(buildId), type, name: '', imageUrls: [], price: '', description: '', notes: '', sourceUrl: '', status: 'planned' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/components/:id — update a single component
app.put('/api/components/:id', requireMechanicAuth, (req, res) => {
    const { name, price, description, notes, sourceUrl, status, imageUrls } = req.body;
    const imageUrlsStr = JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []);
    try {
        // also bump build updatedAt
        const comp = workshopDb.prepare('SELECT buildId FROM components WHERE id=?').get(req.params.id);
        if (comp) {
            workshopDb.prepare('UPDATE builds SET updatedAt=? WHERE id=?')
                .run(new Date().toISOString(), comp.buildId);
        }
        workshopDb.prepare(
            `UPDATE components SET name=?,price=?,description=?,notes=?,sourceUrl=?,status=?,imageUrls=? WHERE id=?`
        ).run(name || '', price || '', description || '', notes || '', sourceUrl || '', status || 'planned', imageUrlsStr, req.params.id);
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/builds/:id/orders
app.get('/api/builds/:id/orders', requireMechanicAuth, (req, res) => {
    try { res.json(workshopDb.prepare('SELECT * FROM orders WHERE buildId=? ORDER BY id ASC').all(req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/builds/:id/orders
app.post('/api/builds/:id/orders', requireMechanicAuth, (req, res) => {
    const { componentType, itemName, vendor, price, orderDate, expectedDelivery, trackingNumber, status, notes } = req.body;
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare(
            `INSERT INTO orders (buildId,componentType,itemName,vendor,price,orderDate,expectedDelivery,trackingNumber,status,notes,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).run(req.params.id, componentType || '', itemName || '', vendor || '', price || '', orderDate || '', expectedDelivery || '', trackingNumber || '', status || 'pending', notes || '', now);
        res.json({ id: info.lastInsertRowid, buildId: parseInt(req.params.id), componentType, itemName, vendor, price, orderDate, expectedDelivery, trackingNumber, status, notes, createdAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/orders/:id
app.put('/api/orders/:id', requireMechanicAuth, (req, res) => {
    const { componentType, itemName, vendor, price, orderDate, expectedDelivery, trackingNumber, status, notes } = req.body;
    try {
        workshopDb.prepare(
            `UPDATE orders SET componentType=?,itemName=?,vendor=?,price=?,orderDate=?,expectedDelivery=?,trackingNumber=?,status=?,notes=? WHERE id=?`
        ).run(componentType || '', itemName || '', vendor || '', price || '', orderDate || '', expectedDelivery || '', trackingNumber || '', status || 'pending', notes || '', req.params.id);
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/orders/:id
app.delete('/api/orders/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM orders WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/builds/:id/extras
app.get('/api/builds/:id/extras', requireMechanicAuth, (req, res) => {
    try {
        const rows = workshopDb.prepare('SELECT * FROM extras WHERE buildId=? ORDER BY id ASC').all(req.params.id);
        res.json(rows.map(r => ({ ...r, imageUrls: parseImageUrls(r) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/builds/:id/extras
app.post('/api/builds/:id/extras', requireMechanicAuth, (req, res) => {
    const { name, category, quantity, price, description, notes, sourceUrl, imageUrls, status } = req.body;
    const now = new Date().toISOString();
    const imageUrlsStr = JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []);
    try {
        const info = workshopDb.prepare(
            `INSERT INTO extras (buildId,name,category,quantity,price,description,notes,sourceUrl,imageUrls,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).run(req.params.id, name || '', category || '', quantity || '1', price || '', description || '', notes || '', sourceUrl || '', imageUrlsStr, status || 'planned', now);
        res.json({ id: info.lastInsertRowid, buildId: parseInt(req.params.id), name, category, quantity, price, description, notes, sourceUrl, imageUrls: imageUrls || [], status, createdAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/extras/:id
app.put('/api/extras/:id', requireMechanicAuth, (req, res) => {
    const { name, category, quantity, price, description, notes, sourceUrl, imageUrls, status } = req.body;
    const imageUrlsStr = JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []);
    try {
        workshopDb.prepare(
            `UPDATE extras SET name=?,category=?,quantity=?,price=?,description=?,notes=?,sourceUrl=?,imageUrls=?,status=? WHERE id=?`
        ).run(name || '', category || '', quantity || '1', price || '', description || '', notes || '', sourceUrl || '', imageUrlsStr, status || 'planned', req.params.id);
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/extras/:id
app.delete('/api/extras/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM extras WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/builds/:id/geometry
app.get('/api/builds/:id/geometry', requireMechanicAuth, (req, res) => {
    try {
        const row = workshopDb.prepare('SELECT * FROM geometry WHERE buildId=?').get(req.params.id);
        res.json(row || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/builds/:id/geometry — upsert
app.put('/api/builds/:id/geometry', requireMechanicAuth, (req, res) => {
    const f = req.body;
    const now = new Date().toISOString();
    try {
        workshopDb.prepare(`
            INSERT INTO geometry (buildId,seatTubeCC,seatTubeCT,effectiveTopTube,stack,reach,standOver,headTube,headTubeAngle,seatTubeAngle,bbHeight,bbDrop,chainstay,wheelbase,updatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(buildId) DO UPDATE SET
                seatTubeCC=excluded.seatTubeCC, seatTubeCT=excluded.seatTubeCT,
                effectiveTopTube=excluded.effectiveTopTube, stack=excluded.stack,
                reach=excluded.reach, standOver=excluded.standOver,
                headTube=excluded.headTube, headTubeAngle=excluded.headTubeAngle,
                seatTubeAngle=excluded.seatTubeAngle, bbHeight=excluded.bbHeight,
                bbDrop=excluded.bbDrop, chainstay=excluded.chainstay,
                wheelbase=excluded.wheelbase, updatedAt=excluded.updatedAt
        `).run(req.params.id, f.seatTubeCC||'', f.seatTubeCT||'', f.effectiveTopTube||'', f.stack||'', f.reach||'', f.standOver||'', f.headTube||'', f.headTubeAngle||'', f.seatTubeAngle||'', f.bbHeight||'', f.bbDrop||'', f.chainstay||'', f.wheelbase||'', now);
        const row = workshopDb.prepare('SELECT * FROM geometry WHERE buildId=?').get(req.params.id);
        res.json(row);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/builds/migrate — one-time push of a local build + all its children
app.post('/api/builds/migrate', requireMechanicAuth, (req, res) => {
    const { build, components = [], orders = [], extras = [], geometry } = req.body;
    const now = new Date().toISOString();
    try {
        // Deduplicate: skip if same name + createdAt already exists
        const existing = workshopDb.prepare('SELECT id FROM builds WHERE name=? AND createdAt=?').get(build.name, build.createdAt || now);
        if (existing) {
            return res.json({ skipped: true, buildId: existing.id });
        }
        let newBuildId;
        workshopDb.transaction(() => {
            const bi = workshopDb.prepare(
                `INSERT INTO builds (name,description,customerId,createdAt,updatedAt) VALUES (?,?,?,?,?)`
            ).run(build.name || 'Untitled', build.description || '', build.customerId || null, build.createdAt || now, build.updatedAt || now);
            newBuildId = bi.lastInsertRowid;

            const insertComp = workshopDb.prepare(
                `INSERT INTO components (buildId,type,name,imageUrls,price,description,notes,sourceUrl,status) VALUES (?,?,?,?,?,?,?,?,?)`
            );
            for (const c of components) {
                insertComp.run(newBuildId, c.type, c.name||'', JSON.stringify(Array.isArray(c.imageUrls)?c.imageUrls:[]), c.price||'', c.description||'', c.notes||'', c.sourceUrl||'', c.status||'planned');
            }
            const insertOrder = workshopDb.prepare(
                `INSERT INTO orders (buildId,componentType,itemName,vendor,price,orderDate,expectedDelivery,trackingNumber,status,notes,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
            );
            for (const o of orders) {
                insertOrder.run(newBuildId, o.componentType||'', o.itemName||'', o.vendor||'', o.price||'', o.orderDate||'', o.expectedDelivery||'', o.trackingNumber||'', o.status||'pending', o.notes||'', o.createdAt||now);
            }
            const insertExtra = workshopDb.prepare(
                `INSERT INTO extras (buildId,name,category,quantity,price,description,notes,sourceUrl,imageUrls,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
            );
            for (const e of extras) {
                insertExtra.run(newBuildId, e.name||'', e.category||'', e.quantity||'1', e.price||'', e.description||'', e.notes||'', e.sourceUrl||'', JSON.stringify(Array.isArray(e.imageUrls)?e.imageUrls:[]), e.status||'planned', e.createdAt||now);
            }
            if (geometry) {
                workshopDb.prepare(`
                    INSERT OR REPLACE INTO geometry (buildId,seatTubeCC,seatTubeCT,effectiveTopTube,stack,reach,standOver,headTube,headTubeAngle,seatTubeAngle,bbHeight,bbDrop,chainstay,wheelbase,updatedAt)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                `).run(newBuildId, geometry.seatTubeCC||'', geometry.seatTubeCT||'', geometry.effectiveTopTube||'', geometry.stack||'', geometry.reach||'', geometry.standOver||'', geometry.headTube||'', geometry.headTubeAngle||'', geometry.seatTubeAngle||'', geometry.bbHeight||'', geometry.bbDrop||'', geometry.chainstay||'', geometry.wheelbase||'', geometry.updatedAt||now);
            }
        })();
        res.json({ success: true, buildId: newBuildId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.post('/api/public/signup', (req, res) => {
    const { firstName, lastName, phone, email, address, city, state, zipCode, requestedService, bikeModel, description } = req.body;
    if (!firstName || !lastName || !phone) {
        return res.status(400).json({ error: 'First Name, Last Name, and Phone Number are required.' });
    }
    const now = new Date().toISOString();
    try {
        const existing = workshopDb.prepare('SELECT * FROM customers WHERE phone=?').get(phone.trim());
        let customerId;
        const isNewCustomer = !existing;
        if (existing) {
            workshopDb.prepare(`UPDATE customers SET firstName=?,lastName=?,email=?,address=?,city=?,state=?,zipCode=?,updatedAt=? WHERE id=?`)
                .run(firstName.trim(), lastName.trim(), email?.trim() || existing.email, address?.trim(), city?.trim(), state, zipCode?.trim(), now, existing.id);
            customerId = existing.id;
        } else {
            const info = workshopDb.prepare(`INSERT INTO customers (firstName,lastName,phone,email,address,city,state,zipCode,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`)
                .run(firstName.trim(), lastName.trim(), phone.trim(), email?.trim() || null, address?.trim(), city?.trim(), state, zipCode?.trim(), now, now);
            customerId = info.lastInsertRowid;
        }
        let jobId = null;
        const serviceNotes = ['Customer self-service intake request.', description ? `Issue described: ${description.trim()}` : ''].filter(Boolean).join(' ');
        if (requestedService && requestedService.trim() !== '') {
            const jobInfo = workshopDb.prepare(`INSERT INTO jobs (customerId,title,stage,bikeModel,estimatedCost,notes,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`)
                .run(customerId, requestedService.trim(), 'Intake', bikeModel || 'Customer Bike', '', serviceNotes, now, now);
            jobId = jobInfo.lastInsertRowid;
        }
        // Send shop notification email
        if (transporter) {
            transporter.sendMail({
                from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
                to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
                subject: `🚲 New Booking: ${firstName.trim()} ${lastName.trim()} — ${requestedService || 'Contact Request'}`,
                html: `
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                        <div style="background:#FF8000;padding:20px;border-radius:8px 8px 0 0;">
                            <h2 style="color:#fff;margin:0;font-size:20px;">🚲 New Service Booking</h2>
                            <p style="color:#fff;margin:6px 0 0;font-size:13px;opacity:0.85;">Auto-added to Customer CMS</p>
                        </div>
                        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
                            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;width:40%;">Customer</td><td style="padding:8px 4px;font-weight:bold;">${firstName.trim()} ${lastName.trim()}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Phone</td><td style="padding:8px 4px;">${phone.trim()}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Email</td><td style="padding:8px 4px;">${email?.trim() || '—'}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Address</td><td style="padding:8px 4px;">${[address, city, state, zipCode].filter(Boolean).join(', ') || '—'}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Service</td><td style="padding:8px 4px;font-weight:bold;color:#FF8000;">${requestedService || '—'}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Bike</td><td style="padding:8px 4px;">${bikeModel || '—'}</td></tr>
                                <tr><td style="padding:8px 4px;color:#64748b;">Issue Description</td><td style="padding:8px 4px;">${description?.trim() || '—'}</td></tr>
                            </table>
                            <div style="margin-top:20px;padding:12px;background:#f8fafc;border-radius:6px;font-size:12px;color:#64748b;">
                                ${isNewCustomer ? '🆕 <strong>New customer</strong> — added to CMS.' : '🔄 <strong>Returning customer</strong> — CMS record updated.'}
                                ${jobId ? ` Job #${jobId} created.` : ''}
                            </div>
                        </div>
                    </div>
                `
            }, (err) => { if (err) console.error('Booking notification email failed:', err); });
        }
        res.json({ success: true, customerId, jobId, isNewCustomer });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/public/donate', (req, res) => {
    const { fullname, address, phone, email, bikeType } = req.body;
    if (!fullname || !phone || !address || !bikeType) {
        return res.status(400).json({ error: 'Required fields missing.' });
    }
    
    try {
        if (transporter) {
            transporter.sendMail({
                from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
                to: 'steve@weeecycle.net',
                subject: `🚲 New Bike Donation: ${fullname}`,
                html: `
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                        <div style="background:#00b67a;padding:20px;border-radius:8px 8px 0 0;">
                            <h2 style="color:#fff;margin:0;font-size:20px;">🚲 New Bike Donation (Jubilee Jobs)</h2>
                        </div>
                        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
                            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;width:40%;">Name</td><td style="padding:8px 4px;font-weight:bold;">${fullname}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Phone</td><td style="padding:8px 4px;">${phone}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Email</td><td style="padding:8px 4px;">${email || '—'}</td></tr>
                                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 4px;color:#64748b;">Pickup Address</td><td style="padding:8px 4px;">${address}</td></tr>
                                <tr><td style="padding:8px 4px;color:#64748b;">Bike Type</td><td style="padding:8px 4px;font-weight:bold;color:#00b67a;">${bikeType}</td></tr>
                            </table>
                        </div>
                    </div>
                `
            }, (err) => { if (err) console.error('Donation notification email failed:', err); });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── Blog Comments ─────────────────────────────────────────────────────────────

// GET /api/comments?post=slug — public, returns approved comments
app.get('/api/comments', (req, res) => {
    const { post } = req.query;
    if (!post) return res.status(400).json({ error: 'post slug required' });
    try {
        const rows = workshopDb.prepare(
            `SELECT id, author_name, author_website, body, created_at FROM blog_comments WHERE post_slug=? AND status='approved' ORDER BY created_at ASC`
        ).all(post.trim());
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/comments — public, submit a new comment (goes to pending)
app.post('/api/comments', (req, res) => {
    const { post_slug, author_name, author_website, body, hp } = req.body;

    // Honeypot — bots fill this hidden field
    if (hp && hp.trim() !== '') return res.json({ success: true });

    if (!post_slug || !author_name?.trim() || !body?.trim()) {
        return res.status(400).json({ error: 'post_slug, author_name, and body are required.' });
    }
    if (author_name.length > 100 || body.length > 5000) {
        return res.status(400).json({ error: 'Input too long.' });
    }

    const now = new Date().toISOString();
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

    try {
        const info = workshopDb.prepare(
            `INSERT INTO blog_comments (post_slug, author_name, author_website, body, status, ip, created_at) VALUES (?,?,?,?,?,?,?)`
        ).run(post_slug.trim(), author_name.trim(), author_website?.trim() || null, body.trim(), 'pending', ip, now);

        const commentId = info.lastInsertRowid;

        if (transporter) {
            const approveToken = generateCommentToken(commentId, 'approve');
            const deleteToken = generateCommentToken(commentId, 'delete');
            const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
            const host = req.headers.host || 'weeecycle.net';
            const approveUrl = `${proto}://${host}/api/admin/comments/${commentId}/approve?token=${approveToken}`;
            const deleteUrl = `${proto}://${host}/api/admin/comments/${commentId}/delete?token=${deleteToken}`;

            transporter.sendMail({
                from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
                to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
                subject: `New Comment on "${post_slug}" — Weeecycle`,
                html: `
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                        <div style="background:#FF8000;padding:20px;border-radius:8px 8px 0 0;">
                            <h2 style="color:#fff;margin:0;font-size:18px;">New Blog Comment</h2>
                        </div>
                        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
                            <p style="margin:0 0 8px 0;"><strong>Post:</strong> ${post_slug}</p>
                            <p style="margin:0 0 8px 0;"><strong>From:</strong> ${author_name}${author_website ? ` — <a href="${author_website}">${author_website}</a>` : ''}</p>
                            <blockquote style="border-left:4px solid #FF8000;margin:12px 0;padding:10px 16px;background:#f8fafc;border-radius:0 4px 4px 0;color:#374151;">${body.replace(/\n/g, '<br>')}</blockquote>
                            <div style="margin-top:20px;">
                                <a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;margin-right:10px;">✓ Approve</a>
                                <a href="${deleteUrl}" style="background:#dc2626;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">✗ Delete</a>
                            </div>
                        </div>
                    </div>
                `
            }, (err) => { if (err) console.error('Comment notification email failed:', err); });
        }

        res.json({ success: true, pending: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/comments/:id/approve?token=X — one-click approve from email
app.get('/api/admin/comments/:id/approve', (req, res) => {
    const expected = generateCommentToken(req.params.id, 'approve');
    if (req.query.token !== expected) return res.status(403).send('<p>Invalid or expired link.</p>');
    try {
        workshopDb.prepare(`UPDATE blog_comments SET status='approved' WHERE id=?`).run(req.params.id);
        res.send('<p style="font-family:sans-serif;padding:20px;">Comment approved! <a href="/">Back to site</a></p>');
    } catch (err) { res.status(500).send('<p>Error: ' + err.message + '</p>'); }
});

// GET /api/admin/comments/:id/delete?token=X — one-click delete from email
app.get('/api/admin/comments/:id/delete', (req, res) => {
    const expected = generateCommentToken(req.params.id, 'delete');
    if (req.query.token !== expected) return res.status(403).send('<p>Invalid or expired link.</p>');
    try {
        workshopDb.prepare(`DELETE FROM blog_comments WHERE id=?`).run(req.params.id);
        res.send('<p style="font-family:sans-serif;padding:20px;">Comment deleted. <a href="/">Back to site</a></p>');
    } catch (err) { res.status(500).send('<p>Error: ' + err.message + '</p>'); }
});

// GET /api/admin/comments — list all comments (mechanic auth)
app.get('/api/admin/comments', requireMechanicAuth, (req, res) => {
    try {
        const rows = workshopDb.prepare(
            `SELECT * FROM blog_comments ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC`
        ).all();
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve static files from root (for public site assets)
app.use(express.static(path.join(__dirname, '/')));

// Email Transporter Setup
let transporter;
if (process.env.RESEND_API_KEY) {
    // Resend sends over HTTPS, which works on hosts that block outbound SMTP ports (e.g. Railway)
    transporter = {
        sendMail: async ({ from, to, subject, html, text, replyTo, attachments = [] }) => {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from, to, subject, html, text, reply_to: replyTo,
                    attachments: attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') }))
                }),
                signal: AbortSignal.timeout(20000)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || `Resend responded with status ${response.status}`);
            return data;
        }
    };
    console.log('Resend email transporter configured.');
} else if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 465,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        // Fail fast instead of hanging when the host blocks outbound SMTP
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    });
    console.log('Nodemailer SMTP transporter configured for:', process.env.SMTP_USER);
} else {
    console.warn('Email credentials missing in .env. Email delivery will be disabled.');
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
        return res.status(500).json({ error: 'Email is not configured on the server.' });
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
            try {
                await transporter.sendMail(mailOptions);
                console.log('Email sent successfully to:', customerEmail);
                res.json({ success: true, message: 'PDF generated and sent successfully!' });
            } catch (err) {
                console.error('Email send failed:', err.message);
                const blocked = ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED'].includes(err.code);
                res.status(502).json({ error: blocked
                    ? 'Could not reach the email server — the host is blocking outbound email.'
                    : `Email could not be sent: ${err.message}` });
            }
        });

        // --- PDF STYLING & CONTENT ---
        const primaryColor = '#D97706';
        const newPage = (x = 50) => {
            doc.addPage();
            doc.rect(0, 0, doc.page.width, 16).fill(primaryColor);
            doc.x = x;
            doc.y = 50;
        };
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
                    newPage();
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
                                    newPage(60);
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
                newPage();
            }

            doc.font('Helvetica-Bold').fontSize(18).fillColor(primaryColor).text('EXTRAS & ACCESSORIES');
            doc.moveDown(0.5);
            doc.rect(50, doc.y, doc.page.width - 100, 2).fill(primaryColor);
            doc.moveDown(1);

            for (const extra of validExtras) {
                if (doc.y > doc.page.height - 150) {
                    newPage();
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
                                    newPage(60);
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

