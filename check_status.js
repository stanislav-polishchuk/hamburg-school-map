const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'schools.db');
const db = new sqlite3.Database(DB_PATH);

db.get("SELECT COUNT(*) as count FROM schools", (err, row) => {
    const total = row.count;
    db.get("SELECT COUNT(*) as count FROM schools WHERE lat IS NULL", (err, row) => {
        const missing = row.count;
        console.log(`Total Schools: ${total}`);
        console.log(`Missing Coordinates: ${missing}`);
        console.log(`Success Rate: ${((total - missing) / total * 100).toFixed(2)}%`);
        db.close();
    });
});
