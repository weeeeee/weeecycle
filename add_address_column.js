const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('workshop.db');

db.serialize(() => {
    db.run("ALTER TABLE contacts ADD COLUMN address TEXT", (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                console.log("Column 'address' already exists.");
            } else {
                console.error("Error adding column:", err.message);
            }
        } else {
            console.log("Column 'address' added successfully to 'contacts' table.");
        }
    });
});

db.close();
