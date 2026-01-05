const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DB_PATH = path.resolve(__dirname, 'schools.db');

app.use(cors());
app.use(express.static(__dirname));

app.get('/api/schools', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all("SELECT * FROM schools WHERE lat IS NOT NULL", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
        db.close();
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
