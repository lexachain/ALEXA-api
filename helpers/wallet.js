/* ==========================================================
   ALEXA API
   File : helpers/wallet.js
   Description : Wallet Helpers
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import {
    getDocument,
    setDocument,
    deleteDocument
} from "./firestore.js";
import { getNow } from "./request.js";
import { sha256 } from "./security.js";
import { appendHistory } from "./history.js";

/* ==========================================================
   CONFIG
========================================================== */

const WALLET_PREFIX = "LX7";
const WALLET_CHAIN = "LEXA Chain";
const USDT_CHAIN = "BNB Smart Chain";

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
            biometricEnabled: false,
            recoveryVerified: false
        },
        recovery: {
            phrase: [],
            verified: false,
            masked: false
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

/* ==========================================================
   UTILS
========================================================== */

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function sanitizeWord(word) {
    return String(word || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "");
}

function generateRecoveryPhrase(wordCount = 12) {
    const WORD_BANK = [
        "apple", "river", "moon", "cloud", "stone", "forest", "sunset", "gold",
        "ember", "piano", "sugar", "ocean", "future", "planet", "quiet", "mirror",
        "silver", "storm", "bird", "village", "memory", "rocket", "shadow", "violet",
        "honey", "galaxy", "crystal", "light", "anchor", "bridge", "purple", "signal",
        "random", "whisper", "bright", "winter", "summer", "spring", "autumn", "secret"
    ];

    const phrase = [];
    const random = crypto.getRandomValues(new Uint8Array(wordCount));

    for (let i = 0; i < wordCount; i++) {
        phrase.push(WORD_BANK[random[i] % WORD_BANK.length]);
    }

    return phrase;
}

export function createRecoveryPhrase() {
    return generateRecoveryPhrase(12);
}

async function generateWalletAddress(env) {
    while (true) {
        const bytes = crypto.getRandomValues(new Uint8Array(12));

        const hex = Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
            .slice(0, 23);

        const address = WALLET_PREFIX + hex;
        const exists = await getDocument(env, `walletAddress/${address}`);

        if (!exists) {
            return address;
        }
    }
}

async function encryptPrivateKey(privateKey, pin) {
    const raw = `${privateKey}|${pin}`;
    return sha256(raw);
}

async function generateKeyPair() {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const privateKey = bytesToHex(seed);
    const publicKey = await sha256(`pub:${privateKey}`);
    return { privateKey, publicKey };
}

function hashPin(pin) {
    return sha256(`pin:${String(pin || "")}`);
}

function validatePin(pin) {
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

function validateRecoveryPhrase(recoveryPhrase) {
    if (!Array.isArray(recoveryPhrase) || recoveryPhrase.length !== 12) {
        throw new Error("Invalid recovery phrase.");
    }

    const cleaned = recoveryPhrase.map((word) => sanitizeWord(word));
    if (cleaned.some((word) => !word)) {
        throw new Error("Invalid recovery phrase.");
    }

    return cleaned;
}

/* ==========================================================
   CREATE
========================================================== */

export async function createWallet(env, uid, recoveryPhrase, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const exists = await getWalletDoc(env, uid).catch(() => null);
    if (exists) {
        return normalizeWallet(exists);
    }

    const normalizedPin = validatePin(pin);
    const normalizedPhrase = validateRecoveryPhrase(recoveryPhrase);

    const now = getNow();
    const { privateKey, publicKey } = await generateKeyPair();
    const address = await generateWalletAddress(env);

    const wallet = {
        ...defaultWalletData(),
        uid,
        address,
        publicKey,
        encryptedPrivateKey: await encryptPrivateKey(privateKey, normalizedPin),
        pinHash: await hashPin(normalizedPin),
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
            phrase: normalizedPhrase,
            verified: true,
            masked: true
        },
        createdAt: now,
        updatedAt: now
    };

    await setWalletDoc(env, uid, wallet);
    await setDocument(env, `walletAddress/${address}`, {
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
}

export async function walletExists(env, uid) {
    const wallet = await getWalletDoc(env, uid);
    return Boolean(wallet);
}

/* ==========================================================
   READ
========================================================== */

export async function getWallet(env, uid) {
    const wallet = await getWalletDoc(env, uid);
    return wallet ? normalizeWallet(wallet) : null;
}

/* ==========================================================
   UPDATE
========================================================== */

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

/* ==========================================================
   SECURITY
========================================================== */

export async function setWalletPin(env, uid, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const normalizedPin = validatePin(pin);
    const pinHash = await hashPin(normalizedPin);
    const now = getNow();

    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const updated = {
        ...wallet,
        pinHash,
        pinCreatedAt: now,
        security: {
            ...wallet.security,
            pinEnabled: true
        },
        updatedAt: now
    };

    await setWalletDoc(env, uid, updated);
    return updated;
}

export async function verifyWalletPin(env, uid, pin) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const normalizedPin = validatePin(pin);
    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const expected = await hashPin(normalizedPin);

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
   RECOVERY
========================================================== */

export async function getRecoveryPhrase(env, uid) {
    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    return wallet.recovery?.phrase || [];
}

export async function verifyRecoveryPhrase(env, uid, phraseInput = []) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const wallet = normalizeWallet((await getWalletDoc(env, uid)) || {});
    const stored = wallet.recovery?.phrase || [];
    const input = Array.isArray(phraseInput)
        ? phraseInput.map(sanitizeWord)
        : [];

    const sameLength = stored.length === input.length;
    const sameWords = sameLength && stored.every((word, index) => sanitizeWord(word) === input[index]);

    if (!sameWords) {
        throw new Error("Recovery phrase verification failed.");
    }

    const updated = {
        ...wallet,
        recovery: {
            ...wallet.recovery,
            verified: true,
            masked: true
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

/* ==========================================================
   EXPORT / IMPORT
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
            masked: true
        },
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
    };
}

export async function importWallet(env, uid, data = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const address = String(data.address || "").trim();
    const publicKey = String(data.publicKey || "").trim();
    const encryptedPrivateKey = String(data.encryptedPrivateKey || "").trim();

    if (!address || !publicKey || !encryptedPrivateKey) {
        throw new Error("Incomplete wallet import data.");
    }

    const now = getNow();
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
            ...(data.recovery || {})
        },
        createdAt: data.createdAt || now,
        updatedAt: now
    };

    await setWalletDoc(env, uid, wallet);
    return wallet;
}
export async function deleteWallet(env, uid) {

    return deleteDocument(env, `wallets/${uid}`);

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
