const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const dataBuffer = fs.readFileSync('2021-04-15-sozialindex-veraenderungen-data.pdf');

async function dump() {
    try {
        const parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        fs.writeFileSync('hamburg_dump.txt', data.text);
        console.log('PDF text dumped to hamburg_dump.txt');
        await parser.destroy();
    } catch (e) {
        console.error(e);
    }
}

dump();
