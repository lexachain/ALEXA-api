/* ==========================================================
   ALEXA API
   File : routes/mining.js
   Description : Mining Routes
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import { success, error } from "../helpers/response.js";
import { readJson } from "../helpers/request.js";
import { requireUser, checkRateLimit } from "../helpers/security.js";

import {
    startMining,
    syncMining,
    claimMining,
    getMiningState
} from "../helpers/mining.js";

/* ==========================================================
   ROUTE
========================================================== */

export async function miningRoute(env, request, path) {
    try {
        const method = request.method.toUpperCase();

        const user = await requireUser(env, request);
        const uid = user?.uid;

        if (!uid) {
            return error(env, "Unauthorized user.", 401);
        }

        switch (path) {
            case "/mining":
                if (method === "POST") {
                    return miningSync(env, uid);
                }
                break;

            case "/mining/start":
                if (method === "POST") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return miningStart(env, uid);
                }
                break;

            case "/mining/claim":
                if (method === "POST") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return miningClaim(env, uid);
                }
                break;

            case "/mining/state":
                if (method === "POST") {
                    return miningState(env, uid);
                }
                break;

            default:
                break;
        }

        return error(env, "Mining route not found.", 404);
    } catch (err) {
        return error(env, err?.message || "Internal Error", 500);
    }
}

/* ==========================================================
   HANDLERS
========================================================== */

async function miningSync(env, uid) {
    const result = await syncMining(env, uid);

    return success(env, {
        ...result
    });
}

async function miningStart(env, uid) {
    const result = await startMining(env, uid);

    if (!result?.ok) {
        return error(env, result?.message || "Mining start failed.", 400, {
            status: result?.status || "idle",
            remaining: result?.remaining || 0
        });
    }

    return success(env, {
        ...result
    });
}

async function miningClaim(env, uid) {
    const result = await claimMining(env, uid);

    if (!result?.ok) {
        return error(env, result?.message || "Mining is not ready to claim.", 400, {
            status: result?.status || "idle",
            remaining: result?.remaining || 0
        });
    }

    return success(env, {
        ...result
    });
}

async function miningState(env, uid) {
    const result = await getMiningState(env, uid);

    return success(env, {
        mining: result
    });
}