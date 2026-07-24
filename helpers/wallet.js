/* ==========================================================
   ALEXA API
   File : helpers/wallet.js
   Description : Wallet Helpers v2 Final
========================================================== */

import {
    getDocument,
    setDocument,
    deleteDocument
} from "./firestore.js";
import { getNow } from "./request.js";
import { sha256 } from "./security.js";
import { appendHistory } from "./history.js";
import { LEXA_WORDS } from "./lexa-words.js";

/* ==========================================================
   CONFIG
========================================================== */

Object.freeze(LEXA_WORDS);

const WALLET_PREFIX = "LX7";
const WALLET_CHAIN = "LEXA Chain";
const USDT_CHAIN = "BNB Smart Chain";
const RECOVERY_WORD_COUNT = 12;
const LOCK_TTL_MS = 12_000;
const WALLET_LOCK_PREFIX = "walletLock/";
const WALLET_ADDRESS_PREFIX = "walletAddress/";

/* ==========================================================
   DEFAULT DATA
========================================================== */

export function defaultWalletData() {
    return {
        uid: "",
        address: "",
        publicKey: "",
        encryptedPrivateKey: "",
        pinHash: "",
        pinCreatedAt: null,
        status: "active",
        chain: WALLET_CHAIN,
        lexa: 0,
        usdt: 0,
        security: {
            pinEnabled: false,
            recoveryVerified: false
        },
        recovery: {
    encryptedPhrase: "",
    verified: false,
    masked: false,
    wordCount: RECOVERY_WORD_COUNT,
    phraseHash: ""
},
        backup: {
            qrEnabled: false,
            qrEncrypted: "",
            qrCreatedAt: null            
        },
        walletMeta: {
            algorithm: "LEXA-RECOVERY-V2"
        },
        createdAt: null,
        updatedAt: null
    };
}

export function normalizeWallet(doc = {}) {
    const base = defaultWalletData();

    return {
        ...base,
        ...doc,
        security: {
            ...base.security,
            ...(doc.security || {})
        },
        recovery: {
            ...base.recovery,
            ...(doc.recovery || {})
        },
        backup: {
            ...base.backup,
            ...(doc.backup || {})
        },
        walletMeta: {
            ...base.walletMeta,
            ...(doc.walletMeta || {})
        }
    };
}

/* ==========================================================
   DOCUMENT
========================================================== */

export async function getWalletDoc(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return getDocument(env, `wallets/${uid}`);
}

export async function setWalletDoc(env, uid, data = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return setDocument(env, `wallets/${uid}`, data);
}

export async function deleteWalletDoc(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return deleteDocument(env, `wallets/${uid}`);
}

/* ==========================================================
   BASIC HELPERS
========================================================== */

function sanitizeWord(word) {
    return String(word || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "");
}

function normalizePhrase(input = []) {
    if (!Array.isArray(input)) return [];
    return input.map(sanitizeWord).filter(Boolean);
}

function ensureValidPin(pin) {
    const value = String(pin || "").trim();

    if (!/^\d{6}$/.test(value)) {
        throw new Error("PIN must be 6 digits.");
    }

    if (/^(\d)\1{5}$/.test(value)) {
        throw new Error("PIN cannot be repeated digits.");
    }

    if (value === "123456" || value === "654321" || value === "000000") {
        throw new Error("PIN is too weak.");
    }

    return value;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBytes(hex) {
    const clean = String(hex || "").trim();
    if (!clean || clean.length % 2 !== 0) {
        throw new Error("Invalid hex.");
    }

    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
    }
    return out;
}

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(String(base64 || ""));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

function randomInt(max) {
    if (!Number.isInteger(max) || max <= 0) {
        throw new Error("Invalid max.");
    }

    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;

    while (true) {
        crypto.getRandomValues(buf);
        if (buf[0] < limit) {
            return buf[0] % max;
        }
    }
}

