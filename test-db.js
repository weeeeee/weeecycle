const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./workshop.db');
db.all("SELECT * FROM bikes_for_sale;", [], (err, rows) => {
  if (err) console.error(err);
  console.log(rows);
});
