const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'schools.db');
const OUT_DIR = path.resolve(__dirname, 'docs');
const OUT_FILE = path.resolve(OUT_DIR, 'schools.json');

// Ensure output directory exists
if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR);
}

const db = new sqlite3.Database(DB_PATH);

db.all("SELECT * FROM schools WHERE lat IS NOT NULL", (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(rows, null, 2));
    console.log(`Exported ${rows.length} schools to ${OUT_FILE}`);
    db.close();
});