function shuffleArray(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function uniqueArray(arr) {
    return [...new Set(arr)];
}

function indexToWord(index) {
    const wordIndex = Number(index);
    if (!Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex >= LEXA_WORDS.length) {
        throw new Error("Invalid recovery phrase word index.");
    }
    return LEXA_WORDS[wordIndex];
}

function wordToIndex(word) {
    const idx = LEXA_WORDS.indexOf(sanitizeWord(word));
    if (idx < 0) {
        throw new Error("Invalid recovery phrase word.");
    }
    return idx;
}

/* ==========================================================
   HASH / DERIVATION
========================================================== */

async function sha256Hex(text) {
    return sha256(String(text || ""));
}

async function deriveSeedFromPhrase(phrase) {
    const words = normalizePhrase(phrase);

    if (words.length !== RECOVERY_WORD_COUNT) {
        throw new Error("Invalid recovery phrase.");
    }

    const joined = words.join("|");
    return await sha256Hex(`LEXA-SEED-V2:${joined}`);
}

async function derivePrivateKeyFromSeed(seedHex) {
    return await sha256Hex(`LEXA-PRIVATE-V2:${seedHex}`);
}

async function derivePublicKeyFromPrivateKey(privateKeyHex) {
    return await sha256Hex(`LEXA-PUBLIC-V2:${privateKeyHex}`);
}

async function deriveAddressFromPublicKey(publicKeyHex) {
    const raw = await sha256Hex(`LEXA-ADDRESS-V2:${publicKeyHex}`);
    return `${WALLET_PREFIX}${raw.toUpperCase().slice(0, 40)}`;
}

async function deriveWalletMaterialFromPhrase(phrase) {
    const seed = await deriveSeedFromPhrase(phrase);
    const privateKey = await derivePrivateKeyFromSeed(seed);
    const publicKey = await derivePublicKeyFromPrivateKey(privateKey);
    const address = await deriveAddressFromPublicKey(publicKey);

    return {
        seed,
        privateKey,
        publicKey,
        address
    };
}

/* ==========================================================
   AES-GCM HELPERS
========================================================== */

async function aesKeyFromPin(pin) {
    const pinKeyHex = await sha256Hex(`LEXA-AES-GCM-PIN:${String(pin || "")}`);
    return hexToBytes(pinKeyHex.slice(0, 64));
}

async function encryptText(plainText, pin) {
    const keyBytes = await aesKeyFromPin(pin);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(String(plainText || ""));

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        data
    );

    const merged = new Uint8Array(iv.length + cipher.byteLength);
    merged.set(iv, 0);
    merged.set(new Uint8Array(cipher), iv.length);

    return bytesToBase64(merged);
}

async function decryptText(encryptedText, pin) {
    const raw = base64ToBytes(encryptedText);
    if (raw.length < 13) {
        throw new Error("Invalid encrypted payload.");
    }

    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const keyBytes = await aesKeyFromPin(pin);

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        data
    );

    return new TextDecoder().decode(plain);
}

/* ==========================================================
   LOCK HELPERS
========================================================== */

async function tryAcquireLock(env, lockKey) {
    const now = getNow();
    const lockPath = `${WALLET_LOCK_PREFIX}${lockKey}`;
    const existing = await getDocument(env, lockPath);

    if (existing?.lockedUntil && Number(existing.lockedUntil) > now) {
        return false;
    }

    await setDocument(env, lockPath, {
        lockedAt: now,
        lockedUntil: now + LOCK_TTL_MS
    });

    return true;
}

async function releaseLock(env, lockKey) {
    try {
        await deleteDocument(env, `${WALLET_LOCK_PREFIX}${lockKey}`);
    } catch {
        return false;
    }
    return true;
}

async function withLock(env, lockKey, fn) {
    const acquired = await tryAcquireLock(env, lockKey);
    if (!acquired) {
        throw new Error("Wallet is busy. Please retry.");
    }

    try {
        return await fn();
    } finally {
        await releaseLock(env, lockKey);
    }
}

/* ==========================================================
   RECOVERY PHRASE
========================================================== */

function selectUniqueWordIndexes(count = RECOVERY_WORD_COUNT) {
    const picked = new Set();

    while (picked.size < count) {
        const buf = crypto.getRandomValues(new Uint32Array(1));
        const idx = buf[0] % LEXA_WORDS.length;
        picked.add(idx);
    }

    return shuffleArray([...picked]);
}

export async function createRecoveryPhrase() {
    const indexes = selectUniqueWordIndexes(RECOVERY_WORD_COUNT);
    const phrase = indexes.map(indexToWord);

    const phraseHash = await sha256Hex(`LEXA-PHRASE-HASH-V2:${phrase.join("|")}`);

    return {
        phrase,
        meta: {
            wordCount: RECOVERY_WORD_COUNT,
            algorithm: "LEXA-RECOVERY-V2",
            phraseHash
        }
    };
}

