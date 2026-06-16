process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
});

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
        "ALTER TABLE invoices ADD COLUMN stripeInvoiceId TEXT",
        "ALTER TABLE invoices ADD COLUMN hostedInvoiceUrl TEXT",
    ]) { try { workshopDb.exec(sql); } catch (_) {} }
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
    const now = new Date().toISOString();
    try {
        const info = workshopDb.prepare(
            `INSERT INTO customers (firstName,lastName,phone,email,stripeCustomerId,address,city,state,zipCode,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).run(firstName, lastName, phone, email, stripeCustomerId || null, address, city, state, zipCode, now, now);
        res.json({ id: info.lastInsertRowid, firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode, createdAt: now, updatedAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/customers/:id', requireMechanicAuth, (req, res) => {
    const { firstName, lastName, phone, email, stripeCustomerId, address, city, state, zipCode } = req.body;
    const now = new Date().toISOString();
    try {
        workshopDb.prepare(
            `UPDATE customers SET firstName=?,lastName=?,phone=?,email=?,stripeCustomerId=?,address=?,city=?,state=?,zipCode=?,updatedAt=? WHERE id=?`
        ).run(firstName, lastName, phone, email, stripeCustomerId || null, address, city, state, zipCode, now, req.params.id);
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
    const { stage, notes, estimatedCost } = req.body;
    const now = new Date().toISOString();
    try {
        if (stage && !notes && !estimatedCost) {
            workshopDb.prepare(`UPDATE jobs SET stage=?,updatedAt=? WHERE id=?`).run(stage, now, req.params.id);
        } else {
            workshopDb.prepare(`UPDATE jobs SET notes=?,estimatedCost=?,updatedAt=? WHERE id=?`).run(notes, estimatedCost, now, req.params.id);
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
        const rows = workshopDb.prepare('SELECT * FROM invoices ORDER BY id DESC').all();
        res.json(rows.map(row => ({ ...row, items: row.items ? JSON.parse(row.items) : [] })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/invoices', requireMechanicAuth, (req, res) => {
    const { customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes } = req.body;
    const now = new Date().toISOString();
    const itemsStr = JSON.stringify(items || []);
    try {
        const info = workshopDb.prepare(
            `INSERT INTO invoices (customerId,type,status,issueDate,dueDate,items,subtotal,tax,total,stripeInvoiceId,hostedInvoiceUrl,notes,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(customerId, type, status, issueDate, dueDate, itemsStr, subtotal, tax, total, stripeInvoiceId || null, hostedInvoiceUrl || null, notes, now, now);
        res.json({ id: info.lastInsertRowid, customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes, createdAt: now, updatedAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/invoices/:id', requireMechanicAuth, (req, res) => {
    const { customerId, type, status, issueDate, dueDate, items, subtotal, tax, total, stripeInvoiceId, hostedInvoiceUrl, notes } = req.body;
    const now = new Date().toISOString();
    const itemsStr = JSON.stringify(items || []);
    try {
        workshopDb.prepare(
            `UPDATE invoices SET customerId=?,type=?,status=?,issueDate=?,dueDate=?,items=?,subtotal=?,tax=?,total=?,stripeInvoiceId=?,hostedInvoiceUrl=?,notes=?,updatedAt=? WHERE id=?`
        ).run(customerId, type, status, issueDate, dueDate, itemsStr, subtotal, tax, total, stripeInvoiceId || null, hostedInvoiceUrl || null, notes, now, req.params.id);
        res.json({ success: true, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/invoices/:id', requireMechanicAuth, (req, res) => {
    try { workshopDb.prepare('DELETE FROM invoices WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
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

// ─── Builds, Components, Orders, Extras, Geometry ─────────────────────────────

const BUILD_COMPONENT_TYPES = ['frame','wheelset','bottomBracket','crank','frontDerailleur','rearDerailleur','levers','cassette','chain','seat','seatPost','headset','stem','fork','handlebars'];

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
    const { firstName, lastName, phone, address, city, state, zipCode, requestedService, bikeModel } = req.body;
    if (!firstName || !lastName || !phone) {
        return res.status(400).json({ error: 'First Name, Last Name, and Phone Number are required.' });
    }
    const now = new Date().toISOString();
    try {
        const existing = workshopDb.prepare('SELECT * FROM customers WHERE phone=?').get(phone.trim());
        let customerId;
        if (existing) {
            workshopDb.prepare(`UPDATE customers SET firstName=?,lastName=?,address=?,city=?,state=?,zipCode=?,updatedAt=? WHERE id=?`)
                .run(firstName.trim(), lastName.trim(), address?.trim(), city?.trim(), state, zipCode?.trim(), now, existing.id);
            customerId = existing.id;
        } else {
            const info = workshopDb.prepare(`INSERT INTO customers (firstName,lastName,phone,address,city,state,zipCode,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`)
                .run(firstName.trim(), lastName.trim(), phone.trim(), address?.trim(), city?.trim(), state, zipCode?.trim(), now, now);
            customerId = info.lastInsertRowid;
        }
        if (requestedService && requestedService.trim() !== '') {
            const jobInfo = workshopDb.prepare(`INSERT INTO jobs (customerId,title,stage,bikeModel,estimatedCost,notes,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`)
                .run(customerId, requestedService.trim(), 'In the shop', bikeModel || 'Customer Bike', '', 'Customer self-service intake request.', now, now);
            res.json({ success: true, customerId, jobId: jobInfo.lastInsertRowid });
        } else {
            res.json({ success: true, customerId });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/public/status', (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'Phone number is required to look up repair status.' });
    try {
        const customer = workshopDb.prepare('SELECT * FROM customers WHERE phone=?').get(phone.trim());
        if (!customer) return res.status(404).json({ error: 'No customer found matching that phone number.' });
        const jobs = workshopDb.prepare(`SELECT id,title,stage,bikeModel,estimatedCost,notes,updatedAt FROM jobs WHERE customerId=? ORDER BY id DESC`).all(customer.id);
        res.json({ customer: { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone }, jobs });
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

// Settings DB helpers
function getSetting(key) {
    const row = workshopDb.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? row.value : null;
}

function saveSetting(key, value) {
    workshopDb.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

function deleteSetting(key) {
    workshopDb.prepare('DELETE FROM settings WHERE key=?').run(key);
}

function upsertOrDeleteSetting(key, value) {
    if (value === '') deleteSetting(key);
    else saveSetting(key, value);
}

function getStripeKeys() {
    const secretKey = getSetting('stripe_secret_key') || process.env.STRIPE_SECRET_KEY;
    const webhookSecret = getSetting('stripe_webhook_secret') || process.env.STRIPE_WEBHOOK_SECRET;
    return { secretKey, webhookSecret };
}

function maskKey(key) {
    if (!key) return '';
    if (key.length <= 12) return '********';
    return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

// GET Stripe Settings
app.get('/api/settings/stripe', requireMechanicAuth, (req, res) => {
    try {
        const { secretKey, webhookSecret } = getStripeKeys();
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
        const currentKeys = getStripeKeys();

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
        if (targetSecretKey !== undefined) upsertOrDeleteSetting('stripe_secret_key', targetSecretKey);
        if (targetWebhookSecret !== undefined) upsertOrDeleteSetting('stripe_webhook_secret', targetWebhookSecret);

        res.json({ success: true, message: 'Stripe settings saved and verified successfully!' });
    } catch (err) {
        console.error('Error saving Stripe settings:', err);
        res.status(500).json({ error: err.message });
    }
});

// Stripe Invoice Operations (Create & Send)
app.post('/api/invoices/:id/send-stripe', requireMechanicAuth, async (req, res) => {
    const invoiceId = req.params.id;
    try {
        const invoice = workshopDb.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const customer = workshopDb.prepare('SELECT * FROM customers WHERE id=?').get(invoice.customerId);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        if (!customer.email) return res.status(400).json({ error: 'Customer must have an email address to send a Stripe invoice.' });

        const items = invoice.items ? JSON.parse(invoice.items) : [];
        const { secretKey: stripeSecret } = getStripeKeys();

        // Fallback to Simulator Mode if secret is not configured
        const isMockMode = !stripeSecret || stripeSecret.includes('placeholder') || stripeSecret === '';

            if (isMockMode) {
                console.log('[Stripe Simulator] Generating mock Stripe hosted invoice.');
                const mockInvoiceId = 'in_mock_' + Math.random().toString(36).substr(2, 9);
                const mockHostedUrl = `${req.protocol}://${req.get('host')}/tracker/?mock-pay-invoice=${mockInvoiceId}`;
                
                let customerStripeId = customer.stripeCustomerId || ('cus_mock_' + Math.random().toString(36).substr(2, 9));
                
                try { workshopDb.prepare('UPDATE customers SET stripeCustomerId=? WHERE id=?').run(customerStripeId, customer.id); }
                catch (err) { console.error('Error updating customer stripeCustomerId:', err); }

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
                workshopDb.prepare(`UPDATE invoices SET stripeInvoiceId=?,hostedInvoiceUrl=?,status=?,updatedAt=? WHERE id=?`)
                    .run(mockInvoiceId, mockHostedUrl, 'Sent', now, invoiceId);
                res.json({
                    success: true,
                    isMock: true,
                    invoice: { ...invoice, items, stripeInvoiceId: mockInvoiceId, hostedInvoiceUrl: mockHostedUrl, status: 'Sent', updatedAt: now }
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
                        
                        try { workshopDb.prepare('UPDATE customers SET stripeCustomerId=? WHERE id=?').run(stripeCustomerId, customer.id); }
                        catch (err) { console.error('Error saving customer stripeCustomerId:', err); }
                    }

                    // 2. Create Stripe Invoice object
                    const stripeInvoice = await stripe.invoices.create({
                        customer: stripeCustomerId,
                        collection_method: 'send_invoice',
                        days_until_due: 30,
                        auto_advance: true
                    });

                    // 3. Resolve KY tax rate once if any item is taxable
                    let kyTaxRateId = null;
                    if (items.some(i => i.taxable)) {
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
                        kyTaxRateId = kyTaxRate.id;
                    }

                    // 4. Create Stripe Line items in parallel
                    await Promise.all(items.map(item => {
                        const qty = item.quantity || 1;
                        const priceCents = Math.round((item.price || 0) * 100);
                        return stripe.invoiceItems.create({
                            customer: stripeCustomerId,
                            invoice: stripeInvoice.id,
                            amount: priceCents * qty,
                            currency: 'usd',
                            description: item.description,
                            tax_rates: item.taxable && kyTaxRateId ? [kyTaxRateId] : []
                        });
                    }));

                    // 5. Send the Stripe Invoice
                    const finalizedInvoice = await stripe.invoices.sendInvoice(stripeInvoice.id);

                    const now = new Date().toISOString();
                    workshopDb.prepare(`UPDATE invoices SET stripeInvoiceId=?,hostedInvoiceUrl=?,status=?,updatedAt=? WHERE id=?`)
                        .run(finalizedInvoice.id, finalizedInvoice.hosted_invoice_url, 'Sent', now, invoiceId);
                    res.json({
                        success: true,
                        isMock: false,
                        invoice: { ...invoice, items, stripeInvoiceId: finalizedInvoice.id, hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url, status: 'Sent', updatedAt: now }
                    });

                } catch (stripeErr) {
                    console.error('Stripe invoice creation error:', stripeErr);
                    res.status(500).json({ error: `Stripe Error: ${stripeErr.message}` });
                }
            }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mock Stripe Payment Webhook Simulator
app.post('/api/public/mock-stripe-pay', async (req, res) => {
    const { stripeInvoiceId } = req.body;
    if (!stripeInvoiceId) return res.status(400).json({ error: 'Missing stripeInvoiceId' });
    console.log(`[Stripe Simulator] Simulating payment webhook for: ${stripeInvoiceId}`);
    const now = new Date().toISOString();
    try {
        workshopDb.prepare(`UPDATE invoices SET status=?,updatedAt=? WHERE stripeInvoiceId=?`).run('Paid', now, stripeInvoiceId);
        res.json({ success: true, stripeInvoiceId, status: 'Paid', updatedAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Real Stripe Webhook Handler
app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const { secretKey: stripeSecret, webhookSecret } = getStripeKeys();

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
        try {
            workshopDb.prepare(`UPDATE invoices SET status=?,updatedAt=? WHERE stripeInvoiceId=?`).run('Paid', now, stripeInvoice.id);
            res.json({ received: true });
        } catch (err) { console.error('Failed to update invoice in database:', err); res.status(500).send('Database update failed'); }
    } else {
        res.json({ received: true });
    }
});

app.listen(PORT, () => {
    console.log(`Weeecycle API server running on port ${PORT}`);
});

