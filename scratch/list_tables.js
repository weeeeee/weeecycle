const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('workshop.db');
db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows.map(r => r.name).join(', '));
    db.close();
});
