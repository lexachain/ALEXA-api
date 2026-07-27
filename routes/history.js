/* ==========================================================
   ALEXA API
   File : routes/history.js
   Description : Activity / History Routes
========================================================== */

import { success, error } from "../helpers/response.js";
import { requireUser } from "../helpers/security.js";
import { getHistory, HISTORY_TYPE } from "../helpers/history.js";
import { getMiningDoc, normalizeMining } from "../helpers/mining.js";

/* ==========================================================
   CONFIG
========================================================== */

const PAGE_LIMIT_DEFAULT = 20;
const PAGE_LIMIT_MAX = 100;
const COUNT_BATCH_LIMIT = 500;

/* ==========================================================
   ROUTE
========================================================== */

export async function historyRoute(env, request, path) {
    try {
        const method = request.method.toUpperCase();

        if (path !== "/activity") {
            return error(env, "History route not found.", 404);
        }

        if (method !== "GET") {
            return error(env, "Method not allowed.", 405);
        }

        const user = await requireUser(env, request);
        const uid = user?.uid;

        if (!uid) {
            return error(env, "Unauthorized user.", 401);
        }

        return await handleActivityList(env, request, uid);
    } catch (err) {
        return error(env, err?.message || "Internal Error", 500);
    }
}

/* ==========================================================
   HANDLER
========================================================== */

async function handleActivityList(env, request, uid) {
    const url = new URL(request.url);

    const type = normalizeActivityType(url.searchParams.get("type"));
    const limit = parsePositiveInt(
        url.searchParams.get("limit"),
        PAGE_LIMIT_DEFAULT,
        1,
        PAGE_LIMIT_MAX
    );
    const cursor = parsePositiveInt(
        url.searchParams.get("cursor"),
        null,
        1,
        Number.MAX_SAFE_INTEGER
    );

    const [pendingLexa, totalActivity, pageItems] = await Promise.all([
        getPendingLexa(env, uid),
        countTotalActivity(env, uid),
        getActivityPage(env, uid, type, limit, cursor)
    ]);

    return success(env, {
        success: true,
        summary: {
            pendingLexa,
            totalActivity,
            hasMore: pageItems.hasMore,
            nextCursor: pageItems.nextCursor
        },
        items: pageItems.items,
        hasMore: pageItems.hasMore,
        nextCursor: pageItems.nextCursor
    });
}

/* ==========================================================
   PAGE DATA
========================================================== */

async function getActivityPage(env, uid, type, limit, cursor) {
    const fetchLimit = Math.min(PAGE_LIMIT_MAX, Math.max(1, Number(limit) || PAGE_LIMIT_DEFAULT)) + 1;

    const rows = await getHistory(env, {
        uid,
        type,
        limit: fetchLimit,
        startAfter: cursor || null
    });

    const hasMore = rows.length > (fetchLimit - 1);
    const items = hasMore ? rows.slice(0, fetchLimit - 1) : rows;
    const nextCursor = hasMore && items.length
        ? Number(items[items.length - 1].createdAt || 0)
        : null;

    return {
        items,
        hasMore,
        nextCursor
    };
}

async function countTotalActivity(env, uid) {
    let cursor = null;
    let total = 0;

    while (true) {
        const batch = await getHistory(env, {
            uid,
            limit: COUNT_BATCH_LIMIT,
            startAfter: cursor
        });

        if (!batch.length) break;

        total += batch.length;

        if (batch.length < COUNT_BATCH_LIMIT) break;

        cursor = Number(batch[batch.length - 1].createdAt || 0);

        if (!cursor) break;
    }

    return total;
}

async function getPendingLexa(env, uid) {
    try {
        const miningRaw = await getMiningDoc(env, uid);
        const mining = normalizeMining(miningRaw || {});

        return Number(mining.pendingLexa || 0);
    } catch {
        return 0;
    }
}

/* ==========================================================
   UTIL
========================================================== */

function normalizeActivityType(type) {
    const value = String(type || "").trim().toLowerCase();

    if (!value || value === "all") return null;

    const allowed = Object.values(HISTORY_TYPE);
    return allowed.includes(value) ? value : null;
}

function parsePositiveInt(value, fallback = null, min = 1, max = Number.MAX_SAFE_INTEGER) {
    if (value === null || value === undefined || value === "") return fallback;

    const n = Number.parseInt(String(value), 10);

    if (!Number.isFinite(n)) return fallback;
    if (n < min) return fallback;
    if (n > max) return max;

    return n;
}