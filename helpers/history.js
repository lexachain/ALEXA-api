/* ==========================================================
   ALEXA API
   File : helpers/history.js
   Description : History Helpers
========================================================== */

import {
    getDocument,
    setDocument,
    runQuery
} from "./firestore.js";

import { getNow, uuid } from "./request.js";

/* ==========================================================
   HISTORY TYPE
========================================================== */

export const HISTORY_TYPE = Object.freeze({
    MINING: "mining",
    REWARD: "reward",
    REFERRAL: "referral",
    MIGRATE: "migrate",
    SYSTEM: "system"
});

function normalizeType(type) {
    const value = String(type || "").trim().toLowerCase();
    const allowed = Object.values(HISTORY_TYPE);

    return allowed.includes(value) ? value : HISTORY_TYPE.SYSTEM;
}

function normalizeMetadata(metadata) {
    return metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata
        : {};
}

/* ==========================================================
   APPEND HISTORY
========================================================== */

export async function appendHistory(env, uid, item = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const id = uuid();
    const amount = Number(item.amount ?? item.reward ?? 0) || 0;
    const reward = Number(item.reward ?? amount ?? 0) || 0;

    const data = {
        uid,
        type: normalizeType(item.type),
        title: String(item.title || ""),
        description: String(item.description || ""),
        amount,
        reward,
        token: String(item.token || "LEXA"),
        status: String(item.status || "success"),
        metadata: normalizeMetadata(item.metadata),
        createdAt: Number(item.createdAt || getNow())
    };

    await setDocument(env, `history/${uid}_${id}`, data);

    return {
        id,
        ...data
    };
}

/* ==========================================================
   TYPE HELPERS
========================================================== */

export function addMiningHistory(env, uid, data = {}) {
    return appendHistory(env, uid, {
        ...data,
        type: HISTORY_TYPE.MINING
    });
}

export function addRewardHistory(env, uid, data = {}) {
    return appendHistory(env, uid, {
        ...data,
        type: HISTORY_TYPE.REWARD
    });
}

export function addReferralHistory(env, uid, data = {}) {
    return appendHistory(env, uid, {
        ...data,
        type: HISTORY_TYPE.REFERRAL
    });
}

export function addMigrateHistory(env, uid, data = {}) {
    return appendHistory(env, uid, {
        ...data,
        type: HISTORY_TYPE.MIGRATE
    });
}

export function addSystemHistory(env, uid, data = {}) {
    return appendHistory(env, uid, {
        ...data,
        type: HISTORY_TYPE.SYSTEM
    });
}

/* ==========================================================
   QUERY HISTORY
========================================================== */

export async function getHistory(
    env,
    {
        uid,
        type = null,
        limit = 50,
        startAfter = null
    } = {}
) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const safeLimit = Number.isFinite(Number(limit))
        ? Math.max(1, Math.min(500, Number(limit)))
        : 50;

    const rows = await runQuery(env, {
        from: [{ collectionId: "history" }],
        where: {
            fieldFilter: {
                field: { fieldPath: "uid" },
                op: "EQUAL",
                value: { stringValue: uid }
            }
        },
        orderBy: [
            {
                field: { fieldPath: "createdAt" },
                direction: "DESCENDING"
            }
        ],
        limit: safeLimit
    });

    let items = Array.isArray(rows) ? rows : [];

    const normalizedType = type ? String(type).trim().toLowerCase() : null;
    const allowedTypes = Object.values(HISTORY_TYPE);
    const typeFilter = normalizedType && allowedTypes.includes(normalizedType)
        ? normalizedType
        : null;

    if (typeFilter) {
        items = items.filter((item) => normalizeType(item.type) === typeFilter);
    }

    const cursor = Number(startAfter || 0);
    if (cursor > 0) {
        items = items.filter((item) => Number(item.createdAt || 0) < cursor);
    }

    items.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    return items.slice(0, safeLimit);
}

export async function getHistoryByUid(env, uid, limit = 50) {
    return getHistory(env, { uid, limit });
}

/* ==========================================================
   DOC HELPERS
========================================================== */

export async function getHistoryDoc(env, docId) {
    if (!docId) {
        throw new Error("Missing history docId.");
    }

    return getDocument(env, `history/${docId}`);
}

export async function setHistoryDoc(env, docId, data = {}) {
    if (!docId) {
        throw new Error("Missing history docId.");
    }

    return setDocument(env, `history/${docId}`, data);
}

export async function addHistoryItem(env, uid, item = {}) {
    return appendHistory(env, uid, item);
}