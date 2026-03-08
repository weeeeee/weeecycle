const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./workshop.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS affiliates (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, url TEXT, image_path TEXT)");

    const html = fs.readFileSync('amazonstore.html', 'utf8');

    if (html.includes('AFFILIATE_LINKS_START')) {
        console.log('Already migrated');
        process.exit(0);
    }

    const regex = /<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/;
    const match = html.match(regex);
    if (!match) {
        console.error("Could not find grid wrapper in amazonstore.html");
        process.exit(1);
    }
    const innerGrid = match[1];

    const itemRegex = /<img src="(.*?)"[\s\S]*?<h3.*?>([\s\S]*?)<\/h3>[\s\S]*?<a href="(.*?)"/g;

    let items = [];
    let result;
    while ((result = itemRegex.exec(innerGrid)) !== null) {
        items.push({
            image_path: result[1].trim(),
            title: result[2].trim().replace(/\s+/g, ' '),
            url: result[3].trim()
        });
    }

    console.log(`Found ${items.length} affiliate links. Importing...`);

    const stmt = db.prepare("INSERT INTO affiliates (title, url, image_path) VALUES (?, ?, ?)");
    for (const item of items) {
        stmt.run(item.title, item.url, item.image_path);
    }
    stmt.finalize();

    const newHtml = html.replace(match[1], `\n                <!-- AFFILIATE_LINKS_START -->\n${match[1]}                <!-- AFFILIATE_LINKS_END -->\n            `);

    fs.writeFileSync('amazonstore.html', newHtml);
    console.log("amazonstore.html updated with tags.");
});
db.close();
