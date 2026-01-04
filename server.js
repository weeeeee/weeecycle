const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Database Setup
const db = new sqlite3.Database('workshop.db', (err) => {
    if (err) console.error('DB Error:', err.message);
    else console.log('Connected to Secure SQLite DB.');
});

// Helper for Promisified Queries
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// Encryption Config
const ENCRYPTION_KEY = crypto.scryptSync('WeeecycleSecretMasterKey', 'salt', 32);
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return text;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return text;
    }
}

// Initialize Tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            name TEXT, 
            email TEXT,
            phone TEXT,
            last_seen TEXT,
            job_count INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            customer TEXT,
            bike TEXT,
            service TEXT,
            status TEXT,
            date TEXT,
            checklist TEXT
        )
    `);
});

// --- API ROUTES ---

// CONTACTS
app.get('/api/contacts', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM contacts');
        const decrypted = rows.map(row => ({
            ...row,
            name: decrypt(row.name),
            email: decrypt(row.email),
            phone: decrypt(row.phone)
        }));
        res.json(decrypted);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/contacts', async (req, res) => {
    const { id, name, email, phone, lastSeen, count } = req.body;

    // Encrypt sensitive fields
    const encName = encrypt(name);
    const encEmail = encrypt(email);
    const encPhone = encrypt(phone);

    try {
        await dbRun(`
            INSERT OR REPLACE INTO contacts (id, name, email, phone, last_seen, job_count)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, encName, encEmail, encPhone, lastSeen, count || 0]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/contacts/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM contacts WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// JOBS (Basic Proxy)
app.get('/api/jobs', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM jobs');
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/jobs', async (req, res) => {
    const job = req.body;
    try {
        await dbRun(`
            INSERT OR REPLACE INTO jobs (id, customer, bike, service, status, date, checklist)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [job.id, job.customer, job.bike, job.service, job.status, job.date, JSON.stringify(job.checklist || {})]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Lockdown Secure Server running at http://localhost:${PORT}`);
    console.log(`Database: SQLite (AES-256 Encrypted)`);
});