export async function getRecoveryPhrase(env, uid, pin) {
    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    if (wallet.recovery.masked) {
    return [];
}
await verifyWalletPin(env, uid, pin);
const text = await decryptText(
    wallet.recovery.encryptedPhrase,
    pin
);

return text.split(" ");
}

export async function verifyRecoveryPhrase(env, uid, phraseInput = []) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const phrase = normalizePhrase(phraseInput);

    if (phrase.length !== RECOVERY_WORD_COUNT) {
        throw new Error("Invalid recovery phrase.");
    }

    const material = await deriveWalletMaterialFromPhrase(phrase);

    if (wallet.address !== material.address || wallet.publicKey !== material.publicKey) {
        throw new Error("Recovery phrase verification failed.");
    }

    const updated = {
        ...wallet,
        recovery: {
            ...wallet.recovery,
            verified: true,
            masked: true,
            phraseHash: await sha256Hex(`LEXA-PHRASE-HASH-V2:${phrase.join("|")}`)
        },
        security: {
            ...wallet.security,
            recoveryVerified: true
        },
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);
    return updated;
}

/* ==========================================================
   WALLET ADDRESS / KEYPAIR
========================================================== */

async function generateWalletAddress(env, publicKey) {
    const address = await deriveAddressFromPublicKey(publicKey);
    const exists = await getDocument(env, `${WALLET_ADDRESS_PREFIX}${address}`);

    if (!exists) {
        return address;
    }

    const salt = await sha256Hex(`LEXA-ADDRESS-SALT:${publicKey}:${getNow()}`);
    const saltedAddress = `${WALLET_PREFIX}${salt.toUpperCase().slice(0, 40)}`;
    const saltedExists = await getDocument(env, `${WALLET_ADDRESS_PREFIX}${saltedAddress}`);

    if (!saltedExists) {
        return saltedAddress;
    }

    let counter = 0;
    while (true) {
        counter += 1;
        const hash = await sha256Hex(`LEXA-ADDRESS-SALT:${publicKey}:${counter}:${salt}`);
        const candidate = `${WALLET_PREFIX}${hash.toUpperCase().slice(0, 40)}`;
        const candidateExists = await getDocument(env, `${WALLET_ADDRESS_PREFIX}${candidate}`);
        if (!candidateExists) {
            return candidate;
        }
    }
}

async function generateKeyPairFromPhrase(phrase) {
    const material = await deriveWalletMaterialFromPhrase(phrase);
    return {
        seed: material.seed,
        privateKey: material.privateKey,
        publicKey: material.publicKey,
        address: material.address
    };
}

async function encryptPrivateKey(privateKey, pin) {
    return encryptText(privateKey, pin);
}

async function decryptPrivateKey(encryptedPrivateKey, pin) {
    return decryptText(encryptedPrivateKey, pin);
}

async function buildWalletBackupQR(wallet, pin) {
    const payload = {
        type: "LEXA",
        uid: wallet.uid,
        address: wallet.address,
        publicKey: wallet.publicKey,
        createdAt: wallet.createdAt,
        recovery: {
            wordCount: wallet.recovery?.wordCount || RECOVERY_WORD_COUNT,
            algorithm: wallet.walletMeta?.algorithm || "LEXA-RECOVERY-V2",
            phraseHash: wallet.recovery?.phraseHash || ""
        }
    };

    return encryptText(JSON.stringify(payload), pin);
}

async function parseWalletBackupQR(encryptedQR, pin) {
    const plain = await decryptText(encryptedQR, pin);
    const payload = JSON.parse(plain || "{}");

    if (!payload || payload.type !== "LEXA") {
        throw new Error("Invalid backup QR.");
    }

    return payload;
}

/* ==========================================================
   WALLET CREATE / GET / UPDATE
========================================================== */

export async function walletExists(env, uid) {
    const wallet = await getWalletDoc(env, uid);
    return Boolean(wallet);
}

