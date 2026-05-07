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
const PORT = process.env.PORT || 3000;

// SSE Clients
let sseClients = [];

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
});
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
            if (mailOptions.text) console.log("Text:", mailOptions.text);
            if (mailOptions.html) console.log("HTML:", mailOptions.html);
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

    db.run(`
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            rating TEXT,
            message TEXT,
            date TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS curated_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            message TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS bikes_for_sale (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            price TEXT,
            image_url TEXT,
            video_url TEXT,
            is_highlighted INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS dream_build_components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            image_url TEXT,
            link_url TEXT,
            sort_order INTEGER DEFAULT 0
        )
    `);

    // Migration: add description column if it doesn't exist (for DBs created before this column was added)
    db.run(`ALTER TABLE dream_build_components ADD COLUMN description TEXT`, () => {});

    db.run(`
        CREATE TABLE IF NOT EXISTS consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT,
            last_name TEXT,
            email TEXT,
            phone TEXT,
            description TEXT,
            contact_method TEXT,
            date TEXT
        )
    `);
});

// --- API ROUTES ---

// FILE UPLOADS
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ success: true, url: 'images/' + req.file.filename });
});

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

// REAL-TIME SSE ENDPOINT
app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Add this client to the stream pool
    sseClients.push(res);

    // Remove client when connection drops
    req.on('close', () => {
        sseClients = sseClients.filter(client => client !== res);
    });
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
        
        // Broadcast new job to all connected SSE clients
        sseClients.forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'new_service_request', data: job })}\n\n`);
        });

        res.json({ success: true });

        // If it's a Dream Build, send an email notification as well
        if (job.service === 'Dream Build' || (job.service && job.service.includes('Dream Build'))) {
            const mailOptions = {
                from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
                to: 'steve@weeecycle.net',
                subject: 'New Dream Build Request (via Contact Form)',
                html: `
                    <h3>New Dream Build Request</h3>
                    <p><strong>Customer:</strong> ${job.customer}</p>
                    <p><strong>Bike:</strong> ${job.bike || 'N/A'}</p>
                    <p><strong>Service:</strong> ${job.service}</p>
                    <p><strong>Date:</strong> ${job.date}</p>
                    <p><strong>Description:</strong></p>
                    <blockquote style="border-left: 4px solid #FF8000; padding-left: 10px; margin-left: 0;">
                        ${(job.description || 'No description provided').replace(/\n/g, '<br>')}
                    </blockquote>
                `
            };
            transporter.sendMail(mailOptions)
                .then(() => console.log("Dream Build notification email sent from api/jobs"))
                .catch(e => console.error("Dream Build email error from api/jobs:", e));
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// REVIEWS
app.post('/api/reviews', async (req, res) => {
    const { name, rating, message } = req.body;

    if (!name || !rating || !message) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const date = new Date().toISOString();

    try {
        await dbRun(`
            INSERT INTO reviews (name, rating, message, date)
            VALUES (?, ?, ?, ?)
        `, [name, rating, message, date]);
    } catch (e) {
        console.error("Review DB error:", e);
        return res.status(500).json({ error: "Internal server error while processing review" });
    }

    res.json({ success: true });

    // Send notification email — failure does not affect the user response
    const mailOptions = {
        from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
        to: 'steve@weeecycle.net',
        subject: 'New Website Review Received',
        html: `
            <h3>New Review from Weeecycle.net</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Rating:</strong> ${rating}</p>
            <p><strong>Message:</strong></p>
            <blockquote style="border-left: 4px solid #FF8000; padding-left: 10px; margin-left: 0;">
                ${message.replace(/\n/g, '<br>')}
            </blockquote>
            <p><small>Submitted on: ${new Date(date).toLocaleString()}</small></p>
        `
    };
    transporter.sendMail(mailOptions).catch(e => console.error("Review email error:", e));
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

// --- COMMUNICATION ---
app.post('/api/comm/send', async (req, res) => {
    const { toEmail, subject, htmlBody } = req.body;

    if (!toEmail || !subject || !htmlBody) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
            to: toEmail,
            subject: subject,
            html: htmlBody
        });

        console.log(`Email sent successfully to ${toEmail}`);
        res.json({ success: true, message: "Email Sent Successfully" });
    } catch (e) {
        console.error("Email send error:", e);
        res.status(500).json({ error: "Failed to send email." });
    }
});

// --- WEBSITE CONTROLS ---

app.get('/api/settings/site-status', (req, res) => {
    try {
        const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

        // Define regex to match the sections
        const servicesRegex = /<section\s+(?:[^>]*?\s+)?class="([^"]*)"[^>]*id="services"/;
        const reviewsRegex = /<section\s+(?:[^>]*?\s+)?class="([^"]*)"[^>]*id="reviews"/;
        const bikesRegex = /<section\s+(?:[^>]*?\s+)?class="([^"]*)"[^>]*id="bikes-for-sale"/;

        const servicesMatch = html.match(servicesRegex);
        const reviewsMatch = html.match(reviewsRegex);
        const bikesMatch = html.match(bikesRegex);

        const isServicesHidden = servicesMatch ? servicesMatch[1].includes('hidden') : false;
        const isReviewsHidden = reviewsMatch ? reviewsMatch[1].includes('hidden') : false;
        const isBikesHidden = bikesMatch ? bikesMatch[1].includes('hidden') : false;

        res.json({
            success: true,
            status: {
                services: !isServicesHidden, // True if showing, false if hidden
                reviews: !isReviewsHidden,
                bikes: !isBikesHidden
            }
        });
    } catch (e) {
        console.error("Error reading site status:", e);
        res.status(500).json({ error: "Could not read website files." });
    }
});

app.post('/api/settings/toggle-section', (req, res) => {
    const { section, isVisible } = req.body; // section: 'services' | 'reviews' | 'bikes-for-sale', isVisible: boolean
    if (!['services', 'reviews', 'bikes-for-sale'].includes(section)) return res.status(400).json({ error: "Invalid section" });

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

        // Push to GitHub — skip commit if nothing changed (already in correct state)
        console.log(`Toggled ${section} visibility -> ${isVisible}. Pushing to GitHub...`);
        const gitCmd = 'git add index.html && (git diff --quiet --cached && echo "NO_CHANGE" || (git commit -m "chore: toggle visibility via workshop" && git push))';
        exec(gitCmd, { cwd: __dirname, timeout: 30000 }, (err, stdout, stderr) => {
            if (stdout.includes('NO_CHANGE')) {
                // File was already in the correct state — no commit needed
                return res.json({ success: true, message: "Already up to date." });
            }
            if (err) {
                console.error("Git Push Failed:", stderr);
                return res.status(200).json({ success: false, error: "Settings saved locally but failed to sync to GitHub." });
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

app.post('/api/affiliates', (req, res) => {
    const { title, url, imageUrl } = req.body;
    db.run("INSERT INTO affiliates (title, url, image_path) VALUES (?, ?, ?)", [title, url, imageUrl || ''], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        syncAmazonStore();
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/affiliates/:id', (req, res) => {
    const { title, url, imageUrl } = req.body;
    const { id } = req.params;
    if (imageUrl !== undefined && imageUrl !== '') {
        db.run("UPDATE affiliates SET title = ?, url = ?, image_path = ? WHERE id = ?", [title, url, imageUrl, id], function (err) {
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

// --- BIKES FOR SALE ---
function syncBikesForSale() {
    db.all("SELECT * FROM bikes_for_sale ORDER BY id DESC", [], (err, rows) => {
        if (err) return;
        
        const highlightedBike = rows.find(b => b.is_highlighted === 1) || rows[0];
        
        // 1. Update index.html
        if (highlightedBike) {
            const indexHtmlStr = `
            <!-- Highlighted Bike Module -->
            <div class="max-w-6xl mx-auto bg-[#0B0B2B] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col lg:flex-row">
                <!-- Media Area -->
                <div class="w-full lg:w-3/5 relative flex flex-col">
                    <div class="relative w-full h-64 sm:h-80 lg:h-96 bg-gray-900 overflow-hidden group">
                        <img src="${highlightedBike.image_url || 'images/placeholder_frame.png'}" alt="${highlightedBike.title}" class="w-full h-full object-cover transform group-hover:scale-105 transition duration-700 opacity-80 mix-blend-screen" onerror="this.src='images/alloy_placeholder.png'" />
                    </div>
                    ${highlightedBike.video_url ? `
                    <div class="relative w-full h-48 sm:h-64 bg-black overflow-hidden border-t border-gray-800 group">
                        <video class="w-full h-full object-cover opacity-80" loop muted playsinline autoplay>
                            <source src="${highlightedBike.video_url}" type="video/mp4">
                        </video>
                    </div>` : ''}
                </div>
                <!-- Content Area -->
                <div class="w-full ${highlightedBike.video_url ? 'lg:w-2/5' : 'lg:w-2/5'} p-8 lg:p-12 flex flex-col justify-between relative bg-gradient-to-b from-[#12122b] to-[#0a0a1a]">
                    <div>
                        <div class="flex items-center gap-3 mb-4">
                            <span class="bg-brand-orange text-brand-dark text-xs font-bold uppercase py-1 px-3 rounded font-display tracking-wider shadow-[0_0_10px_rgba(255,128,0,0.4)]">Available Now</span>
                        </div>
                        <h3 class="font-display font-bold text-4xl md:text-5xl text-white uppercase leading-none mb-6">${highlightedBike.title}</h3>
                        <div class="space-y-4 mb-8">
                            <p class="text-gray-300 font-light leading-relaxed whitespace-pre-wrap">${highlightedBike.description}</p>
                        </div>
                    </div>
                    <div class="mt-auto border-t border-gray-800 pt-6">
                        <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div class="text-brand-orange font-display font-bold text-5xl tracking-tight leading-none drop-shadow-[0_0_15px_rgba(255,128,0,0.2)]">
                                ${highlightedBike.price}
                            </div>
                            <button onclick="document.getElementById('bike-inquiry-modal').classList.remove('hidden')" class="w-full sm:w-auto text-center bg-gray-200 hover:bg-white text-black font-display font-bold uppercase tracking-widest py-3 px-8 rounded transition transform hover:-translate-y-1 shadow-xl">
                                Inquire Now
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
            
            const indexPath = path.join(__dirname, 'index.html');
            let indexHtml = fs.readFileSync(indexPath, 'utf8');
            const indexRegex = /(<!-- BIKES_FOR_SALE_START -->)[\s\S]*?(<!-- BIKES_FOR_SALE_END -->)/;
            indexHtml = indexHtml.replace(indexRegex, (m, start, end) => `${start}\n${indexHtmlStr}\n            ${end}`);
            fs.writeFileSync(indexPath, indexHtml);
        }

        // 2. Update bikes-for-sale.html
        let listHtml = '';
        rows.forEach(row => {
            listHtml += `
            <div class="bg-[#0B0B2B] border border-gray-800 rounded-xl overflow-hidden shadow-xl flex flex-col hover:border-brand-orange transition duration-300">
                <div class="relative h-64 bg-gray-900">
                    <img src="${row.image_url || 'images/placeholder_frame.png'}" alt="${row.title}" class="w-full h-full object-cover opacity-80" />
                </div>
                <div class="p-6 flex flex-col flex-grow">
                    <h3 class="text-2xl font-display font-bold text-white uppercase mb-2">${row.title}</h3>
                    <div class="text-brand-orange font-display font-bold text-3xl mb-4">${row.price}</div>
                    <p class="text-gray-400 text-sm mb-6 flex-grow whitespace-pre-wrap">${row.description}</p>
                    <button onclick="openBikeModal('${row.title.replace(/'/g, "\\'")}')" class="w-full bg-brand-orange hover:bg-orange-600 text-white font-display font-bold uppercase py-3 rounded transition text-center mt-auto">
                        Inquire
                    </button>
                </div>
            </div>`;
        });

        const listPath = path.join(__dirname, 'bikes-for-sale.html');
        if (fs.existsSync(listPath)) {
            let pageHtml = fs.readFileSync(listPath, 'utf8');
            const listRegex = /(<!-- BIKES_LIST_START -->)[\s\S]*?(<!-- BIKES_LIST_END -->)/;
            pageHtml = pageHtml.replace(listRegex, (m, start, end) => `${start}\n${listHtml}\n                ${end}`);
            fs.writeFileSync(listPath, pageHtml);
        }

        exec(`git add index.html bikes-for-sale.html images/ && git commit -m "chore: sync bikes for sale" && git push`, { cwd: __dirname });
    });
}

