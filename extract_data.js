const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'schools.db');
const PDF_PATH = path.resolve(__dirname, 'Schools Social Index.pdf');

// Known Kreise/Cities (Kreisfreie Städte) in Schleswig-Holstein as they appear in PDF
// We need to match the longest ones first
const KREISE = [
    "Rendsburg-Eckernförde",
    "Schleswig-Flensburg",
    "Hzgt. Lauenburg",
    "Herzogtum Lauenburg",
    "Lübeck, Hansestadt",
    "Dithmarschen",
    "Nordfriesland",
    "Ostholstein",
    "Pinneberg",
    "Plön",
    "Segeberg",
    "Steinburg",
    "Stormarn",
    "Kiel",
    "Flensburg",
    "Neumünster"
];

function normalizeText(text) {
    // Replace newlines with spaces, remove multiple spaces
    return text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
}

function parseSchools(text) {
    const schools = [];
    const normalized = normalizeText(text);

    // Regex:
    // (Prefix: Kreis Ort) (ID: 07xxxxx) (Schulform) (Name) (Index: digit at end)

    const idRegex = /(?:^|\s)(\d{7})\s+(\w+)\s/g;

    let match;
    const entries = [];

    while ((match = idRegex.exec(normalized)) !== null) {
        entries.push({
            id: match[1],
            type: match[2],
            index: match.index,
            matchLength: match[0].length
        });
    }

    console.log(`Found ${entries.length} potential entries.`);

    let previousEnd = 0;

    for (let i = 0; i < entries.length; i++) {
        const current = entries[i];

        // 1. Get Prefix (Kreis + Ort)
        const prefixRaw = normalized.substring(previousEnd, current.index).trim();

        // 3. Find the end of this entry (The Rating)
        const limitIndex = (i < entries.length - 1) ? entries[i + 1].index : normalized.length;
        const searchRegion = normalized.substring(current.index + current.matchLength, limitIndex);

        // Look for the rating
        const ratingRegex = /\s([1-9])(?=\s|$)/g;
        let rMatch;
        let lastRatingIndex = -1;
        let ratingValue = null;

        while ((rMatch = ratingRegex.exec(searchRegion)) !== null) {
            lastRatingIndex = rMatch.index;
            ratingValue = rMatch[1];
        }

        if (lastRatingIndex === -1) {
            console.warn(`No valid rating found for ID ${current.id}`);
            continue;
        }

        const schoolName = searchRegion.substring(0, lastRatingIndex).trim();
        const ratingAbsoluteIndex = current.index + current.matchLength + lastRatingIndex;
        previousEnd = ratingAbsoluteIndex + 2;

        // Parse Prefix
        let kreis = "";
        let ort = "";
        let foundKreis = false;

        let cleanPrefix = prefixRaw;

        // Check for known Kreise
        let bestKreis = "";
        let bestIndex = Infinity;

        // We want the match that appears EARLIEST in the string.
        // If multiple start at same position, take the LONGEST.
        for (const k of KREISE) {
            const idx = cleanPrefix.indexOf(k);
            if (idx !== -1) {
                if (idx < bestIndex) {
                    bestIndex = idx;
                    bestKreis = k;
                } else if (idx === bestIndex) {
                    if (k.length > bestKreis.length) {
                        bestKreis = k;
                    }
                }
            }
        }

        if (bestKreis) {
            foundKreis = true;
            kreis = bestKreis;
            ort = cleanPrefix.substring(bestIndex + bestKreis.length).trim();
        }

        if (!foundKreis) {
            const parts = cleanPrefix.split(' ');
            if (parts.length > 1) {
                kreis = parts[0];
                ort = parts.slice(1).join(' ');
            } else {
                kreis = parts[0];
                ort = "";
            }
        }

        // Clean up Ort
        ort = ort.replace(/^[-–]\s*/, '').trim();

        schools.push({
            id: current.id,
            kreis: kreis,
            ort: ort,
            schulform: current.type,
            name: schoolName,
            rating: parseInt(ratingValue)
        });
    }

    return schools;
}

async function main() {
    const db = new sqlite3.Database(DB_PATH);

    // Init DB
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS schools (
            id TEXT PRIMARY KEY,
            name TEXT,
            schulform TEXT,
            kreis TEXT,
            ort TEXT,
            rating INTEGER,
            lat REAL,
            lng REAL,
            address_raw TEXT
        )`);
    });

    // Read PDF
    try {
        const dataBuffer = fs.readFileSync(PDF_PATH);
        const parser = new PDFParse({ data: dataBuffer });
        const pdfData = await parser.getText();

        // Parse
        const extracted = parseSchools(pdfData.text);
        console.log(`Extracted ${extracted.length} schools.`);

        // Check existing to preserve lat/lng
        const existing = await new Promise((resolve, reject) => {
            db.all("SELECT id, ort, lat, lng FROM schools", (err, rows) => {
                if (err) reject(err);
                else {
                    const map = {};
                    rows.forEach(r => map[r.id] = r);
                    resolve(map);
                }
            });
        });

        const stmt = db.prepare(`
            INSERT INTO schools (id, name, schulform, kreis, ort, rating, lat, lng) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            schulform=excluded.schulform,
            kreis=excluded.kreis,
            ort=excluded.ort,
            rating=excluded.rating,
            lat=excluded.lat,
            lng=excluded.lng
        `);

        let updatedCount = 0;
        let resetCount = 0;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            extracted.forEach(s => {
                const old = existing[s.id];
                let lat = null;
                let lng = null;

                if (old) {
                    // Logic: Keep lat/lng if ort/kreis didn't change meaningfully
                    if (old.ort === s.ort) {
                        lat = old.lat;
                        lng = old.lng;
                    } else {
                        // Ort changed, reset lat/lng to force re-geocode
                        console.log(`Ort changed for ${s.id}: "${old.ort}" -> "${s.ort}"`);
                        resetCount++;
                    }
                } else {
                    updatedCount++;
                }

                stmt.run(s.id, s.name, s.schulform, s.kreis, s.ort, s.rating, lat, lng);
            });
            stmt.finalize();
            db.run("COMMIT", () => {
                console.log(`Data updated. Resets (re-geocode needed): ${resetCount}. New: ${updatedCount}.`);
                db.close();
            });
        });

        await parser.destroy();

    } catch (e) {
        console.error("Error processing PDF:", e);
    }
}

main();
