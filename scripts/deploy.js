import { Clients } from '@bf6mods/portal';
import { TextEncoder } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const BLACKLIST = ['911', '69', '420', '88', '666'];
const UNAUTHENTICATED_CODE = 16;
const MOD_ID_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if the version string (with dots removed) contains any blacklisted substring. */
const isVersionBlacklisted = (version) => {
    const withoutDots = version.replace(/\./g, '');
    return BLACKLIST.some((s) => withoutDots.includes(s));
};

const normalizeEnvValue = (value) => {
    return typeof value === 'string' ? value.trim() : '';
};

const fileContentsToBase64 = (filePath, isJson = false) => {
    const contents = fs.readFileSync(filePath, 'utf8');
    return new TextEncoder().encode(isJson ? JSON.stringify(JSON.parse(contents)) : contents);
};

const createTsAttachment = (filePath, version = '1.0.0') => {
    return {
        id: crypto.randomUUID().toString(),
        version,
        filename: `${path.parse(filePath).name}.ts`,
        isProcessable: true,
        processingStatus: 2,
        attachmentData: { original: fileContentsToBase64(filePath) },
        attachmentType: 2,
        errors: [],
    };
};

const createStringsAttachment = (filePath, version = '1.0.0') => {
    return {
        id: crypto.randomUUID().toString(),
        version,
        filename: `${path.parse(filePath).name}.json`,
        isProcessable: true,
        processingStatus: 2,
        attachmentData: { original: fileContentsToBase64(filePath, true) },
        attachmentType: 4,
        errors: [],
    };
};

const updateAttachments = (attachments, codeFilePath, stringsFilePath, version) => {
    const existing = Array.isArray(attachments) ? attachments : [];
    const next = [];
    let hasTsAttachment = false;
    let hasStringsAttachment = false;

    for (const attachment of existing) {
        if (attachment?.attachmentType === 2) {
            next.push(createTsAttachment(codeFilePath, version));
            hasTsAttachment = true;
            continue;
        }

        if (attachment?.attachmentType === 4) {
            next.push(createStringsAttachment(stringsFilePath, version));
            hasStringsAttachment = true;
            continue;
        }

        next.push(attachment);
    }

    if (!hasTsAttachment) {
        next.push(createTsAttachment(codeFilePath, version));
    }

    if (!hasStringsAttachment) {
        next.push(createStringsAttachment(stringsFilePath, version));
    }

    return next;
};

const parseArgs = () => {
    const argv = process.argv.slice(2);
    let scriptPath = 'dist/bundle.ts';
    let stringsPath = 'dist/bundle.strings.json';
    let versionBump = 'patch';

    for (let i = 0; i < argv.length; ++i) {
        if (argv[i] === '--script' && argv[i + 1]) {
            scriptPath = argv[++i];
        } else if (argv[i] === '--strings' && argv[i + 1]) {
            stringsPath = argv[++i];
        } else if (argv[i] === '--versionBump' && argv[i + 1]) {
            const value = argv[++i];

            if (value !== 'patch' && value !== 'minor' && value !== 'major') continue;
            versionBump = value;
        }
    }

    return { scriptPath, stringsPath, versionBump };
};

const bumpVersion = (version, versionBump) => {
    const parts = version.split('.').map((s) => parseInt(s, 10) || 0);
    let [major = 0, minor = 0, patch = 0] = parts;
    let candidate;

    do {
        if (versionBump === 'patch') {
            patch += 1;
            candidate = `${major}.${minor}.${patch}`;
        } else if (versionBump === 'minor') {
            minor += 1;
            patch = 0;
            candidate = `${major}.${minor}.${patch}`;
        } else if (versionBump === 'major') {
            major += 1;
            minor = 0;
            patch = 0;
            candidate = `${major}.${minor}.${patch}`;
        } else {
            return version;
        }
    } while (isVersionBlacklisted(candidate));

    return candidate;
};

const isUnauthenticatedError = (err) => {
    const code = Number(err?.code);
    const message = String(err?.rawMessage ?? err?.message ?? '');
    return code === UNAUTHENTICATED_CODE || /\[unauthenticated\]/i.test(message);
};

const getDeployErrorMessage = (err) => {
    return String(err?.rawMessage ?? err?.message ?? err);
};

const printAuthRemediation = () => {
    console.error('  Authentication failed (gRPC code 16: unauthenticated).');
    console.error('  Refresh SESSION_ID from a fresh https://portal.battlefield.com session and retry.');
    console.error('  Ensure the logged-in account can access the experience for MOD_ID.');
    console.error('  Optional: set AUTH_CODE in .env to authenticate directly via auth code.');
};

const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const experienceName = packageJson.experienceName ?? 'My Experience';
const currentVersion = packageJson.version ?? '0.0.0';

const { scriptPath, stringsPath, versionBump } = parseArgs();
const newVersion = bumpVersion(currentVersion, versionBump);

const sessionId = normalizeEnvValue(process.env.SESSION_ID);
const authCode = normalizeEnvValue(process.env.AUTH_CODE);
const modId = normalizeEnvValue(process.env.MOD_ID);

