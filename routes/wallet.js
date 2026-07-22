/* ==========================================================
   ALEXA API
   File : routes/wallet.js
   Description : Wallet Routes
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import { success, error } from "../helpers/response.js";
import { readJson } from "../helpers/request.js";
import { requireUser, checkRateLimit } from "../helpers/security.js";

import {
    getWallet,
    createWallet,
    updateWallet,
    walletExists,
    setWalletPin,
    verifyWalletPin,
    enableBiometricWallet,
    getRecoveryPhrase,
    createRecoveryPhrase,
    verifyRecoveryPhrase,
    exportWallet,
    importWallet,
    getWalletChains
} from "../helpers/wallet.js";

import { getHistoryByUid } from "../helpers/history.js";

/* ==========================================================
   ROUTE
========================================================== */

export async function walletRoute(env, request, path) {
    try {
        const method = request.method.toUpperCase();

        const user = await requireUser(env, request);
        const uid = user?.uid;

        if (!uid) {
            return error(env, "Unauthorized user.", 401);
        }

        switch (path) {
            case "/wallet":
                if (method === "GET") {
                    return walletGet(env, uid);
                }
                if (method === "POST") {
                    return walletSync(env, uid);
                }
                break;

            case "/wallet/create":
                if (method === "POST") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return walletCreate(request, env, uid);
                }
                break;

            case "/wallet/update":
                if (method === "POST" || method === "PUT") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return walletUpdate(request, env, uid);
                }
                break;

            case "/wallet/chains":
                if (method === "GET") {
                    return walletChains(env);
                }
                break;

            case "/wallet/pin":
                if (method === "POST") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return walletSetPin(request, env, uid);
                }
                break;

            case "/wallet/pin/verify":
                if (method === "POST") {
                    return walletVerifyPin(request, env, uid);
                }
                break;

            case "/wallet/biometric":
                if (method === "POST") {
                    return walletBiometric(request, env, uid);
                }
                break;

            case "/wallet/recovery":
                if (method === "GET") {
                    return walletRecovery(env);
                }
                break;

            case "/wallet/recovery/verify":
                if (method === "POST") {
                    return walletVerifyRecovery(request, env, uid);
                }
                break;

            case "/wallet/export":
                if (method === "GET") {
                    return walletExport(env, uid);
                }
                break;

            case "/wallet/import":
                if (method === "POST") {
                    if (!checkRateLimit(request, uid)) {
                        return error(env, "Too many requests.", 429);
                    }
                    return walletImport(request, env, uid);
                }
                break;

            case "/wallet/history":
                if (method === "GET") {
                    return walletHistory(env, uid);
                }
                break;

            default:
                break;
        }

        return error(env, "Wallet route not found.", 404);
    } catch (err) {
        return error(env, err?.message || "Internal Error", 500);
    }
}

/* ==========================================================
   GET /wallet
========================================================== */

async function walletGet(env, uid) {
    const wallet = await getWallet(env, uid);

    return success(env, {
        wallet,
        exists: Boolean(wallet)
    });
}

/* ==========================================================
   POST /wallet
   Sync / ensure wallet exists
========================================================== */

async function walletSync(env, uid) {
    const wallet = await getWallet(env, uid);

    return success(env, {
        wallet,
        exists: Boolean(wallet)
    });
}

/* ==========================================================
   POST /wallet/create
========================================================== */

async function walletCreate(request, env, uid) {
    const body = await readJson(request);
    const recoveryPhrase = Array.isArray(body?.recoveryPhrase)
        ? body.recoveryPhrase
        : [];
    const pin = String(body?.pin || "").trim();

    if (!recoveryPhrase.length) {
        return error(env, "recoveryPhrase is required.", 400);
    }

    if (!pin) {
        return error(env, "pin is required.", 400);
    }

    const wallet = await createWallet(env, uid, recoveryPhrase, pin);

    return success(env, {
        wallet,
        created: true
    });
}

/* ==========================================================
   POST /wallet/update
========================================================== */

async function walletUpdate(request, env, uid) {
    const body = await readJson(request);
    const data = body?.data || body || {};

    const wallet = await updateWallet(env, uid, data);

    return success(env, {
        wallet
    });
}

/* ==========================================================
   GET /wallet/chains
========================================================== */

async function walletChains(env) {
    return success(env, {
        chains: getWalletChains()
    });
}

/* ==========================================================
   POST /wallet/pin
========================================================== */

async function walletSetPin(request, env, uid) {
    const body = await readJson(request);
    const pin = String(body?.pin || "").trim();

    const wallet = await setWalletPin(env, uid, pin);

    return success(env, {
        wallet,
        pinEnabled: true
    });
}

/* ==========================================================
   POST /wallet/pin/verify
========================================================== */

async function walletVerifyPin(request, env, uid) {
    const body = await readJson(request);
    const pin = String(body?.pin || "").trim();

    const verified = await verifyWalletPin(env, uid, pin);

    return success(env, {
        verified
    });
}

/* ==========================================================
   POST /wallet/biometric
========================================================== */

async function walletBiometric(request, env, uid) {
    const body = await readJson(request);
    const enabled = Boolean(body?.enabled);

    const wallet = await enableBiometricWallet(env, uid, enabled);

    return success(env, {
        wallet
    });
}

/* ==========================================================
   GET /wallet/recovery
   Wizard step: generate a fresh recovery phrase
========================================================== */

async function walletRecovery(env) {
    const phrase = createRecoveryPhrase();

    return success(env, {
        phrase
    });
}

/* ==========================================================
   POST /wallet/recovery/verify
========================================================== */

async function walletVerifyRecovery(request, env, uid) {
    const body = await readJson(request);
    const phrase = body?.phrase || [];

    const wallet = await verifyRecoveryPhrase(env, uid, phrase);

    return success(env, {
        wallet,
        verified: true
    });
}

/* ==========================================================
   GET /wallet/export
========================================================== */

async function walletExport(env, uid) {
    const wallet = await exportWallet(env, uid);

    return success(env, {
        wallet
    });
}

/* ==========================================================
   POST /wallet/import
========================================================== */

async function walletImport(request, env, uid) {
    const body = await readJson(request);
    const data = body?.wallet || body?.data || body || {};
    const exists = await getWallet(env, uid);

    if (exists) {
        return error(env, "Wallet already exists.", 409);
    }

    const wallet = await importWallet(env, uid, data);

    return success(env, {
        wallet,
        imported: true
    });
}

/* ==========================================================
   GET /wallet/history
========================================================== */

async function walletHistory(env, uid) {
    const history = await getHistoryByUid(env, uid);

    return success(env, {
        history
    });
}