app.get('/api/bikes', (req, res) => {
    db.all("SELECT * FROM bikes_for_sale ORDER BY id DESC", [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ success: true, data: rows });
    });
});

app.post('/api/bikes', (req, res) => {
    const { title, description, price, imageUrl, videoUrl, isHighlighted } = req.body;
    db.run("INSERT INTO bikes_for_sale (title, description, price, image_url, video_url, is_highlighted) VALUES (?, ?, ?, ?, ?, ?)", 
        [title, description, price, imageUrl || '', videoUrl || '', isHighlighted ? 1 : 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (isHighlighted) {
            db.run("UPDATE bikes_for_sale SET is_highlighted = 0 WHERE id != ?", [this.lastID], () => {
                syncBikesForSale();
            });
        } else {
            syncBikesForSale();
        }
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/bikes/:id', (req, res) => {
    const { title, description, price, imageUrl, videoUrl, isHighlighted } = req.body;
    const { id } = req.params;
    
    let query = "UPDATE bikes_for_sale SET title = ?, description = ?, price = ?";
    let params = [title, description, price];

    if (imageUrl !== undefined) { query += ", image_url = ?"; params.push(imageUrl); }
    if (videoUrl !== undefined) { query += ", video_url = ?"; params.push(videoUrl); }
    if (isHighlighted !== undefined) { query += ", is_highlighted = ?"; params.push(isHighlighted ? 1 : 0); }
    
    query += " WHERE id = ?";
    params.push(id);

    db.run(query, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (isHighlighted) {
            db.run("UPDATE bikes_for_sale SET is_highlighted = 0 WHERE id != ?", [id], () => {
                syncBikesForSale();
            });
        } else {
            syncBikesForSale();
        }
        res.json({ success: true });
    });
});

app.delete('/api/bikes/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM bikes_for_sale WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        syncBikesForSale();
        res.json({ success: true });
    });
});

