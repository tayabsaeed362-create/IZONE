/* eslint-disable @typescript-eslint/no-require-imports */
// Self-host OCR assets; run automatically before development and production builds.
const fs = require('node:fs');
const path = require('node:path');
const dest = path.resolve(__dirname, '../public/ocr');
fs.mkdirSync(dest, { recursive: true });
const packageRoot = name => path.dirname(require.resolve(`${name}/package.json`));
fs.copyFileSync(path.join(packageRoot('tesseract.js'), 'dist/worker.min.js'), path.join(dest, 'worker.min.js'));
const core = packageRoot('tesseract.js-core');
for (const name of fs.readdirSync(core).filter(name => /\.wasm(\.js)?$/.test(name))) fs.copyFileSync(path.join(core, name), path.join(dest, name));
fs.copyFileSync(path.join(packageRoot('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz'), path.join(dest, 'eng.traineddata.gz'));
for (const name of ['tesseract.js', 'tesseract.js-core']) {
 const license = path.join(packageRoot(name), 'LICENSE');
 if(fs.existsSync(license)) fs.copyFileSync(license, path.join(dest, `${name}-LICENSE`));
}
console.log('Local OCR assets ready.');
