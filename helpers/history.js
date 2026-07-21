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
   HISTORY
========================================================== */

export async function appendHistory(env, uid, item = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const id = uuid();

    const data = {
        uid,
        ...item,
        createdAt: item.createdAt || getNow()
    };

    await setDocument(env, `history/${uid}_${id}`, data);

    return {
        id,
        ...data
    };
}

export async function getHistoryByUid(env, uid, limit = 50) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const history = await runQuery(env, {
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
        limit
    });

    return history;
}

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