// --- CURATED REVIEWS ---
function syncReviews() {
    db.all("SELECT * FROM curated_reviews ORDER BY sort_order, id", [], (err, rows) => {
        if (err) return;
        const reviewsHtml = rows.map(r => `
                <div class="bg-brand-dark border border-gray-800 rounded-xl p-8 shadow-xl">
                    <div class="flex text-brand-orange mb-4">
                        <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i
                            class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i
                            class="fa-solid fa-star"></i>
                    </div>
                    <p class="text-gray-300 italic mb-6">"${r.message.replace(/\n/g, '<br>').replace(/"/g, '&quot;')}"</p>
                    <div class="font-display font-bold text-xl text-white uppercase">- ${r.name}</div>
                </div>`).join('\n');

        const indexPath = path.join(__dirname, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf8');
        const regex = /(<!-- REVIEWS_START -->)[\s\S]*?(<!-- REVIEWS_END -->)/;
        if (!regex.test(html)) return;
        html = html.replace(regex, `$1\n${reviewsHtml}\n            $2`);
        fs.writeFileSync(indexPath, html);

        const gitCmd = 'git add index.html && (git diff --quiet --cached && echo "NO_CHANGE" || (git commit -m "chore: sync reviews" && git push))';
        exec(gitCmd, { cwd: __dirname, timeout: 30000 }, (err, stdout, stderr) => {
            if (stdout.includes('NO_CHANGE')) return;
            if (err) console.error('Reviews sync failed:', stderr);
            else console.log('Reviews synced to GitHub.');
        });
    });
}

app.get('/api/curated-reviews', (req, res) => {
    db.all("SELECT * FROM curated_reviews ORDER BY sort_order, id", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/curated-reviews', (req, res) => {
    const { name, message } = req.body;
    if (!name || !message) return res.status(400).json({ error: 'name and message are required' });
    db.run("INSERT INTO curated_reviews (name, message) VALUES (?, ?)", [name, message], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
        syncReviews();
    });
});

app.put('/api/curated-reviews/:id', (req, res) => {
    const { name, message } = req.body;
    if (!name || !message) return res.status(400).json({ error: 'name and message are required' });
    db.run("UPDATE curated_reviews SET name=?, message=? WHERE id=?", [name, message, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
        syncReviews();
    });
});

app.delete('/api/curated-reviews/:id', (req, res) => {
    db.run("DELETE FROM curated_reviews WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
        syncReviews();
    });
});

