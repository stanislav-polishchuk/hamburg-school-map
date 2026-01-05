const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const dataBuffer = fs.readFileSync('Schools Social Index.pdf');

async function dump() {
    try {
        const parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        fs.writeFileSync('pdf_dump.txt', data.text);
        console.log('PDF text dumped to pdf_dump.txt');
        await parser.destroy();
    } catch (e) {
        console.error(e);
    }
}

dump();
