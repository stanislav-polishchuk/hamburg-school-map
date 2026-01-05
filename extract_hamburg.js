const fs = require('fs');
// Standard way to use pdf-parse if it exports a function or object
// Adjusting based on previous errors.
// Try direct require if it exports a function, or destructure if it exports a class/object.
// In extract_data.js 'const { PDFParse } = require('pdf-parse')' worked.
const { PDFParse } = require('pdf-parse');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const PDF_PATH = path.resolve(__dirname, '2021-04-15-sozialindex-veraenderungen-data.pdf');
const DB_PATH = path.resolve(__dirname, 'schools.db');

async function main() {
    const db = new sqlite3.Database(DB_PATH);
    const dataBuffer = fs.readFileSync(PDF_PATH);

    try {
        // Instantiate using the class as in extract_data.js
        const parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        const lines = data.text.split('\n');

        console.log(`Parsed ${lines.length} lines.`);

        const schools = [];
        let index = 1;

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.startsWith('Schulname')) continue; // Header
            if (line.startsWith('--')) continue; // Page number
            if (line.startsWith('Erläuterungen')) continue; // Footer
            if (line.startsWith('Bei Schulen')) continue;
            if (line.startsWith('Schulen in')) continue;

            // Format: Name  IndexOld  IndexNew
            // Regex to capture Name (greedy) and then two distinct tokens at end
            // Index can be digit or "nv"
            const match = line.match(/^(.+?)\s+(nv|\d+)\s+(nv|\d+)$/);

            if (match) {
                const name = match[1].trim();
                const ratingRaw = match[3]; // Sozialindex neu

                if (ratingRaw !== 'nv') {
                    schools.push({
                        id: `HH-${String(index).padStart(4, '0')}`,
                        name: name,
                        rating: parseInt(ratingRaw)
                    });
                    index++;
                }
            }
        }

        console.log(`Found ${schools.length} schools.`);

        const stmt = db.prepare(`
            INSERT INTO schools (id, name, schulform, kreis, ort, state, rating) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            rating=excluded.rating
        `);

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            schools.forEach(s => {
                stmt.run(s.id, s.name, 'Unbekannt', 'Hamburg', 'Hamburg', 'HH', s.rating);
            });
            stmt.finalize();
            db.run("COMMIT", () => {
                console.log("Hamburg schools inserted.");
                db.close();
            });
        });

        await parser.destroy();

    } catch (e) {
        console.error(e);
    }
}

main();