// --- DREAM BUILD COMPONENTS ---
function syncDreamBuild() {
    db.all("SELECT * FROM dream_build_components ORDER BY category, sort_order, id", [], (err, rows) => {
        if (err) return;
        const grouped = {};
        rows.forEach(r => {
            if (!grouped[r.category]) grouped[r.category] = [];
            grouped[r.category].push(r);
        });
        const jsonPath = path.join(__dirname, 'dream-build-components.json');
        fs.writeFileSync(jsonPath, JSON.stringify(grouped, null, 2));
        const gitCmd = 'git add dream-build-components.json images/ && (git diff --quiet --cached && echo "NO_CHANGE" || (git commit -m "chore: sync dream build components" && git push))';
        exec(gitCmd, { cwd: __dirname, timeout: 30000 }, (err, stdout, stderr) => {
            if (stdout.includes('NO_CHANGE')) return;
            if (err) console.error('Dream build sync failed:', stderr);
            else console.log('Dream build synced to GitHub.');
        });
    });
}

app.get('/api/dream-build-components', (req, res) => {
    db.all("SELECT * FROM dream_build_components ORDER BY category, sort_order, id", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const grouped = {};
        rows.forEach(r => {
            if (!grouped[r.category]) grouped[r.category] = [];
            grouped[r.category].push(r);
        });
        res.json({ success: true, data: grouped });
    });
});