export async function createWallet(env, uid, recoveryPhrase, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return withLock(env, `create:${uid}`, async () => {
        const exists = await getWalletDoc(env, uid).catch(() => null);
        if (exists) {
            return normalizeWallet(exists);
        }

        const normalizedPin = ensureValidPin(pin);
        const normalizedPhrase = normalizePhrase(recoveryPhrase);

        if (normalizedPhrase.length !== RECOVERY_WORD_COUNT) {
            throw new Error("Invalid recovery phrase.");
        }

        const material = await deriveWalletMaterialFromPhrase(normalizedPhrase);
        const now = getNow();

        const wallet = {
            ...defaultWalletData(),
            uid,
            address: material.address,
            publicKey: material.publicKey,
            encryptedPrivateKey: await encryptPrivateKey(material.privateKey, normalizedPin),
            pinHash: await sha256Hex(`LEXA-PIN-V2:${normalizedPin}`),
            pinCreatedAt: now,
            status: "active",
            chain: WALLET_CHAIN,
            lexa: 0,
            usdt: 0,
            security: {
                pinEnabled: true,
                biometricEnabled: false,
                recoveryVerified: true
            },
            recovery: {
    encryptedPhrase: await encryptText(
        normalizedPhrase.join(" "),
        normalizedPin
    ),
    verified: true,
    masked: true,
    wordCount: RECOVERY_WORD_COUNT,
    phraseHash: await sha256Hex(
        `LEXA-PHRASE-HASH-V2:${normalizedPhrase.join("|")}`
    )
},
            backup: {
                qrEnabled: true,
                qrEncrypted: "",
                qrCreatedAt: now
                
            },
            walletMeta: {
                
                algorithm: "LEXA-RECOVERY-V2"
            },
            createdAt: now,
            updatedAt: now
        };

        wallet.backup.qrEncrypted = await buildWalletBackupQR(wallet, normalizedPin);

        await setWalletDoc(env, uid, wallet);
        await setDocument(env, `${WALLET_ADDRESS_PREFIX}${wallet.address}`, {
            uid,
            createdAt: now
        });

        await appendHistory(env, uid, {
            type: "wallet",
            title: "Wallet Created",
            description: "New LEXA Wallet created successfully",
            amount: 0,
            token: "LEXA",
            status: "success",
            createdAt: now
        });

        return wallet;
    });
}

export async function getWallet(env, uid) {
    const wallet = await getWalletDoc(env, uid);
    return wallet ? normalizeWallet(wallet) : null;
}

export async function updateWallet(env, uid, data = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const current = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const updated = {
        ...current,
        ...data,
        uid,
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);
    return updated;
}

/* ==========================================================
   BALANCE
========================================================== */

export async function creditWallet(env, uid, amount, type = "wallet", title = "Credit", description = "Wallet credited") {
    const value = Number(amount || 0);
    if (value <= 0) {
        throw new Error("Invalid amount.");
    }

    const current = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const updated = {
        ...current,
        lexa: Number(current.lexa || 0) + value,
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);

    await appendHistory(env, uid, {
        type,
        title,
        description,
        amount: value,
        token: "LEXA",
        status: "success",
        createdAt: getNow()
    });

    return updated;
}

export async function debitWallet(env, uid, amount, type = "wallet", title = "Debit", description = "Wallet debited") {
    const value = Number(amount || 0);
    if (value <= 0) {
        throw new Error("Invalid amount.");
    }

    const current = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const balance = Number(current.lexa || 0);

    if (balance < value) {
        throw new Error("Insufficient balance.");
    }

    const updated = {
        ...current,
        lexa: balance - value,
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);

    await appendHistory(env, uid, {
        type,
        title,
        description,
        amount: -value,
        token: "LEXA",
        status: "success",
        createdAt: getNow()
    });

    return updated;
}
export async function getWalletPrivateKey(env, uid, pin){
    const wallet = await getWallet(env, uid);

    await verifyWalletPin(env, uid, pin);

    return decryptPrivateKey(
        wallet.encryptedPrivateKey,
        pin
    );
}

/* ==========================================================
   SECURITY
========================================================== */

export async function setWalletPin(env, uid, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const normalizedPin = ensureValidPin(pin);
    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const updated = {
        ...wallet,
        pinHash: await sha256Hex(`LEXA-PIN-V2:${normalizedPin}`),
        pinCreatedAt: getNow(),
        security: {
            ...wallet.security,
            pinEnabled: true
        },
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);
    return updated;
}

