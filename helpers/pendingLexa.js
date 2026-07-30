/* ==========================================================
   ALEXA API
   File : helpers/pendingLexa.js
   Description : Pending LEXA Manager
========================================================== */

import {
    getDocument,
    setDocument
} from "./firestore.js";

import { getNow } from "./request.js";

/* ==========================================================
   CONSTANTS
========================================================== */

const COLLECTION = "pending";

/* ==========================================================
   PATH
========================================================== */

function getPath(uid) {
    return `${COLLECTION}/${uid}`;
}

/* ==========================================================
   NORMALIZE
========================================================== */

function normalizePendingLexa(doc = {}, uid = "") {
    const now = getNow();

    return {
        uid: String(uid || doc.uid || ""),
        pendingLexa: Number(doc.pendingLexa || 0),
        totalLexa: Number(doc.totalLexa || 0),
        createdAt: Number(doc.createdAt || now),
        updatedAt: Number(doc.updatedAt || now)
    };
}

/* ==========================================================
   INTERNAL
========================================================== */

async function readPendingDoc(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return getDocument(env, getPath(uid));
}

async function writePendingDoc(env, uid, data) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const normalized = normalizePendingLexa(data, uid);
    normalized.updatedAt = getNow();

    await setDocument(env, getPath(uid), normalized);

    return normalized;
}

/* ==========================================================
   GET
========================================================== */

/**
 * Get or create pending LEXA document.
 * @param {object} env Cloudflare Worker env
 * @param {string} uid User id
 * @returns {Promise<object>}
 */
export async function getPendingLexa(env, uid) {
    const doc = await readPendingDoc(env, uid);

    if (!doc) {
        const data = normalizePendingLexa({}, uid);
        await setDocument(env, getPath(uid), data);
        return data;
    }

    return normalizePendingLexa(doc, uid);
}

/* ==========================================================
   SAVE
========================================================== */

/**
 * Save pending LEXA document.
 * @param {object} env Cloudflare Worker env
 * @param {string} uid User id
 * @param {object} data Pending data
 * @returns {Promise<object>}
 */
export async function savePendingLexa(env, uid, data = {}) {
    return writePendingDoc(env, uid, data);
}

/* ==========================================================
   ADD
========================================================== */

/**
 * Add amount to pending LEXA.
 * @param {object} env Cloudflare Worker env
 * @param {string} uid User id
 * @param {number} amount Amount to add
 * @returns {Promise<object>}
 */
export async function addPendingLexa(env, uid, amount = 0) {
    const pending = await getPendingLexa(env, uid);
    const value = Number(amount || 0);

    pending.pendingLexa = Number(pending.pendingLexa || 0) + value;
    pending.totalLexa = Number(pending.totalLexa || 0) + value;

    return savePendingLexa(env, uid, pending);
}

/* ==========================================================
   SUBTRACT
========================================================== */

/**
 * Subtract amount from pending LEXA.
 * @param {object} env Cloudflare Worker env
 * @param {string} uid User id
 * @param {number} amount Amount to subtract
 * @returns {Promise<object>}
 */
export async function subtractPendingLexa(env, uid, amount = 0) {
    const pending = await getPendingLexa(env, uid);
    const value = Number(amount || 0);

    pending.pendingLexa = Math.max(
        0,
        Number(pending.pendingLexa || 0) - value
    );

    return savePendingLexa(env, uid, pending);
}

/* ==========================================================
   RESET
========================================================== */

/**
 * Reset pending LEXA to zero.
 * @param {object} env Cloudflare Worker env
 * @param {string} uid User id
 * @returns {Promise<object>}
 */
export async function resetPendingLexa(env, uid) {
    const pending = await getPendingLexa(env, uid);
    pending.pendingLexa = 0;

    return savePendingLexa(env, uid, pending);
}

/* ==========================================================
   MIGRATE
========================================================== */

/**
 * Move all pending LEXA out and reset balance to zero.
 * @param {object} env Cloudflare Worker env
 * @param {string} uid User id
 * @returns {Promise<number>} migrated amount
 */
export async function migratePendingLexa(env, uid) {
    const pending = await getPendingLexa(env, uid);
    const amount = Number(pending.pendingLexa || 0);

    pending.pendingLexa = 0;

    await savePendingLexa(env, uid, pending);

    return amount;
}

export default {
    getPendingLexa,
    savePendingLexa,
    addPendingLexa,
    subtractPendingLexa,
    resetPendingLexa,
    migratePendingLexa
};