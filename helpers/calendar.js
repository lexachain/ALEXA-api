/* ==========================================================
   ALEXA API
   File : helpers/calendar.js
   Description : Calendar / Daily Check-in Helpers
========================================================== */

import {
    getDocument,
    setDocument,
    runQuery
} from "./firestore.js";

import {
    appendHistory
} from "./history.js";

import {
    addPendingLexa
} from "./pendingLexa.js";

import {
    getNow,
    addMs
} from "./request.js";

/* ==========================================================
   CONFIG
========================================================== */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

const DAILY_REWARDS = [
    0.10,
    0.15,
    0.20,
    0.25,
    0.30,
    0.40,
    0.50
];

const SOCIAL_TASKS = [
    {
        taskId: "telegram",
        title: "Join Telegram",
        description: "Become a community member",
        icon: "fa-telegram",
        reward: 0.5,
        url: "https://t.me/lexa_network"
    },
    {
        taskId: "twitter",
        title: "Follow Twitter",
        description: "Stay updated with announcements",
        icon: "fa-x-twitter",
        reward: 0.5,
        url: "https://x.com/lexaprotocol"
    },
    {
        taskId: "facebook",
        title: "Follow Facebook",
        description: "Get news and campaign updates",
        icon: "fa-facebook-f",
        reward: 0.5,
        url: "https://www.facebook.com/lexalabs77"
    }
];

const REFERRAL_TASKS = [
    { taskId: "ref3", required: 3, reward: 3 },
    { taskId: "ref5", required: 5, reward: 5.5 },
    { taskId: "ref10", required: 10, reward: 11 },
    { taskId: "ref20", required: 20, reward: 25 },
    { taskId: "ref50", required: 50, reward: 75 },
    { taskId: "ref100", required: 100, reward: 200 }
];

/* ==========================================================
   DEFAULT
========================================================== */

export function defaultCalendarData() {
    return {
        daily: {
            currentDay: 1,
            canClaim: false,
            reward: DAILY_REWARDS[0],
            streak: 0,
            lastCheckin: null,
            remainingSeconds: 0
        },
        social: [],
        referral: [],
        summary: {
            referralCount: 0,
            totalTasks: 0,
            completedTasks: 0
        }
    };
}

export function normalizeCalendarData(doc = {}) {
    const base = defaultCalendarData();

    return {
        daily: {
            ...base.daily,
            ...(doc.daily || {})
        },
        social: Array.isArray(doc.social) ? doc.social : [],
        referral: Array.isArray(doc.referral) ? doc.referral : [],
        summary: {
            ...base.summary,
            ...(doc.summary || {})
        }
    };
}

/* ==========================================================
   UTIL
========================================================== */

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function calculateDailyReward(currentDay = 1) {
    const idx = Math.max(1, Math.min(WEEK_DAYS, toNumber(currentDay, 1))) - 1;
    return DAILY_REWARDS[idx] ?? DAILY_REWARDS[0];
}

function calculateCurrentDayFromStreak(streak = 0) {
    const s = Math.max(0, toNumber(streak));
    if (s <= 0) return 1;
    return ((s - 1) % WEEK_DAYS) + 1;
}

function calculateRemainingSeconds(lastCheckin, now = getNow()) {
    if (!lastCheckin) return 0;

    const nextAvailable = addMs(lastCheckin, DAY_MS);
    const remaining = Math.max(0, Number(nextAvailable) - Number(now));
    return Math.ceil(remaining / 1000);
}

function countReferralInvites(env, uid) {
    return runQuery(env, {
        from: [
            {
                collectionId: "referrals"
            }
        ],
        where: {
            fieldFilter: {
                field: {
                    fieldPath: "referredBy"
                },
                op: "EQUAL",
                value: {
                    stringValue: uid
                }
            }
        }
    }).then((rows) => Array.isArray(rows) ? rows.length : 0);
}

function buildSocialTasks(user = null) {
    const userTasks = user?.tasks || {};

    return SOCIAL_TASKS
        .filter(task => !userTasks?.[task.taskId])
        .map(task => ({
            taskId: task.taskId,
            title: task.title,
            description: task.description,
            icon: task.icon,
            reward: task.reward,
            url: task.url
        }));
}

function buildReferralTasks(
    referralCount = 0,
    claimedMilestones = new Set()
) {
    return REFERRAL_TASKS
        .filter(task => !claimedMilestones.has(task.taskId))
        .map(task => ({
            taskId: task.taskId,
            title: `Invite ${task.required} Friends`,
            required: task.required,
            progress: Math.min(referralCount, task.required),
            reward: task.reward,
            claimable: referralCount >= task.required
        }));
}

/* ==========================================================
   DOCUMENT HELPERS
========================================================== */

export async function getCalendarDoc(env, uid) {
    if (!uid) throw new Error("Missing uid.");
    return getDocument(env, `calendar/${uid}`);
}

export async function setCalendarDoc(env, uid, data = {}) {
    if (!uid) throw new Error("Missing uid.");
    return setDocument(env, `calendar/${uid}`, data);
}

/* ==========================================================
   SYNC
========================================================== */

