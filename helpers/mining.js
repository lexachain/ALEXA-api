/* ==========================================================
   ALEXA API
   File : helpers/mining.js
   Description : Mining Helpers
========================================================== */

import {
    getDocument,
    setDocument,
    deleteDocument
} from "./firestore.js";

import {
    getNow,
    addMs,
    remainingMs
} from "./request.js";

import {
    appendHistory
} from "./history.js";
import {
    rewardReferral
} from "./referral.js";

/* ==========================================================
   CONFIG
========================================================== */

const MINING_DURATION = 24 * 60 * 60 * 1000; // 24 jam

/* ==========================================================
   DEFAULT DATA
========================================================== */

export function defaultMiningData() {
    return {
        status: "idle",
        miningRate: 0.7,
        miningDuration: MINING_DURATION,
        boost: 1,
        multiplier: 1,
        currentReward: 0.7,
        pendingLexa: 0,
        totalLexa: 0,
        stats: {
    totalSession: 0,
    totalStart: 0,
    totalClaimed: 0,
    firstStarted: false
},
        time: {
            lastStart: null,
            nextClaim: null,
            lastClaim: null
        }
    };
}

export function normalizeMining(doc = {}) {
    const base = defaultMiningData();

    return {
        ...base,
        ...doc,
        stats: {
            ...base.stats,
            ...(doc.stats || {})
        },
        settings: {
            ...base.settings,
            ...(doc.settings || {})
        },
        time: {
            ...base.time,
            ...(doc.time || {})
        }
    };
}

/* ==========================================================
   STATUS
========================================================== */

export function calculateMiningStatus(mining) {
    const now = getNow();
    const nextClaim = mining?.time?.nextClaim || null;

    let status = mining?.status || "idle";
    let remaining = 0;

    if (status === "mining" && nextClaim) {
        remaining = remainingMs(nextClaim, now);

        if (remaining === 0) {
            status = "claim";
        }
    }

    return { status, remaining, nextClaim };
}

/* ==========================================================
   DOCUMENT HELPERS
========================================================== */

export async function getMiningDoc(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return getDocument(env, `mining/${uid}`);
}

export async function setMiningDoc(env, uid, data = {}) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    return setDocument(env, `mining/${uid}`, data);
}

export async function getMiningState(env, uid) {
    const raw = await getMiningDoc(env, uid);
    return normalizeMining(raw || {});
}


/* ==========================================================
   MINING CALCULATION
========================================================== */

export function calculateMiningReward(mining) {
    const baseReward = Number(
        mining?.currentReward ||
        mining?.miningRate ||
        0.7
    );

    const boost = Number(mining?.boost || 1);
    const multiplier = Number(mining?.multiplier || 1);

    return baseReward * boost * multiplier;
}

export function calcNextClaim(now = getNow()) {
    return addMs(now, MINING_DURATION);
}

export function isMiningClaimable(mining) {
    return calculateMiningStatus(mining).status === "claim";
}

/* ==========================================================
   MINING ACTIONS
========================================================== */

export async function startMining(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const now = getNow();
    const raw = await getMiningDoc(env, uid);
    const mining = normalizeMining(raw || {});

    if (mining.status === "mining") {
        return {
            ok: true,
            status: "mining",
            mining,
            message: "Mining is already running."
        };
    }

    if (mining.status === "claim") {
        return {
            ok: true,
            status: "claim",
            mining,
            message: "Mining is ready to claim."
        };
    }

    const nextClaim = calcNextClaim(now);

    const updated = {
        ...mining,
        status: "mining",
        miningDuration: MINING_DURATION,
        time: {
            ...mining.time,
            lastStart: now,
            nextClaim,
            lastClaim: mining.time?.lastClaim || null
        },
        stats: {
            ...mining.stats,
            totalSession: Number(mining.stats?.totalSession || 0) + 1,
            totalStart: Number(mining.stats?.totalStart || 0) + 1
        },
        updatedAt: now
    };
if (!mining.stats.firstStarted) {
    await rewardReferral(env, uid);

    updated.stats.firstStarted = true;
}
    await setMiningDoc(env, uid, updated);

    return {
        ok: true,
        status: "mining",
        mining: updated,
        nextClaim,
        remaining: MINING_DURATION,
        message: "Mining started."
    };
}

export async function syncMining(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const now = getNow();
    const mining = normalizeMining((await getMiningDoc(env, uid)) || {});
    const statusInfo = calculateMiningStatus(mining);

    if (statusInfo.status === "claim" && mining.status !== "claim") {
        const updated = {
            ...mining,
            status: "claim",
            updatedAt: now
        };

        await setMiningDoc(env, uid, updated);

        return {
            ok: true,
            status: "claim",
            mining: updated,
            remaining: 0,
            nextClaim: statusInfo.nextClaim
        };
    }

    return {
        ok: true,
        status: statusInfo.status,
        mining: {
            ...mining,
            status: statusInfo.status,
            time: {
                ...mining.time,
                nextClaim: statusInfo.nextClaim
            }
        },
        remaining: statusInfo.remaining,
        nextClaim: statusInfo.nextClaim
    };
}
export async function deleteMining(env, uid) {

    return deleteDocument(env, `mining/${uid}`);

}
export async function claimMining(env, uid) {
    if (!uid) {
        throw new Error("Missing uid.");
    }

    const now = getNow();
    const raw = await getMiningDoc(env, uid);
    const mining = normalizeMining(raw || {});
    const statusInfo = calculateMiningStatus(mining);

    const canClaim =
        mining.status === "claim" ||
        statusInfo.status === "claim";

    if (!canClaim) {
        return {
            ok: false,
            status: mining.status || "idle",
            remaining: statusInfo.remaining,
            message: "Mining is not ready to claim."
        };
    }

    const reward = calculateMiningReward(mining);
    const pendingLexa = Number(mining.pendingLexa || 0) + reward;
    const totalLexa = Number(mining.totalLexa || 0) + reward;

    await appendHistory(env, uid, {
        type: "mining",
        title: "Mining Reward",
        description: "Mining completed successfully",
        amount: reward,
        token: "LEXA",
        status: "success",
        createdAt: now
    });

    const updated = {
        ...mining,
        status: "idle",
        pendingLexa,
        totalLexa,
        time: {
            ...mining.time,
            lastClaim: now,
            nextClaim: null,
            lastStart: null
        },
        stats: {
            ...mining.stats,
            totalClaimed: Number(mining.stats?.totalClaimed || 0) + 1
        },
        updatedAt: now
    };

    await setMiningDoc(env, uid, updated);

    return {
        ok: true,
        status: "idle",
        serverTime: now,
        reward,
        pendingLexa,
        mining: updated,
        message: "Mining claimed successfully."
    };
}