export async function verifyWalletPin(env, uid, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const normalizedPin = ensureValidPin(pin);
    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const expected = await sha256Hex(`LEXA-PIN-V2:${normalizedPin}`);

    if (!wallet.pinHash || wallet.pinHash !== expected) {
        throw new Error("Invalid PIN.");
    }

    return true;
}

export async function enableBiometricWallet(env, uid, enabled = true) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const updated = {
        ...wallet,
        security: {
            ...wallet.security,
            biometricEnabled: Boolean(enabled)
        },
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);
    return updated;
}

/* ==========================================================
   BACKUP QR
========================================================== */

export async function createWalletBackupQR(env, uid, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return withLock(env, `backup:${uid}`, async () => {
        const normalizedPin = ensureValidPin(pin);
        const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});

        if (!wallet.uid) {
            throw new Error("Wallet not found.");
        }

        const qrEncrypted = await buildWalletBackupQR(wallet, normalizedPin);
        const updated = {
            ...wallet,
            backup: {
                ...wallet.backup,
                qrEnabled: true,
                qrEncrypted,
                qrCreatedAt: getNow()
                
            },
            updatedAt: getNow()
        };

        await setWalletDoc(env, uid, updated);
        return updated;
    });
}

export async function restoreWalletFromBackupQR(env, uid, encryptedQR, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return withLock(env, `restore:${uid}`, async () => {
        const normalizedPin = ensureValidPin(pin);
        const payload = await parseWalletBackupQR(encryptedQR, normalizedPin);

        const existing = await getWalletDoc(env, uid).catch(() => null);
        if (existing) {
            return normalizeWallet(existing);
        }

        const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
        const now = getNow();

        const restored = {
            ...defaultWalletData(),
            uid,
            address: String(payload.address || "").trim(),
            publicKey: String(payload.publicKey || "").trim(),
            encryptedPrivateKey: wallet.encryptedPrivateKey || "",
            pinHash: await sha256Hex(`LEXA-PIN-V2:${normalizedPin}`),
            pinCreatedAt: now,
            status: "active",
            chain: WALLET_CHAIN,
            lexa: Number(wallet.lexa || 0),
            usdt: Number(wallet.usdt || 0),
            security: {
                pinEnabled: true,
                biometricEnabled: false,
                recoveryVerified: true
            },
            recovery: {
                encryptedPhrase: "",
    verified: true,
    masked: true,
                wordCount: RECOVERY_WORD_COUNT,
                phraseHash: String(payload.recovery?.phraseHash || "")
            },
            backup: {
                qrEnabled: true,
                qrEncrypted: String(encryptedQR || ""),
                qrCreatedAt: now
                
            },
            walletMeta: {
                
                algorithm: "LEXA-RECOVERY-V2"
            },
            createdAt: payload.createdAt || now,
            updatedAt: now
        };

        if (!restored.address || !restored.publicKey) {
            throw new Error("Invalid backup QR data.");
        }

        await setWalletDoc(env, uid, restored);
        await setDocument(env, `${WALLET_ADDRESS_PREFIX}${restored.address}`, {
            uid,
            createdAt: now
        });

        return restored;
    });
}

/* ==========================================================
   IMPORT / EXPORT
========================================================== */

export async function exportWallet(env, uid) {
    const wallet = await getWallet(env, uid);
    if (!wallet) {
        throw new Error("Wallet not found.");
    }

    return {
        uid: wallet.uid,
        address: wallet.address,
        publicKey: wallet.publicKey,
        status: wallet.status,
        chain: wallet.chain,
        lexa: wallet.lexa,
        usdt: wallet.usdt,
        security: wallet.security,
        recovery: {
            verified: wallet.recovery?.verified || false,
            masked: true,
            wordCount: wallet.recovery?.wordCount || RECOVERY_WORD_COUNT
        },
        backup: {
            qrEnabled: wallet.backup?.qrEnabled || false,
            qrEncrypted: wallet.backup?.qrEncrypted || "",
            qrCreatedAt: wallet.backup?.qrCreatedAt || null
            
        },
        walletMeta: wallet.walletMeta || {
            algorithm: "LEXA-RECOVERY-V2"
        },
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
    };
}

