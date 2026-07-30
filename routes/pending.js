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
    jsonResponse
} from "../helpers/response.js";

/* ==========================================================
   GET PENDING
========================================================== */

export async function getPending(env, request) {

    const uid = request.user.uid;

    const pending = await getPendingLexa(
        env,
        uid
    );

    return jsonResponse({
        success: true,
        pending
    });

}

/* ==========================================================
   MIGRATE
========================================================== */

export async function migratePending(env, request) {

    const uid = request.user.uid;

    const amount = await migratePendingLexa(
        env,
        uid
    );

    return jsonResponse({
        success: true,
        amount,
        message: "Pending LEXA migrated successfully."
    });

}
