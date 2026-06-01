import fs from 'node:fs';
import path from 'node:path';

const bundlePath = path.join(process.cwd(), 'dist', 'bundle.ts');

if (!fs.existsSync(bundlePath)) {
    console.error(`[bundle-symbol-check] Missing file: ${bundlePath}`);
    process.exit(1);
}

const lines = fs.readFileSync(bundlePath, 'utf8').split(/\r?\n/);
const declarations = new Map();
const exportedNames = new Map();

const matchers = [
    /^export\s+interface\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^interface\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^export\s+type\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^type\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^export\s+enum\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^enum\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^export\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
    /^export\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^export\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b(?:\s*:[^=;]+)?\s*(?:=|;)/,
    /^export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/,
    /^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
    /^class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
    /^(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b(?:\s*:[^=;]+)?\s*(?:=|;)/,
];

const namedExportMatcher = /^export\s*\{([^}]*)\}/;

function pushOccurrence(map, name, lineNumber) {
    const previous = map.get(name);
    if (previous) {
        previous.push(lineNumber);
    } else {
        map.set(name, [lineNumber]);
    }
}

for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;

    const namedExportMatch = line.match(namedExportMatcher);
    if (namedExportMatch) {
        const specifiers = namedExportMatch[1]
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

        for (const specifier of specifiers) {
            const aliasMatch = specifier.match(
                /^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/
            );
            if (!aliasMatch) continue;

            pushOccurrence(exportedNames, aliasMatch[2] ?? aliasMatch[1], lineNumber);
        }
    }

    for (const matcher of matchers) {
        const match = line.match(matcher);
        if (!match) continue;
        const name = match[1];
        pushOccurrence(declarations, name, lineNumber);

        if (line.startsWith('export ')) {
            pushOccurrence(exportedNames, name, lineNumber);
        }

        break;
    }
}

const duplicateDeclarations = [...declarations.entries()]
    .filter((entry) => entry[1].length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

const duplicateExportedNames = [...exportedNames.entries()]
    .filter((entry) => entry[1].length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

if (duplicateDeclarations.length > 0) {
    console.error('[bundle-symbol-check] Duplicate top-level declarations found:');
    for (const [name, lineNumbers] of duplicateDeclarations) {
        console.error(`- ${name}: lines ${lineNumbers.join(', ')}`);
    }
}

if (duplicateExportedNames.length > 0) {
    console.error('[bundle-symbol-check] Duplicate exported names found:');
    for (const [name, lineNumbers] of duplicateExportedNames) {
        console.error(`- ${name}: lines ${lineNumbers.join(', ')}`);
    }
}

if (duplicateDeclarations.length > 0 || duplicateExportedNames.length > 0) {
    process.exit(1);
}

console.log('[bundle-symbol-check] OK: no duplicate top-level declarations or exported names.');
