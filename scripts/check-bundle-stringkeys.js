import fs from 'node:fs';
import path from 'node:path';

const bundlePath = path.join(process.cwd(), 'dist', 'bundle.ts');
const stringsPath = path.join(process.cwd(), 'dist', 'bundle.strings.json');

if (!fs.existsSync(bundlePath)) {
    console.error(`[bundle-stringkey-check] Missing file: ${bundlePath}`);
    process.exit(1);
}

if (!fs.existsSync(stringsPath)) {
    console.error(`[bundle-stringkey-check] Missing file: ${stringsPath}`);
    process.exit(1);
}

const bundleText = fs.readFileSync(bundlePath, 'utf8');
const strings = JSON.parse(fs.readFileSync(stringsPath, 'utf8'));
const stringKeyRegex = /\bmod\.stringkeys\.([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
const referencedKeys = new Set();

let match;
while ((match = stringKeyRegex.exec(bundleText)) !== null) {
    referencedKeys.add(match[1]);
}

const missingKeys = [...referencedKeys].filter((key) => !Object.prototype.hasOwnProperty.call(strings, key)).sort();

if (missingKeys.length > 0) {
    console.error('[bundle-stringkey-check] Missing stringkeys referenced by dist/bundle.ts:');
    for (const key of missingKeys) {
        console.error(`- ${key}`);
    }
    process.exit(1);
}

console.log(`[bundle-stringkey-check] OK: ${referencedKeys.size} referenced stringkeys are present.`);