export async function getCalendarData(env, uid) {
    if (!uid) throw new Error("Missing uid.");

    const now = getNow();

    const calendarRaw = await getCalendarDoc(env, uid);
    const calendar = normalizeCalendarData(calendarRaw || {});

    const user = await getDocument(env, `users/${uid}`);

    const lastCheckin = toNumber(calendar.daily.lastCheckin || 0);
    const streak = toNumber(calendar.daily.streak || 0);

    const canClaim = !lastCheckin
        ? true
        : (now - lastCheckin) >= DAY_MS;

    let nextStreak = streak;

    if (!lastCheckin) {
        nextStreak = 1;
    } else if (canClaim) {
        if ((now - lastCheckin) < (2 * DAY_MS)) {
            nextStreak = streak + 1;
        } else {
            nextStreak = 1;
        }
    }

    const currentDay = calculateCurrentDayFromStreak(nextStreak);
    const reward = calculateDailyReward(currentDay);
    const remainingSeconds = canClaim ? 0 : calculateRemainingSeconds(lastCheckin, now);

    const referralCount = await countReferralInvites(env, uid);

const social = buildSocialTasks(user);

const claimedMilestones = new Set(
    user?.referralClaims || []
);

const referral = buildReferralTasks(
    referralCount,
    claimedMilestones
);

    const totalTasks =
    1 +
    SOCIAL_TASKS.length +
    REFERRAL_TASKS.length;

const remainingTasks =
    (canClaim ? 1 : 0) +
    social.length +
    referral.length;

const completedTasks =
    totalTasks - remainingTasks;

    return {
        daily: {
            currentDay,
            canClaim,
            reward,
            streak: nextStreak,
            lastCheckin,
            remainingSeconds
        },
        social,
        referral,
        summary: {
            referralCount,
            totalTasks,
            completedTasks
        }
    };
}
export async function claimSocialTask(env, uid, taskId) {
    const user = await getDocument(env, `users/${uid}`);

    user.tasks = user.tasks || {};

    if (user.tasks[taskId]) {
        return {
            ok: false,
            message: "Task already claimed."
        };
    }

    const task = SOCIAL_TASKS.find(t => t.taskId === taskId);

    if (!task) {
        return {
            ok: false,
            message: "Invalid task."
        };
    }

    await addPendingLexa(
    env,
    uid,
    task.reward
);

    user.tasks[taskId] = true;

    await setDocument(
        env,
        `users/${uid}`,
        user
    );

    await appendHistory(env, uid, {
        type: "reward",
        title: task.title,
        amount: task.reward,
        token: "LEXA",
        status: "success",
        createdAt: getNow()
    });

    return {
        ok: true,
        message: "Reward claimed."
    };
}
export async function claimReferralTask(env, uid, taskId) {
    const user = await getDocument(env, `users/${uid}`);

    user.referralClaims = user.referralClaims || [];

    if (user.referralClaims.includes(taskId)) {
        return {
            ok: false,
            message: "Reward already claimed."
        };
    }

    const referralCount =
        await countReferralInvites(env, uid);

    const task = REFERRAL_TASKS.find(
        t => t.taskId === taskId
    );

    if (!task) {
        return {
            ok: false,
            message: "Invalid milestone."
        };
    }

    if (referralCount < task.required) {
        return {
            ok: false,
            message: "Referral target not reached."
        };
    }

    await addPendingLexa(
    env,
    uid,
    task.reward
);

    user.referralClaims.push(taskId);

    await setDocument(
        env,
        `users/${uid}`,
        user
    );

    await appendHistory(env, uid, {
        type: "referral",
        title: task.title,
        amount: task.reward,
        token: "LEXA",
        status: "success",
        createdAt: getNow()
    });

    return {
        ok: true,
        message: "Reward claimed."
    };
}

/* ==========================================================
   CLAIM DAILY
========================================================== */

export async function claimDailyCheckin(env, uid) {
    if (!uid) throw new Error("Missing uid.");

    const now = getNow();

    const calendarRaw = await getCalendarDoc(env, uid);
    const calendar = normalizeCalendarData(calendarRaw || {});

    const lastCheckin = toNumber(calendar.daily.lastCheckin || 0);
    const elapsed = lastCheckin ? Math.max(0, now - lastCheckin) : Infinity;

    if (lastCheckin && elapsed < DAY_MS) {
        return {
            ok: false,
            message: "Daily check-in is not ready yet.",
            remainingSeconds: calculateRemainingSeconds(lastCheckin, now)
        };
    }

    const previousStreak = toNumber(calendar.daily.streak || 0);
    let nextStreak = previousStreak;

    if (!lastCheckin) {
        nextStreak = 1;
    } else if (elapsed < 2 * DAY_MS) {
        nextStreak = previousStreak + 1;
    } else {
        nextStreak = 1;
    }

    const currentDay = calculateCurrentDayFromStreak(nextStreak);
    const reward = calculateDailyReward(currentDay);

    await addPendingLexa(
    env,
    uid,
    reward
);

    const updatedCalendar = {
        ...calendar,
        daily: {
            currentDay,
            canClaim: false,
            reward,
            streak: nextStreak,
            lastCheckin: now,
            remainingSeconds: DAY_MS / 1000
        }
    };

    await setCalendarDoc(env, uid, updatedCalendar);

    await appendHistory(env, uid, {
        type: "reward",
        title: "Daily Check-in",
        description: `Day ${currentDay} reward claimed.`,
        amount: reward,
        token: "LEXA",
        status: "success",
        createdAt: now
    });

    return {
        ok: true,
        message: `Daily reward claimed successfully. +${reward.toFixed(2)} LEXA`,
        daily: updatedCalendar.daily
    };
}

/* ==========================================================
   EXPORTS
========================================================== */

export async function syncCalendar(env, uid) {
    return getCalendarData(env, uid);
}