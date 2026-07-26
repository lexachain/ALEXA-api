/* ==========================================================
   ALEXA API
   File : routes/calendar.js
   Description : Daily Check-in / Reward Hub Routes
========================================================== */

import { success, error } from "../helpers/response.js";
import { requireUser, checkRateLimit } from "../helpers/security.js";
import {
    getCalendarData,
    claimDailyCheckin,
    claimSocialTask,
    claimReferralTask
} from "../helpers/calendar.js";

/* ==========================================================
   ROUTE
========================================================== */

export async function calendarRoute(env, request, path) {
    try {
        const method = request.method.toUpperCase();

        const user = await requireUser(env, request);
        const uid = user?.uid;

        if (!uid) {
            return error(env, "Unauthorized user.", 401);
        }

        switch (path) {
            case "/calendar":
                if (method === "GET") {
                    return calendarSync(env, uid);
                }
                break;

            case "/checkin/claim":
                if (method === "POST") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return calendarClaim(env, uid);
                }
                break;

case "/social/claim":
    if (method === "POST") {
        return socialClaim(env, request, uid);
    }
    break;

case "/referral/claim":
    if (method === "POST") {
        return referralClaim(env, request, uid);
    }
    break;

            default:
                break;
        }

        return error(env, "Calendar route not found.", 404);
    } catch (err) {
        return error(env, err?.message || "Internal Error", 500);
    }
}

/* ==========================================================
   HANDLERS
========================================================== */

async function calendarSync(env, uid) {
    const data = await getCalendarData(env, uid);

    return success(env, data);
}
async function socialClaim(env, request, uid) {
    const { taskId } = await request.json();

    const result =
        await claimSocialTask(env, uid, taskId);

    if (!result.ok) {
        return error(env, result.message, 400);
    }

    return success(env, result);
}
async function referralClaim(env, request, uid) {
    const { taskId } = await request.json();

    const result =
        await claimReferralTask(env, uid, taskId);

    if (!result.ok) {
        return error(env, result.message, 400);
    }

    return success(env, result);
}


async function calendarClaim(env, uid) {
    const result = await claimDailyCheckin(env, uid);

    if (!result?.ok) {
        return error(
            env,
            result?.message || "Daily check-in is not ready yet.",
            400,
            {
                remainingSeconds: result?.remainingSeconds ?? 0
            }
        );
    }

    return success(env, {
        message: result.message,
        daily: result.daily
    });
}