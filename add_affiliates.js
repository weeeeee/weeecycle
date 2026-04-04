const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./workshop.db');

const items = [
    { title: 'Work Stand', url: 'https://amzn.to/4qsvbUs', img: 'images/park Tool work bench.png' },
    { title: 'Premium Lube', url: 'https://amzn.to/4bc5L8S', img: 'images/Tri-Flow-Lube.png' },
    { title: 'Torque Wrench', url: 'https://amzn.to/4asA0Iw', img: 'images/Torque Wrench Pro Bike Tool.png' },
    { title: 'Orange Bar Tape', url: 'https://amzn.to/4qckoy1', img: 'images/orange bartape.png' },
];

db.serialize(() => {
    const stmt = db.prepare("INSERT INTO affiliates (title, url, image_path) VALUES (?, ?, ?)");
    for (const item of items) {
        stmt.run(item.title, item.url, item.img);
    }
    stmt.finalize();
    console.log("Added items to affiliates table.");
});

db.close();