app.post('/api/dream-build-components', (req, res) => {
    const { category, name, description, image_url, link_url } = req.body;
    if (!category || !name) return res.status(400).json({ error: 'category and name are required' });
    db.run(
        "INSERT INTO dream_build_components (category, name, description, image_url, link_url) VALUES (?, ?, ?, ?, ?)",
        [category, name, description || '', image_url || '', link_url || ''],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
            syncDreamBuild();
        }
    );
});

app.put('/api/dream-build-components/:id', (req, res) => {
    const { name, description, image_url, link_url } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    db.run(
        "UPDATE dream_build_components SET name=?, description=?, image_url=?, link_url=? WHERE id=?",
        [name, description || '', image_url || '', link_url || '', req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
            syncDreamBuild();
        }
    );
});

app.delete('/api/dream-build-components/:id', (req, res) => {
    db.run("DELETE FROM dream_build_components WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
        syncDreamBuild();
    });
});

// --- CONSULTATIONS ---
app.post('/api/consultations', async (req, res) => {
    console.log("Received consultation request:", req.body);
    const { firstName, lastName, email, phone, description, contactMethod } = req.body;

    if (!firstName || !lastName || !email || !description) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const date = new Date().toISOString();

    try {
        await dbRun(`
            INSERT INTO consultations (first_name, last_name, email, phone, description, contact_method, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [firstName, lastName, email, phone || '', description, contactMethod || 'email', date]);
        
        // Broadcast to SSE clients
        sseClients.forEach(client => {
            client.write(`data: ${JSON.stringify({ 
                type: 'new_consultation', 
                data: { firstName, lastName, email, phone, description, contactMethod, date } 
            })}\n\n`);
        });

        res.json({ success: true });

        // Send notification email
        const mailOptions = {
            from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
            to: 'steve@weeecycle.net',
            subject: 'New Dream Build Consultation Request',
            html: `
                <h3>New Dream Build Consultation Request</h3>
                <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
                <p><strong>Preferred Contact:</strong> ${contactMethod}</p>
                <p><strong>Build Description:</strong></p>
                <blockquote style="border-left: 4px solid #FF8000; padding-left: 10px; margin-left: 0;">
                    ${description.replace(/\n/g, '<br>')}
                </blockquote>
                <p><small>Submitted on: ${new Date(date).toLocaleString()}</small></p>
            `
        };
        transporter.sendMail(mailOptions)
            .then(() => console.log("Consultation email sent successfully to steve@weeecycle.net"))
            .catch(e => console.error("Consultation email error:", e));

    } catch (e) {
        console.error("Consultation DB error:", e);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lockdown Secure Server running at http://localhost:${PORT}`);
    console.log(`Database: SQLite (AES-256 Encrypted)`);
});
