/* ==========================================================
   ALEXA
   File : helpers/spin.js
   Description : Lucky Spin Business Logic (Referral Only)
========================================================== */

import { getDocument, setDocument } from "./firestore.js";
import { getNow, uuid } from "./request.js";
import { addSystemHistory, getHistoryByUid } from "./history.js";
import { addPendingLexa, getPendingLexa } from "./pendingLexa.js";

/* ==========================================================
   CONSTANTS
========================================================== */

const SPIN_CONFIG_PATH = "spin/config";
const SPIN_STATE_COLLECTION = "spin";

const DEFAULT_WELCOME_SPINS = 1;
const DEFAULT_SPIN_COST = 1;

const DEFAULT_TASKS = {
    referral: {
        current: 0,
        target: 1,
        rewardSpins: 1
    }
};

const DEFAULT_RULES = [
    "🎁 New users receive 1 welcome spin.",
    "👥 Every verified referral earns +1 spin.",
    "🪙 Lucky Spin rewards are added to Pending LEXA.",
    "☁️ All rewards are securely validated by the server."
];

const DEFAULT_REWARD_POOL = [
    { label: "0.05 LEXA", amount: 0.05, type: "lexa", chance: 66, color: "#E3B23C" },
    { label: "0.50 LEXA", amount: 0.5, type: "lexa", chance: 15, color: "#B88A1E" },
    { label: "1.5 LEXA", amount: 1.5, type: "lexa", chance: 10, color: "#1FAE63" },
    { label: "5 LEXA", amount: 5, type: "lexa", chance: 5, color: "#6E59FF" },
    { label: "7 LEXA", amount: 7, type: "lexa", chance: 2.5, color: "#D97706" },
    { label: "Mystery Box", type: "mystery", chance: 1, minAmount: 1, maxAmount: 20, color: "#3A4D70" },
    { label: "70 LEXA", amount: 70, type: "jackpot", chance: 0.5, color: "#D4AF37" }
];

/* ==========================================================
   UTILITIES
========================================================== */
export async function grantReferralSpin(env, uid) {

    const config = await readConfig(env);

    const state = await ensureSpinState(env, uid, config);

    state.spins = Number(state.spins || 0) + 1;
state.availableSpins = state.spins;

const invited = Number(state.invitedMembers || 0) + 1;

state.invitedMembers = invited;
state.totalInvite = invited;
state.verifiedInvite = invited;

if (!state.referral) {
    state.referral = {};
}

state.referral.current = invited;
state.referral.target ??= 1;
state.referral.rewardSpins ??= 1;
state.availableSpins = state.spins;
state.updatedAt = now();

    await saveSpinState(env, uid, state);

    await appendSpinHistory(env, uid, {
        title: "Referral Reward",
        description: "Verified referral +1 Spin",
        amount: 0,
        metadata:{
            feature:"spin",
            action:"referral"
        }
    });

    return state;

}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function roundAmount(value, digits = 8) {
    const n = safeNumber(value, 0);
    const factor = 10 ** digits;
    return Math.round(n * factor) / factor;
}

function formatLexa(value) {
    const n = safeNumber(value, 0);
    if (Number.isInteger(n)) return String(n);
    return roundAmount(n, 2).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function now() {
    return getNow?.() ?? Date.now();
}

function makeId() {
    return String(uuid?.() || crypto.randomUUID());
}

function defaultColor(index) {
    const palette = [
        "#D4AF37",
        "#B88A1E",
        "#1FAE63",
        "#6E59FF",
        "#D97706",
        "#3A4D70",
        "#8A6510"
    ];
    return palette[index % palette.length];
}

function normalizeType(type) {
    const value = String(type || "").trim().toLowerCase();
    if (["lexa", "mystery", "jackpot", "nothing"].includes(value)) return value;
    if (value.includes("jackpot")) return "jackpot";
    if (value.includes("mystery")) return "mystery";
    if (value.includes("nothing")) return "nothing";
    return "lexa";
}

function inferSectorType(label) {
    const text = String(label || "").toLowerCase();
    if (text.includes("mystery")) return "mystery";
    if (text.includes("jackpot") || text.includes("70")) return "jackpot";
    if (text.includes("nothing") || text.includes("no reward")) return "nothing";
    return "lexa";
}

function normalizeHexColor(value, fallback) {
    const input = String(value || "").trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) return fallback;

    if (input.length === 4) {
        const r = input[1];
        const g = input[2];
        const b = input[3];
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }

    return input.toUpperCase();
}

