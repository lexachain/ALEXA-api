/* ==========================================================
   ALEXA API
   File : routes/referral.js
   Description : Referral Routes
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import { success, error } from "../helpers/response.js";
import { requireUser, checkRateLimit } from "../helpers/security.js";
import { readJson } from "../helpers/request.js";
import {
    getDocument
} from "../helpers/firestore.js";
import {
    getReferralDoc,
    normalizeReferral,
    getReferralLink,
    getReferralHistory,
    getReferralLeaderboard,
    applyReferral
} from "../helpers/referral.js";

/* ==========================================================
   ROUTE
========================================================== */

export async function referralRoute(env, request, path) {
    try {
        const method = request.method.toUpperCase();

        const user = await requireUser(env, request);
        const uid = user?.uid;

        if (!uid) {
            return error(env, "Unauthorized user.", 401);
        }

        switch (path) {
            case "/referral":
                if (method === "GET") {
                    return referralProfile(env, uid);
                }
                break;

            case "/referral/link":
                if (method === "GET") {
                    return referralLink(env, uid);
                }
                break;

            case "/referral/history":
                if (method === "GET") {
                    return referralHistory(env, uid);
                }
                break;

            case "/referral/leaderboard":
                if (method === "GET") {
                    return referralLeaderboard(env);
                }
                break;

            case "/referral/apply":
                if (method === "POST") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return referralApply(request, env, uid);
                }
                break;

            default:
                break;
        }

        return error(env, "Referral route not found.", 404);
    } catch (err) {
        return error(env, err?.message || "Internal Error", 500);
    }
}

/* ==========================================================
   PROFILE
========================================================== */

async function referralProfile(env, uid) {

    const referral = normalizeReferral(
        await getReferralDoc(env, uid)
    );

    const history =
        await getReferralHistory(env, uid);

    const leaderboard =
        await getReferralLeaderboard(env);

    // Ambil profil user dari Firestore
    const user =
        await getDocument(env, `users/${uid}`);

    return success(env, {
        user,
        referral,
        referralLink: getReferralLink(env, uid),
        invitedMembers: Array.isArray(history)
            ? history.length
            : 0,
        referralBonus: 0.7,
        history,
        leaderboard
    });

}
/* ==========================================================
   LINK
========================================================== */

async function referralLink(env, uid) {
    return success(env, {
        link: getReferralLink(env, uid)
    });
}

/* ==========================================================
   HISTORY
========================================================== */

async function referralHistory(env, uid) {
    const history = await getReferralHistory(env, uid);

    return success(env, {
        history
    });
}

/* ==========================================================
   LEADERBOARD
========================================================== */

async function referralLeaderboard(env) {
    const leaderboard = await getReferralLeaderboard(env);

    return success(env, {
        leaderboard
    });
}

/* ==========================================================
   APPLY
========================================================== */

async function referralApply(request, env, uid) {
    const body = await readJson(request);
    const inviterUid = String(body?.inviterUid || body?.ref || "").trim();

    if (!inviterUid) {
        return error(env, "Missing inviterUid.", 400);
    }

    const applied = await applyReferral(env, uid, inviterUid);

    return success(env, {
        applied
    });
}