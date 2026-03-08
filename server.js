const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const { exec } = require('child_process');
const multer = require('multer');
require('dotenv').config(); // Ensure dotenv is used for config

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'images'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'affiliate-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Email Transporter Setup
let transporter;
if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
} else {
    // Mock transporter for testing
    transporter = {
        sendMail: async (mailOptions) => {
            console.log("\n--- MOCK EMAIL SENT (Check Server Logs) ---");
            console.log("To:", mailOptions.to);
            console.log("Subject:", mailOptions.subject);
            console.log("Text:", mailOptions.text);
            console.log("-------------------------------------------\n");
            return { messageId: 'mock-id' };
        }
    };
    console.log("SMTP config missing. Using mock email transporter.");
}

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
            address TEXT,
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
            phone: decrypt(row.phone),
            address: decrypt(row.address)
        }));
        res.json(decrypted);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/contacts', async (req, res) => {
    const { id, name, email, phone, address, lastSeen, count } = req.body;

    // Encrypt sensitive fields
    const encName = encrypt(name);
    const encEmail = encrypt(email);
    const encPhone = encrypt(phone);
    const encAddress = encrypt(address);

    try {
        await dbRun(`
            INSERT OR REPLACE INTO contacts (id, name, email, phone, address, last_seen, job_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, encName, encEmail, encPhone, encAddress, lastSeen, count || 0]);
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


app.post('/api/contacts/batch-delete', async (req, res) => {
    console.log("Received batch delete request:", req.body);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        console.error("Invalid IDs for batch delete:", ids);
        return res.status(400).json({ error: "Invalid IDs" });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        console.log(`Executing DELETE for IDs: ${ids.join(', ')}`);
        await dbRun(`DELETE FROM contacts WHERE id IN (${placeholders})`, ids);
        console.log("Deleted successfully.");
        res.json({ success: true });
    } catch (e) {
        console.error("Batch delete error:", e);
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

// AUTHENTICATION SYSTEM
const SALT_LENGTH = 16;

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

db.serialize(() => {
    // 1. Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            hash TEXT,
            salt TEXT
        )
    `, (err) => {
        if (!err) {
            // Seed Default Admin if no users exist
            db.get("SELECT count(*) as count FROM users", (err, row) => {
                if (row && row.count === 0) {
                    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
                    const hash = hashPassword("WrenchTime", salt);
                    db.run("INSERT INTO users (username, hash, salt) VALUES (?, ?, ?)", ["admin", hash, salt]);
                    console.log("Seeded default admin user: admin / WrenchTime");
                }
            });
        }
    });

    // Remove old auth table if it exists (Optional clean up)
    db.run("DROP TABLE IF EXISTS auth");
});

// Login Endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const row = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!row) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const inputHash = hashPassword(password, row.salt);
        if (inputHash === row.hash) {
            // In a real app, send a JWT. Here we send a simple success flag + user info.
            res.json({ success: true, user: { username: row.username } });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Change Password Endpoint
app.post('/api/auth/password', async (req, res) => {
    const { username, currentPassword, newPassword } = req.body;
    const targetUser = username || 'admin'; // Fallback to admin if not specified

    try {
        const row = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE username = ?", [targetUser], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!row) {
            return res.status(404).json({ error: "User not found" });
        }

        const inputHash = hashPassword(currentPassword, row.salt);
        if (inputHash !== row.hash) {
            return res.status(401).json({ error: "Incorrect current password" });
        }

        // Generate new hash
        const newSalt = crypto.randomBytes(SALT_LENGTH).toString('hex');
        const newHash = hashPassword(newPassword, newSalt);

        await dbRun("UPDATE users SET hash = ?, salt = ? WHERE id = ?", [newHash, newSalt, row.id]);

        console.log(`Password updated for user: ${targetUser}`);
        res.json({ success: true });
    } catch (e) {
        console.error("Password update error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Forgot Password Endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
    const { identifier } = req.body; // Can be username or email

    if (!identifier) return res.status(400).json({ error: "Identifier is required" });

    try {
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE username = ? OR email = ?", [identifier, identifier], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!user || !user.email) {
            // Act like it succeeded to prevent user enumeration
            return res.json({ success: true, message: "If an account exists, a reset link was sent." });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = Date.now() + 3600000; // 1 hour

        await dbRun("UPDATE users SET reset_token = ?, reset_expiry = ? WHERE id = ?", [resetToken, resetExpiry, user.id]);

        const resetLink = `http://${req.headers.host}/reset-password.html?token=${resetToken}`;

        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
            to: user.email,
            subject: "Password Reset Request",
            text: `You requested a password reset. Click the following link to reset your password:\n\n${resetLink}\n\nIf you did not request this, please ignore this email.`
        });

        res.json({ success: true, message: "If an account exists, a reset link was sent." });

    } catch (e) {
        console.error("Forgot password error:", e);
        res.status(500).json({ error: "Internal server error." });
    }
});