export async function importWallet(env, uid, data = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return withLock(env, `import:${uid}`, async () => {
        const now = getNow();
        const exists = await getWalletDoc(env, uid).catch(() => null);
        if (exists) {
            return normalizeWallet(exists);
        }

        const recoveryPhrase = normalizePhrase(data.recovery?.phrase || data.recoveryPhrase || []);
        const backupEncrypted = String(data.backup?.qrEncrypted || data.qr || data.backupQR || "").trim();
        const pin = String(data.pin || "").trim();

        if (recoveryPhrase.length === RECOVERY_WORD_COUNT) {
            const normalizedPin = ensureValidPin(pin);
            const material = await deriveWalletMaterialFromPhrase(recoveryPhrase);

            const wallet = {
                ...defaultWalletData(),
                uid,
                address: material.address,
                publicKey: material.publicKey,
                encryptedPrivateKey: await encryptPrivateKey(material.privateKey, normalizedPin),
                pinHash: await sha256Hex(`LEXA-PIN-V2:${normalizedPin}`),
                pinCreatedAt: now,
                status: "active",
                chain: WALLET_CHAIN,
                lexa: Number(data.lexa || 0),
                usdt: Number(data.usdt || 0),
                security: {
                    pinEnabled: true,
                    biometricEnabled: Boolean(data.security?.biometricEnabled),
                    recoveryVerified: true
                },
                recovery: {
    encryptedPhrase: await encryptText(
    recoveryPhrase.join(" "),
    normalizedPin
),
    verified: true,
    masked: true,
    wordCount: RECOVERY_WORD_COUNT,
    phraseHash: await sha256Hex(
    `LEXA-PHRASE-HASH-V2:${recoveryPhrase.join("|")}`
)
},
                backup: {
                    qrEnabled: Boolean(backupEncrypted),
                    qrEncrypted: backupEncrypted,
                    qrCreatedAt: now                    
                },
                walletMeta: {
                    algorithm: "LEXA-RECOVERY-V2"
                },
                createdAt: data.createdAt || now,
                updatedAt: now
            };

            if (backupEncrypted) {
                wallet.backup.qrEncrypted = backupEncrypted;
            } else {
                wallet.backup.qrEncrypted = await buildWalletBackupQR(wallet, normalizedPin);
            }

            await setWalletDoc(env, uid, wallet);
            await setDocument(env, `${WALLET_ADDRESS_PREFIX}${wallet.address}`, {
                uid,
                createdAt: now
            });

            return wallet;
        }

        const address = String(data.address || "").trim();
        const publicKey = String(data.publicKey || "").trim();
        const encryptedPrivateKey = String(data.encryptedPrivateKey || "").trim();

        if (!address || !publicKey || !encryptedPrivateKey) {
            throw new Error("Incomplete wallet import data.");
        }

        const wallet = {
            ...defaultWalletData(),
            uid,
            address,
            publicKey,
            encryptedPrivateKey,
            status: "active",
            chain: WALLET_CHAIN,
            lexa: Number(data.lexa || 0),
            usdt: Number(data.usdt || 0),
            pinHash: String(data.pinHash || ""),
            pinCreatedAt: data.pinCreatedAt || null,
            security: {
                ...defaultWalletData().security,
                ...(data.security || {})
            },
            recovery: {
                ...defaultWalletData().recovery,
                ...(data.recovery || {}),
                masked: true
            },
            backup: {
                ...defaultWalletData().backup,
                ...(data.backup || {})
            },
            walletMeta: {
                algorithm: "LEXA-RECOVERY-V2"
            },
            createdAt: data.createdAt || now,
            updatedAt: now
        };

        await setWalletDoc(env, uid, wallet);
        return wallet;
    });
}

/* ==========================================================
   DELETE
========================================================== */

export async function deleteWallet(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return deleteWalletDoc(env, uid);
}

/* ==========================================================
   META
========================================================== */

export function getWalletAddressPrefix() {
    return WALLET_PREFIX;
}

export function getWalletChains() {
    return {
        lexa: WALLET_CHAIN,
        usdt: USDT_CHAIN
    };
}

/* ==========================================================
   OPTIONAL UTILITIES
========================================================== */

export async function revealRecoveryPhrase(env, uid) {
    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const updated = {
        ...wallet,
        recovery: {
            ...wallet.recovery,
            masked: false
        },
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);
    return updated;
}

export async function maskRecoveryPhrase(env, uid) {
    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const updated = {
        ...wallet,
        recovery: {
            ...wallet.recovery,
            masked: true
        },
        updatedAt: getNow()
    };

    await setWalletDoc(env, uid, updated);
    return updated;
}