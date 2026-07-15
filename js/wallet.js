/* ==========================================================
   ALEXA
   File : wallet.js
   Description : Wallet Data Layer
========================================================== */

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    query,
    collection,
    where,
    getDocs,
    serverTimestamp,
    increment
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { db } from "./firebase.js";

/* ==========================================================
   COLLECTION
========================================================== */

const WALLET_COLLECTION = "wallets";

/* ==========================================================
   WALLET ADDRESS
========================================================== */

const WALLET_PREFIX = "LX7";
const WALLET_RANDOM_LENGTH = 20;
const WALLET_MAX_ATTEMPTS = 50;
const WALLET_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate wallet address like:
 * LX7KQ8AMW52DTX9CFNPR...
 */
export function generateWalletAddress() {
    let result = WALLET_PREFIX;

    for (let i = 0; i < WALLET_RANDOM_LENGTH; i++) {
        const index = Math.floor(Math.random() * WALLET_CHARS.length);
        result += WALLET_CHARS[index];
    }

    return result;
}

/**
 * Generate unique wallet address and ensure it does not exist.
 */
export async function generateUniqueWalletAddress() {
    for (let i = 0; i < WALLET_MAX_ATTEMPTS; i++) {
        const address = generateWalletAddress();
        const exists = await walletAddressExists(address);
        if (!exists) return address;
    }

    throw new Error("Failed to generate a unique wallet address.");
}

/* ==========================================================
   REF
========================================================== */

function walletRef(firebaseUid) {
    if (!firebaseUid) {
        throw new Error("firebaseUid is required.");
    }
    return doc(db, WALLET_COLLECTION, firebaseUid);
}

/* ==========================================================
   SEARCH
========================================================== */

async function queryWalletByField(field, value) {
    const q = query(
        collection(db, WALLET_COLLECTION),
        where(field, "==", value)
    );

    return getDocs(q);
}

export async function walletAddressExists(address) {
    if (!address) return false;

    const snap = await queryWalletByField("address", address);
    return !snap.empty;
}

/* ==========================================================
   READ
========================================================== */

export async function getWallet(firebaseUid) {
    const ref = walletRef(firebaseUid);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    return {
        firebaseUid: snap.id,
        ...snap.data()
    };
}

export async function getWalletByAddress(address) {
    if (!address) throw new Error("address is required.");

    const snap = await queryWalletByField("address", address);

    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    return {
        firebaseUid: docSnap.id,
        ...docSnap.data()
    };
}

export async function walletExists(firebaseUid) {
    const ref = walletRef(firebaseUid);
    const snap = await getDoc(ref);
    return snap.exists();
}

/* ==========================================================
   CREATE
========================================================== */

/**
 * Create wallet only when user presses "Create Wallet".
 */
export async function createWallet(firebaseUid, extraData = {}) {
    if (!firebaseUid) {
        throw new Error("firebaseUid is required.");
    }

    const ref = walletRef(firebaseUid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        return {
            firebaseUid: snap.id,
            ...snap.data(),
            existed: true
        };
    }

    const address = await generateUniqueWalletAddress();

    const payload = {
        firebaseUid,
        address,
        chain: extraData.chain ?? "bsc",
        balance: extraData.balance ?? 0,
        pending: extraData.pending ?? 0,
        totalReceived: extraData.totalReceived ?? 0,
        totalSent: extraData.totalSent ?? 0,
        totalMigration: extraData.totalMigration ?? 0,
        nonce: extraData.nonce ?? 0,
        status: extraData.status ?? "active",
        label: extraData.label ?? "ALEXA Wallet",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    await setDoc(ref, payload);

    return {
        firebaseUid,
        ...payload,
        existed: false
    };
}

/* ==========================================================
   UPDATE
========================================================== */

export async function updateWallet(firebaseUid, data = {}) {
    if (!firebaseUid) {
        throw new Error("firebaseUid is required.");
    }

    if (!data || typeof data !== "object") {
        throw new Error("data object is required.");
    }

    const ref = walletRef(firebaseUid);

    await updateDoc(ref, {
        ...data,
        updatedAt: serverTimestamp()
    });

    return true;
}

export async function updateWalletStatus(firebaseUid, status = "active") {
    return updateWallet(firebaseUid, { status });
}

export async function updateWalletLabel(firebaseUid, label) {
    if (!label) throw new Error("label is required.");
    return updateWallet(firebaseUid, { label });
}

/* ==========================================================
   BALANCE
========================================================== */

export async function addWalletBalance(firebaseUid, amount = 0) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount must be greater than 0.");
    }

    const ref = walletRef(firebaseUid);

    await updateDoc(ref, {
        balance: increment(amount),
        totalReceived: increment(amount),
        updatedAt: serverTimestamp()
    });

    return true;
}

export async function subtractWalletBalance(firebaseUid, amount = 0) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount must be greater than 0.");
    }

    const ref = walletRef(firebaseUid);

    await updateDoc(ref, {
        balance: increment(-amount),
        totalSent: increment(amount),
        updatedAt: serverTimestamp()
    });

    return true;
}

export async function addPendingWalletAmount(firebaseUid, amount = 0) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount must be greater than 0.");
    }

    const ref = walletRef(firebaseUid);

    await updateDoc(ref, {
        pending: increment(amount),
        updatedAt: serverTimestamp()
    });

    return true;
}

/**
 * Move pending amount to balance for migration / unlock.
 */
export async function migratePendingToBalance(firebaseUid, amount = 0) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount must be greater than 0.");
    }

    const ref = walletRef(firebaseUid);

    await updateDoc(ref, {
        pending: increment(-amount),
        balance: increment(amount),
        totalMigration: increment(amount),
        updatedAt: serverTimestamp()
    });

    return true;
}

/* ==========================================================
   SECURITY
========================================================== */

export async function incrementWalletNonce(firebaseUid) {
    const ref = walletRef(firebaseUid);

    await updateDoc(ref, {
        nonce: increment(1),
        updatedAt: serverTimestamp()
    });

    return true;
}

/* ==========================================================
   UTIL
========================================================== */

export function buildWalletPayload(extraData = {}) {
    return {
        chain: extraData.chain ?? "bsc",
        balance: extraData.balance ?? 0,
        pending: extraData.pending ?? 0,
        totalReceived: extraData.totalReceived ?? 0,
        totalSent: extraData.totalSent ?? 0,
        totalMigration: extraData.totalMigration ?? 0,
        nonce: extraData.nonce ?? 0,
        status: extraData.status ?? "active",
        label: extraData.label ?? "ALEXA Wallet"
    };
}