// Reset Password Endpoint
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) return res.status(400).json({ error: "Token and new password are required" });

    try {
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE reset_token = ?", [token], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        if (Date.now() > user.reset_expiry) {
            return res.status(400).json({ error: "Token has expired" });
        }

        const newSalt = crypto.randomBytes(SALT_LENGTH).toString('hex');
        const newHash = hashPassword(newPassword, newSalt);

        await dbRun("UPDATE users SET hash = ?, salt = ?, reset_token = NULL, reset_expiry = NULL WHERE id = ?", [newHash, newSalt, user.id]);

        console.log(`Password reset successfully for user: ${user.username}`);
        res.json({ success: true, message: "Password has been successfully reset" });

    } catch (e) {
        console.error("Reset password error:", e);
        res.status(500).json({ error: "Internal server error." });
    }
});

// --- WEBSITE CONTROLS ---

app.get('/api/settings/site-status', (req, res) => {
    try {
        const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

        // Define regex to match the sections
        const servicesRegex = /<section\s+(?:[^>]*?\s+)?class="([^"]*)"[^>]*id="services"/;
        const reviewsRegex = /<section\s+(?:[^>]*?\s+)?class="([^"]*)"[^>]*id="reviews"/;

        const servicesMatch = html.match(servicesRegex);
        const reviewsMatch = html.match(reviewsRegex);

        const isServicesHidden = servicesMatch ? servicesMatch[1].includes('hidden') : false;
        const isReviewsHidden = reviewsMatch ? reviewsMatch[1].includes('hidden') : false;

        res.json({
            success: true,
            status: {
                services: !isServicesHidden, // True if showing, false if hidden
                reviews: !isReviewsHidden
            }
        });
    } catch (e) {
        console.error("Error reading site status:", e);
        res.status(500).json({ error: "Could not read website files." });
    }
});

app.post('/api/settings/toggle-section', (req, res) => {
    const { section, isVisible } = req.body; // section: 'services' | 'reviews', isVisible: boolean
    if (!['services', 'reviews'].includes(section)) return res.status(400).json({ error: "Invalid section" });

    try {
        const indexPath = path.join(__dirname, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf8');

        // Regex to capture the entire opening tag ending with id="<section>" but capturing the class attribute
        // HTML: <section class="class1 class2 hidden" id="services">
        const regex = new RegExp(`(<section\\s+(?:[^>]*?\\s+)?class=")([^"]*)("[^>]*id="${section}")`, 'i');
        const match = html.match(regex);

        if (!match) return res.status(400).json({ error: "Could not locate section in HTML" });

        const classListStr = match[2];
        let classes = classListStr.split(' ').filter(c => c.trim() !== '');

        // Add or remove 'hidden'
        if (isVisible) {
            classes = classes.filter(c => c !== 'hidden');
        } else {
            if (!classes.includes('hidden')) classes.push('hidden');
        }

        // For services also update the two navigation links 
        // Example: <a class="hidden font-display..." href="#services">
        if (section === 'services') {
            const navRegexDesktop = /<a class="([^"]*)"\s*\n?\s*href="#services">/g;
            const navRegexMobile = /<a class="([^"]*)" href="#services"/g;

            html = html.replace(navRegexDesktop, (fullMatch, navClasses) => {
                let cl = navClasses.split(' ').filter(c => c.trim() !== '');
                if (isVisible) cl = cl.filter(c => c !== 'hidden');
                else if (!cl.includes('hidden')) cl.unshift('hidden'); // unshift keeps it simple
                return `<a class="${cl.join(' ')}" href="#services">`;
            });

            html = html.replace(navRegexMobile, (fullMatch, navClasses) => {
                let cl = navClasses.split(' ').filter(c => c.trim() !== '');
                if (isVisible) cl = cl.filter(c => c !== 'hidden');
                else if (!cl.includes('hidden')) cl.unshift('hidden');
                return `<a class="${cl.join(' ')}" href="#services"`;
            });
        }

        // Replace the matched section's classes
        const newClassString = classes.join(' ');
        const newTag = match[1] + newClassString + match[3];
        html = html.replace(regex, newTag);

        // Save back to disk
        fs.writeFileSync(indexPath, html, 'utf8');

        // Execute git commands to push the deployment
        console.log(`Toggled ${section} visibility -> ${isVisible}. Pushing to GitHub...`);

        exec('git add index.html && git commit -m "chore: toggle visibility via workshop" && git push',
            { cwd: __dirname }, (err, stdout, stderr) => {
                if (err) {
                    console.error("Git Push Failed:", stderr);
                    return res.status(500).json({ error: "Failed to sync to GitHub." });
                }
                console.log("Git Push Successful.");
                res.json({ success: true, message: "Site deployed successfully." });
            });

    } catch (e) {
        console.error("Toggle error:", e);
        res.status(500).json({ error: "Internal server error." });
    }
});