function hexToRgb(hex) {
    const clean = normalizeHexColor(hex, "#000000").replace("#", "");
    return {
        r: Number.parseInt(clean.slice(0, 2), 16),
        g: Number.parseInt(clean.slice(2, 4), 16),
        b: Number.parseInt(clean.slice(4, 6), 16)
    };
}

function rgbToHex(r, g, b) {
    const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function mixHex(a, b, amount = 0.5) {
    const c1 = hexToRgb(a);
    const c2 = hexToRgb(b);
    const t = Math.max(0, Math.min(1, amount));

    return rgbToHex(
        c1.r + (c2.r - c1.r) * t,
        c1.g + (c2.g - c1.g) * t,
        c1.b + (c2.b - c1.b) * t
    );
}

function safeLimit(limit, fallback = 20, max = 100) {
    const n = safeNumber(limit, fallback);
    return Math.max(1, Math.min(max, Math.floor(n)));
}

/* ==========================================================
   NORMALIZERS
========================================================== */

function normalizeSector(item = {}, index = 0) {
    return {
        label: String(item.label || item.name || item.title || "Reward"),
        amount: item.amount == null ? null : safeNumber(item.amount, null),
        type: normalizeType(item.type || inferSectorType(item.label || item.name || item.title || "")),
        chance: item.chance ?? item.probability ?? item.weight ?? null,
        minAmount: item.minAmount ?? item.min ?? 1,
        maxAmount: item.maxAmount ?? item.max ?? 20,
        color: normalizeHexColor(item.color || item.hex, defaultColor(index)),
        sectorIndex: Number.isInteger(item.sectorIndex) ? item.sectorIndex : index,
        description: String(item.description || "")
    };
}

function normalizeSectors(input = []) {
    const list = Array.isArray(input) && input.length ? input : DEFAULT_REWARD_POOL;
    return list.map((item, index) => normalizeSector(item, index));
}

function normalizeTasks(input = {}) {
    const source = isObject(input) ? input : {};
    const referralSrc = source.referral ?? source.tasks?.referral ?? {};
    return {
        referral: {
            current: Math.max(0, Math.floor(safeNumber(referralSrc.current, DEFAULT_TASKS.referral.current))),
            target: Math.max(1, Math.floor(safeNumber(referralSrc.target, DEFAULT_TASKS.referral.target))),
            rewardSpins: Math.max(1, Math.floor(safeNumber(referralSrc.rewardSpins, DEFAULT_TASKS.referral.rewardSpins)))
        }
    };
}

function normalizeRules(input = []) {
    return Array.isArray(input) && input.length ? input.map(String) : clone(DEFAULT_RULES);
}

function normalizeConfig(doc = {}) {
    const source = isObject(doc) ? doc : {};
    const wheelSource = source.wheel && isObject(source.wheel) ? source.wheel : source;
    const sectors =
        wheelSource.sectors ||
        wheelSource.rewardPool ||
        source.sectors ||
        source.rewardPool ||
        DEFAULT_REWARD_POOL;

    const tasks = normalizeTasks(source.tasks ?? source);

    return {
        spinCost: Math.max(0, safeNumber(source.spinCost ?? source.cost, DEFAULT_SPIN_COST)),
        welcomeSpinCount: Math.max(0, safeNumber(source.welcomeSpinCount ?? source.welcomeSpins, DEFAULT_WELCOME_SPINS)),
        tasks,
        referral: clone(tasks.referral),
        rules: normalizeRules(source.rules),
        wheel: {
            sectors: normalizeSectors(sectors)
        }
    };
}

function getStatePath(uid) {
    return `${SPIN_STATE_COLLECTION}/${uid}`;
}

function normalizeState(doc = {}, config = null) {
    const source = isObject(doc) ? doc : {};
    const cfg = config || normalizeConfig();

    const invitedMembers = Math.max(
        0,
        Math.floor(
            safeNumber(
                source.invitedMembers ??
                source.totalInvite ??
                source.verifiedInvite ??
                source?.referral?.current ??
                cfg.tasks.referral.current,
                cfg.tasks.referral.current
            )
        )
    );

    return {

    uid: String(source.uid || ""),

    spins: Math.max(
        0,
        Math.floor(
            safeNumber(
                source.availableSpins ??
                source.spins,
                0
            )
        )
    ),

    availableSpins: Math.max(
        0,
        Math.floor(
            safeNumber(
                source.availableSpins ??
                source.spins,
                0
            )
        )
    ),

    invitedMembers,
        totalInvite: invitedMembers,
        verifiedInvite: invitedMembers,
        welcomeSpinGranted: Boolean(source.welcomeSpinGranted ?? source.welcomeGranted ?? false),
        referral: {
            current: invitedMembers,
            target: Math.max(1, Math.floor(safeNumber(source?.referral?.target, cfg.tasks.referral.target))),
            rewardSpins: Math.max(1, Math.floor(safeNumber(source?.referral?.rewardSpins, cfg.tasks.referral.rewardSpins)))
        },
        lastSpinAt: safeNumber(source.lastSpinAt, 0),
        lastSpinId: String(source.lastSpinId || ""),
        lastSpinReward: isObject(source.lastSpinReward) ? source.lastSpinReward : null,
        totalSpinsUsed: Math.max(0, Math.floor(safeNumber(source.totalSpinsUsed, 0))),
        totalRewardsGranted: Math.max(0, Math.floor(safeNumber(source.totalRewardsGranted, 0))),
        rotation: safeNumber(source.rotation, 0),
        updatedAt: safeNumber(source.updatedAt, 0),
        createdAt: safeNumber(source.createdAt, 0)
    };
}

function spinHistoryFilter(item = {}) {
    const type = String(item.type || "").toLowerCase();
    const title = String(item.title || "").toLowerCase();
    const description = String(item.description || "").toLowerCase();
    const feature = String(item?.metadata?.feature || "").toLowerCase();
    const action = String(item?.metadata?.action || "").toLowerCase();

    return (
        feature === "spin" ||
        action === "reward" ||
        title.includes("lucky spin") ||
        description.includes("lucky spin") ||
        (type === "system" && (title.includes("spin") || description.includes("spin")))
    );
}

function serializeHistoryItem(item = {}) {
    return {
        id: String(item.id || item.docId || item.uid || ""),
        uid: String(item.uid || ""),
        type: String(item.type || "system"),
        title: String(item.title || ""),
        description: String(item.description || ""),
        amount: roundAmount(item.amount ?? item.reward ?? 0, 8),
        reward: roundAmount(item.reward ?? item.amount ?? 0, 8),
        token: String(item.token || "LEXA"),
        status: String(item.status || "success"),
        metadata: isObject(item.metadata) ? item.metadata : {},
        createdAt: safeNumber(item.createdAt, now())
    };
}

function buildRewardDescription(reward, amount) {
    if (reward?.type === "mystery") {
        return `Mystery Box reward: ${formatLexa(amount)} LEXA`;
    }

    if (reward?.type === "jackpot") {
        return `Jackpot reward: ${formatLexa(amount)} LEXA`;
    }

    if (reward?.type === "nothing") {
        return "No reward.";
    }

    return `${formatLexa(amount)} LEXA reward`;
}

function serializeReward(reward = {}, sectorIndex = 0) {
    const amount = reward.type === "nothing"
        ? 0
        : roundAmount(reward.amount ?? reward.value ?? 0, 8);

    return {
        label: String(reward.label || "Reward"),
        amount,
        value: amount,
        type: normalizeType(reward.type || "lexa"),
        chance: reward.chance ?? null,
        color: String(reward.color || defaultColor(sectorIndex)),
        sectorIndex: Number.isInteger(reward.sectorIndex) ? reward.sectorIndex : sectorIndex,
        description: String(reward.description || buildRewardDescription(reward, amount))
    };
}

function buildTicketId(spinId) {
    const suffix = String(spinId || makeId()).replace(/-/g, "").slice(0, 10).toUpperCase();
    return `SPIN-${suffix}`;
}

function weightedPick(pool) {
    const items = Array.isArray(pool) && pool.length ? pool : normalizeSectors(DEFAULT_REWARD_POOL);
    const weights = items.map((item) => {
        const w = safeNumber(item.chance ?? item.probability ?? item.weight, 0);
        return w > 0 ? w : 1;
    });

    const total = weights.reduce((sum, value) => sum + value, 0);
    let roll = Math.random() * total;

    for (let i = 0; i < items.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return { sector: items[i], index: i };
    }

    return { sector: items[items.length - 1], index: items.length - 1 };
}

function finalizeReward(sector) {
    const reward = clone(sector) || {};
    reward.type = normalizeType(reward.type || "lexa");

    if (reward.type === "mystery") {
        const min = Math.max(1, Math.floor(safeNumber(reward.minAmount, 1)));
        const max = Math.max(min, Math.floor(safeNumber(reward.maxAmount, 20)));
        reward.amount = Math.floor(min + Math.random() * (max - min + 1));
        reward.value = reward.amount;
        reward.description = `Mystery Box reward: ${formatLexa(reward.amount)} LEXA`;
    } else if (reward.type === "jackpot") {
        reward.amount = roundAmount(reward.amount ?? 70, 8);
        reward.value = reward.amount;
        reward.description = `Jackpot reward: ${formatLexa(reward.amount)} LEXA`;
    } else if (reward.type === "nothing") {
        reward.amount = 0;
        reward.value = 0;
        reward.description = "No reward.";
    } else {
        reward.amount = roundAmount(reward.amount ?? reward.value ?? 0, 8);
        reward.value = reward.amount;
        reward.description = reward.description || `${formatLexa(reward.amount)} LEXA reward`;
    }

    return reward;
}

async function safeGetDocument(env, path) {
    try {
        return await getDocument(env, path);
    } catch {
        return null;
    }
}

async function safeSetDocument(env, path, data) {
    return setDocument(env, path, data);
}

async function readConfig(env) {
    const raw = await safeGetDocument(env, SPIN_CONFIG_PATH);
    return normalizeConfig(raw || {});
}

async function writeConfig(env, config) {
    const normalized = normalizeConfig(config || {});
    await safeSetDocument(env, SPIN_CONFIG_PATH, normalized);
    return normalized;
}

async function ensureSpinState(env, uid, config = null) {
    const cfg = config || await readConfig(env);
    const path = getStatePath(uid);
    const raw = await safeGetDocument(env, path);

    if (!raw) {
        const createdAt = now();
        const initial = normalizeState({
            uid,
            spins: cfg.welcomeSpinCount,
            welcomeSpinGranted: cfg.welcomeSpinCount > 0,
            referral: cfg.tasks.referral,
            invitedMembers: 0,
            totalInvite: 0,
            verifiedInvite: 0,
            createdAt,
            updatedAt: createdAt
        }, cfg);

        await safeSetDocument(env, path, initial);
        return initial;
    }

    const normalized = normalizeState({ ...raw, uid }, cfg);
    if (!normalized.createdAt) normalized.createdAt = safeNumber(raw?.createdAt, now());
    if (!normalized.updatedAt) normalized.updatedAt = safeNumber(raw?.updatedAt, now());

    const needsWrite = JSON.stringify(normalized) !== JSON.stringify(raw);
    if (needsWrite) {
        await safeSetDocument(env, path, normalized);
    }

    return normalized;
}

async function saveSpinState(env, uid, state) {

    const cfg = await readConfig(env);

    const normalized = normalizeState(
        { ...state, uid },
        cfg
    );

    normalized.availableSpins = normalized.spins;

    await safeSetDocument(
        env,
        getStatePath(uid),
        normalized
    );

    return normalized;

}

async function appendSpinHistory(env, uid, {
    title,
    description,
    amount = 0,
    token = "LEXA",
    status = "success",
    metadata = {},
    createdAt = now()
} = {}) {
    return addSystemHistory(env, uid, {
        title: String(title || "Lucky Spin"),
        description: String(description || ""),
        amount: roundAmount(amount, 8),
        token: String(token || "LEXA"),
        status: String(status || "success"),
        metadata: {
            feature: "spin",
            ...clone(metadata)
        },
        createdAt
    });
}

/* ==========================================================
   PUBLIC API
========================================================== */

export async function getDashboard(env, uid) {
    if (!uid) throw new Error("Missing uid.");

    const config = await readConfig(env);
    const [state, history, pending] = await Promise.all([
        ensureSpinState(env, uid, config),
        getSpinHistory(env, uid, 20).catch(() => ({ items: [] })),
        getPendingLexa(env, uid).catch(() => ({ pendingLexa: 0, totalLexa: 0 }))
    ]);

    const invitedMembers = Math.max(0, Math.floor(state.invitedMembers || 0));

    return {
        success: true,
        uid,
        spins: state.spins,
        availableSpins: state.spins,
        invitedMembers,
        totalInvite: invitedMembers,
        verifiedInvite: invitedMembers,
        pendingLexa: pending.pendingLexa ?? 0,
        totalLexa: pending.totalLexa ?? 0,
        pending: {
            pendingLexa: pending.pendingLexa ?? 0,
            totalLexa: pending.totalLexa ?? 0
        },
        tasks: {
            referral: clone(state.referral)
        },
        task: {
            referral: clone(state.referral)
        },
        referral: clone(state.referral),
        rules: clone(config.rules),
        wheel: {
            sectors: clone(config.wheel.sectors)
        },
        sectors: clone(config.wheel.sectors),
        rewardPool: clone(config.wheel.sectors),
        history: history.items || [],
        rotation: state.rotation || 0,
        state: {
            welcomeSpinGranted: Boolean(state.welcomeSpinGranted),
            lastSpinAt: state.lastSpinAt || 0,
            totalSpinsUsed: state.totalSpinsUsed || 0,
            totalRewardsGranted: state.totalRewardsGranted || 0
        }
    };
}

export async function startSpin(env, uid, input = {}) {
    if (!uid) throw new Error("Missing uid.");

    const config = await readConfig(env);
    const state = await ensureSpinState(env, uid, config);

    if (state.spins < config.spinCost) {
        throw new Error("No spins available.");
    }

    const spinId = makeId();
    const ticketId = buildTicketId(spinId);
    const rolled = weightedPick(config.wheel.sectors);
    const reward = finalizeReward(rolled.sector);
    reward.sectorIndex = rolled.index;

    const nextState = normalizeState({
        ...state,
        spins: Math.max(0, state.spins - config.spinCost),
        availableSpins: Math.max(0, state.spins - config.spinCost),
        lastSpinAt: now(),
        lastSpinId: spinId,
        lastSpinReward: reward,
        totalSpinsUsed: state.totalSpinsUsed + 1,
        totalRewardsGranted: state.totalRewardsGranted + (reward.amount > 0 ? 1 : 0),
        updatedAt: now()
    }, config);

    await saveSpinState(env, uid, nextState);

    if (reward.amount > 0) {
        await addPendingLexa(env, uid, reward.amount);
    }

    await appendSpinHistory(env, uid, {
        title: "Lucky Spin",
        description: reward.description || `${reward.label} won`,
        amount: reward.amount,
        token: "LEXA",
        status: "success",
        metadata: {
            action: "reward",
            spinId,
            ticketId,
            sectorIndex: reward.sectorIndex,
            rewardType: reward.type,
            rewardLabel: reward.label,
            rewardColor: reward.color,
            appVersion: String(input?.appVersion || ""),
            timezone: String(input?.timezone || "")
        },
        createdAt: now()
    });

    const pending = await getPendingLexa(env, uid).catch(() => ({ pendingLexa: 0, totalLexa: 0 }));
    const invitedMembers = Math.max(0, Math.floor(nextState.invitedMembers || 0));

    return {
        success: true,
        spinId,
        ticketId,
        reward: serializeReward(reward, reward.sectorIndex),
        remainingSpins: nextState.spins,
        availableSpins: nextState.spins,
        spins: nextState.spins,
        invitedMembers,
        totalInvite: invitedMembers,
        verifiedInvite: invitedMembers,
        pendingLexa: pending.pendingLexa ?? 0,
        totalLexa: pending.totalLexa ?? 0,
        pending: {
            pendingLexa: pending.pendingLexa ?? 0,
            totalLexa: pending.totalLexa ?? 0
        },
        task: {
            referral: clone(nextState.referral)
        },
        tasks: {
            referral: clone(nextState.referral)
        },
        referral: clone(nextState.referral),
        historyType: "system",
        message: reward.amount > 0
            ? `You won ${formatLexa(reward.amount)} LEXA.`
            : "No reward this round."
    };
}

export async function grantReward(env, uid, reward = {}, metadata = {}) {
    if (!uid) throw new Error("Missing uid.");

    const cfg = await readConfig(env);
    const normalized = finalizeReward(reward);
    const spinState = await ensureSpinState(env, uid, cfg);

    const nextState = normalizeState({
        ...spinState,
        totalRewardsGranted: spinState.totalRewardsGranted + (normalized.amount > 0 ? 1 : 0),
        updatedAt: now()
    }, cfg);

    await saveSpinState(env, uid, nextState);

    if (normalized.amount > 0) {
        await addPendingLexa(env, uid, normalized.amount);
    }

    await appendSpinHistory(env, uid, {
        title: "Lucky Spin Reward",
        description: normalized.description || `${normalized.label} granted`,
        amount: normalized.amount,
        token: "LEXA",
        status: "success",
        metadata: {
            action: "reward",
            ...clone(metadata),
            rewardType: normalized.type,
            rewardLabel: normalized.label
        },
        createdAt: now()
    });

    const pending = await getPendingLexa(env, uid).catch(() => ({ pendingLexa: 0, totalLexa: 0 }));

    return {
        success: true,
        reward: serializeReward(normalized),
        pendingLexa: pending.pendingLexa ?? 0,
        totalLexa: pending.totalLexa ?? 0,
        pending: {
            pendingLexa: pending.pendingLexa ?? 0,
            totalLexa: pending.totalLexa ?? 0
        }
    };
}

export async function consumeSpin(env, uid, count = 1) {
    if (!uid) throw new Error("Missing uid.");

    const cfg = await readConfig(env);
    const state = await ensureSpinState(env, uid, cfg);
    const n = Math.max(1, Math.floor(safeNumber(count, 1)));

    if (state.spins < n) {
        throw new Error("No spins available.");
    }

    const nextState = normalizeState({
        ...state,
        spins: Math.max(0, state.spins - n),
        updatedAt: now()
    }, cfg);

    await saveSpinState(env, uid, nextState);

    return {
        success: true,
        remainingSpins: nextState.spins,
        availableSpins: nextState.spins
    };
}

export async function generateReward(env) {
    const cfg = await readConfig(env);
    const { sector, index } = weightedPick(cfg.wheel.sectors);
    const reward = finalizeReward(sector);
    reward.sectorIndex = index;

    return {
        success: true,
        reward: serializeReward(reward, index),
        sectorIndex: index
    };
}

export async function getSpinConfig(env) {
    const config = await readConfig(env);
    return {
        success: true,
        config: clone(config)
    };
}

export async function setSpinConfig(env, nextConfig = {}) {
    const config = await writeConfig(env, nextConfig);
    return {
        success: true,
        config: clone(config)
    };
}

export async function resetSpinState(env, uid) {
    if (!uid) throw new Error("Missing uid.");

    const config = await readConfig(env);
    const createdAt = now();

    const state = normalizeState({
        uid,
        spins: config.welcomeSpinCount,
        welcomeSpinGranted: config.welcomeSpinCount > 0,
        referral: config.tasks.referral,
        invitedMembers: 0,
        totalInvite: 0,
        verifiedInvite: 0,
        createdAt,
        updatedAt: createdAt
    }, config);

    await saveSpinState(env, uid, state);

    return {
        success: true,
        state
    };
}

export async function getSpinHistory(env, uid, limit = 20) {
    if (!uid) throw new Error("Missing uid.");

    const safe = safeLimit(limit, 20, 100);
    const rows = await getHistoryByUid(env, uid, Math.max(20, safe * 4));

    const items = (Array.isArray(rows) ? rows : [])
        .filter(spinHistoryFilter)
        .slice(0, safe)
        .map(serializeHistoryItem);

    return {
        success: true,
        items,
        limit: safe
    };
}

export default {
    getDashboard,
    startSpin,
    grantReward,
    consumeSpin,
    generateReward,
    getSpinConfig,
    setSpinConfig,
    resetSpinState,
    getSpinHistory,
    grantReferralSpin
    
};