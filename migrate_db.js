const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('workshop.db');

db.serialize(() => {
    db.run("ALTER TABLE users ADD COLUMN email TEXT", (err) => {
        if (err && !err.message.includes("duplicate column name")) console.error(err);
    });
    db.run("ALTER TABLE users ADD COLUMN reset_token TEXT", (err) => {
        if (err && !err.message.includes("duplicate column name")) console.error(err);
    });
    db.run("ALTER TABLE users ADD COLUMN reset_expiry INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column name")) console.error(err);
    });

    db.run("UPDATE users SET email = 'admin@weeecycle.net' WHERE username = 'admin' AND email IS NULL", (err) => {
        if (err) console.error(err);
        else console.log("Database schema updated with email and token columns.");
    });
});

db.close();
