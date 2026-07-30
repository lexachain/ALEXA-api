/* ==========================================================
   ALEXA API
   File : routes/pending.js
   Description : Pending LEXA Routes
========================================================== */

import {
    getPendingLexa,
    migratePendingLexa
} from "../helpers/pendingLexa.js";

import {
    requireUser
} from "../helpers/security.js";

import {
    success,
    error
} from "../helpers/response.js";

/* ==========================================================
   GET PENDING
========================================================== */

export async function getPending(env, request) {

    const user = await requireUser(env, request);
    const uid = user?.uid;

    if (!uid) {
        return error(env, "Unauthorized user.", 401);
    }

    const pending =
        await getPendingLexa(env, uid);

    return success(env, {
        pending
    });

}
/* ==========================================================
   MIGRATE
========================================================== */

export async function migratePending(env, request) {

    const user = await requireUser(env, request);
    const uid = user?.uid;

    if (!uid) {
        return error(env, "Unauthorized user.", 401);
    }

    const amount =
        await migratePendingLexa(env, uid);

    return success(env, {
        amount,
        message:
            "Pending LEXA migrated successfully."
    });

}