// Create User Endpoint (Internal/Admin only usage recommended)
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    // Basic protection: Only allow if no users exist OR (add your own logic)
    // For now, we allow it for setup flexibility.

    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = hashPassword(password, salt);

    try {
        await dbRun("INSERT INTO users (username, hash, salt) VALUES (?, ?, ?)", [username, hash, salt]);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: "Username likely exists" });
    }
});

// --- AFFILIATE LINKS ---
function syncAmazonStore() {
    db.all("SELECT * FROM affiliates ORDER BY id ASC", [], (err, rows) => {
        if (err) return;
        let cardsHtml = '';
        rows.forEach(row => {
            cardsHtml += `
                <div class="bg-[#151535] border border-gray-700 rounded-xl p-6 flex flex-col items-center text-center group hover:border-brand-orange transition duration-300 shadow-xl">
                    <div class="bg-white w-full h-40 rounded mb-6 flex items-center justify-center overflow-hidden p-4">
                        <img src="${row.image_path}" class="object-contain h-full w-full" alt="${row.title}">
                    </div>
                    <h3 class="text-white font-display font-bold text-xl uppercase tracking-wider mb-6">${row.title}</h3>
                    <a href="${row.url}" target="_blank" class="mt-auto bg-brand-orange hover:bg-white text-brand-dark font-display font-bold text-lg uppercase py-2 px-8 rounded transition w-full shadow-lg shadow-orange-900/20">Buy on Amazon</a>
                </div>`;
        });

        const htmlPath = path.join(__dirname, 'amazonstore.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        const regex = /(<!-- AFFILIATE_LINKS_START -->)[\s\S]*?(<!-- AFFILIATE_LINKS_END -->)/;
        html = html.replace(regex, `$1\n${cardsHtml}\n                $2`);
        fs.writeFileSync(htmlPath, html);

        exec(`git add amazonstore.html && git commit -m "chore: sync affiliate links" && git push`, { cwd: __dirname });
    });
}

app.get('/api/affiliates', (req, res) => {
    db.all("SELECT * FROM affiliates ORDER BY id ASC", [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ success: true, data: rows });
    });
});

app.post('/api/affiliates', upload.single('image'), (req, res) => {
    const { title, url } = req.body;
    let dp = req.file ? 'images/' + req.file.filename : '';
    db.run("INSERT INTO affiliates (title, url, image_path) VALUES (?, ?, ?)", [title, url, dp], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        syncAmazonStore();
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/affiliates/:id', upload.single('image'), (req, res) => {
    const { title, url } = req.body;
    const { id } = req.params;
    if (req.file) {
        let dp = 'images/' + req.file.filename;
        db.run("UPDATE affiliates SET title = ?, url = ?, image_path = ? WHERE id = ?", [title, url, dp, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            syncAmazonStore();
            res.json({ success: true });
        });
    } else {
        db.run("UPDATE affiliates SET title = ?, url = ? WHERE id = ?", [title, url, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            syncAmazonStore();
            res.json({ success: true });
        });
    }
});

app.delete('/api/affiliates/:id', (req, res) => {
    const { id } = req.params;
    db.get("SELECT image_path FROM affiliates WHERE id = ?", [id], (err, row) => {
        if (row && row.image_path) fs.unlink(path.join(__dirname, row.image_path), () => { });
        db.run("DELETE FROM affiliates WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            syncAmazonStore();
            res.json({ success: true });
        });
    });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lockdown Secure Server running at http://localhost:${PORT}`);
    console.log(`Database: SQLite (AES-256 Encrypted)`);
});
