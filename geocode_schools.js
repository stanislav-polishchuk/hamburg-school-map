const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'schools.db');

// Map for problematic Kreis names
const KREIS_MAPPING = {
    "Hzgt. Lauenburg": "Herzogtum Lauenburg",
    "Lübeck, Hansestadt": "Lübeck"
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchNominatim(query) {
    console.log(`Querying: ${query}`);
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: query,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'SchoolMapApp/1.0'
            }
        });
        if (response.data && response.data.length > 0) {
            return {
                lat: response.data[0].lat,
                lng: response.data[0].lon
            };
        }
    } catch (e) {
        console.error(`Error querying "${query}": ${e.message}`);
    }
    return null;
}

async function geocode() {
    const db = new sqlite3.Database(DB_PATH);

    // Check args
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10000;

    // Fetch nulls
    db.all("SELECT * FROM schools WHERE lat IS NULL LIMIT ?", [limit], async (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }

        console.log(`Attempting to geocode ${rows.length} remaining schools...`);
        const updateStmt = db.prepare("UPDATE schools SET lat = ?, lng = ? WHERE id = ?");

        for (const row of rows) {
            let result = null;

            let kreis = row.kreis;
            if (KREIS_MAPPING[kreis]) {
                kreis = KREIS_MAPPING[kreis];
            }

            // Strategy 1: Full Name + Ort + Kreis
            // Clean Name: stop at comma
            const shortName = row.name.split(',')[0].trim();

            const strategies = [
                // 1. Full Info (Original, risk of too much noise)
                `${row.name}, ${row.ort}, ${kreis}, Germany`,

                // 2. Short Name + Ort + Kreis
                `${shortName}, ${row.ort}, ${kreis}, Germany`,

                // 3. Short Name + Ort
                `${shortName}, ${row.ort}, Germany`,

                // 4. Type + Ort + Kreis ("Grundschule Meldorf")
                `${row.schulform} ${row.ort}, ${kreis}, Germany`,

                // 5. Just Ort + Kreis (Town Centroid - Last Resort)
                `${row.ort}, ${kreis}, Germany`
            ];

            // Remove duplicates
            const uniqueStrategies = [...new Set(strategies)];

            for (const query of uniqueStrategies) {
                result = await searchNominatim(query);
                if (result) {
                    console.log(`  -> Found: ${result.lat}, ${result.lng} (Strategy: ${query})`);
                    break;
                }
                await sleep(1100); // Rate limit between retries for same school
            }

            if (result) {
                updateStmt.run(result.lat, result.lng, row.id);
            } else {
                console.log(`  -> FAILED all strategies for ID ${row.id}`);
            }

            // Rate limit between schools
            await sleep(1100);
        }

        updateStmt.finalize();
        db.close();
        console.log("Batch complete.");
    });
}

geocode();