const missingAuthInputs = !sessionId && !authCode;
if (missingAuthInputs) {
    throw new Error(
        'Missing credentials: set SESSION_ID or AUTH_CODE in .env before deploying.'
    );
}

if (!modId) {
    throw new Error('Missing MOD_ID in .env.');
}

if (!MOD_ID_UUID_REGEX.test(modId)) {
    throw new Error(
        `MOD_ID "${modId}" is not a valid UUID. Copy the id query param from your Portal experience URL.`
    );
}

const authSource = authCode ? 'AUTH_CODE' : 'SESSION_ID';

console.log('');
console.log('  Deploy');
console.log('  -----------------------------------------');
console.log('  Script:     ', scriptPath);
console.log('  Strings:    ', stringsPath);
console.log('  Version:    ', currentVersion, '->', newVersion, `(${versionBump})`);
console.log('  Experience: ', `${experienceName} v${newVersion}`);
console.log('  Auth via:   ', authSource);
console.log('  -----------------------------------------');
console.log('');

const authOptions = authCode
    ? { authCode, ...(sessionId ? { sessionId } : {}) }
    : { sessionId };

process.stdout.write('  Configuring auth context...');
const clients = await new Clients().authenticate(authOptions);
process.stdout.write(`\r\x1b[K  Session context configured via ${authSource}.\n`);

process.stdout.write('  Verifying authentication...');
try {
    await clients.play.getOwnedPlayElements({
        publishStates: [1, 2, 4],
        includeDenied: true,
    });
    process.stdout.write('\r\x1b[K  Authentication verified.\n');
} catch (err) {
    process.stdout.write('\r\x1b[K');
    console.error('');
    if (isUnauthenticatedError(err)) {
        printAuthRemediation();
        process.exit(1);
    }
    throw err;
}

process.stdout.write('  Fetching experience...');
const { playElement, playElementDesign } = await clients.play.getPlayElement({
    id: modId,
    includeDenied: true,
});

if (!playElement || !playElementDesign) {
    throw new Error(
        `Could not load play element for MOD_ID "${modId}". ` +
            'Verify MOD_ID is copied from your Portal experience editor URL (id query param) and credentials are current.'
    );
}

process.stdout.write(`\r\x1b[K  Fetched: ${playElement.name ?? playElement.id ?? modId}\n`);

const targetPlayElementId = playElement?.id ?? modId;
const newAttachments = updateAttachments(playElementDesign?.attachments, scriptPath, stringsPath, newVersion);

const updatedPlayElement = {
    id: targetPlayElementId,
    name: `${experienceName} v${newVersion}`,
    description: playElement?.description,
    designMetadata: playElementDesign?.designMetadata,
    mapRotation: playElementDesign?.mapRotation,
    mutators: playElementDesign?.mutators,
    assetCategories: playElementDesign?.assetCategories,
    originalModRules: playElementDesign?.modRules?.compatibleRules?.original,
    playElementSettings: playElement?.playElementSettings,
    publishState: 1,
    modLevelDataId: playElementDesign?.modLevelDataId,
    thumbnailUrl: playElement?.thumbnailUrl,
    attachments: newAttachments,
};

process.stdout.write(`  Updating experience to version ${newVersion} (this may take up to 10 seconds)...`);
const updateStart = Date.now();

try {
    const result = await clients.play.updatePlayElement(updatedPlayElement);

    for (const attachment of result.playElementDesign?.attachments ?? []) {
        const errorCount = attachment.errors?.length ?? 0;

        if (errorCount > 0) {
            console.error('');
            console.error(`  ${attachment.filename} errors (${errorCount}):`);
            for (const [index, error] of attachment.errors.slice(0, 20).entries()) {
                const line = error?.line ?? '?';
                const column = error?.character ?? '?';
                const message = error?.text ?? JSON.stringify(error);
                console.error(`  ${index + 1}. [${line}:${column}] ${message}`);
            }
            if (errorCount > 20) {
                console.error(`  ...and ${errorCount - 20} more`);
            }
            throw new Error(`${attachment.filename} has ${errorCount} errors.`);
        }
    }

    const elapsed = ((Date.now() - updateStart) / 1000).toFixed(1);
    process.stdout.write(`\r\x1b[K  ✓ Update complete to version ${newVersion} in ${elapsed} seconds.\n`);

    process.stdout.write('  Writing package.json...');
    packageJson.experienceName = experienceName;
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n');
    process.stdout.write('\r\x1b[K  ✓ package.json updated.\n');
    console.log('  Done.');
} catch (err) {
    const elapsed = ((Date.now() - updateStart) / 1000).toFixed(1);
    process.stdout.write(`\r\x1b[K  ✗ Update failed after ${elapsed} seconds.\n`);
    console.error('');

    if (isUnauthenticatedError(err)) {
        printAuthRemediation();
    } else {
        console.error('  Error:', getDeployErrorMessage(err));
    }

    if (err?.stack) {
        console.error('');
        console.error(err.stack);
    }

    console.error('');
    process.exit(1);
}
