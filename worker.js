/* ==========================================================
   ALEXA API
   File : worker.js
   Description : Cloudflare Worker Router
========================================================== */

/* ==========================================================
   IMPORT
========================================================== */

import { isDevelopment } from "./helpers/config.js";
import { success, error, corsHeaders } from "./helpers/response.js";

import { authRoute } from "./routes/auth.js";
import { miningRoute } from "./routes/mining.js";
import { referralRoute } from "./routes/referral.js";
import { walletRoute } from "./routes/wallet.js";
import { userRoute } from "./routes/user.js";

/* ==========================================================
   ROUTE MAP
========================================================== */

const ROUTES = [
    { method: "GET", path: "/server/ping", handler: handleServerPing },
    { method: "GET", path: "/server/time", handler: handleServerTime },

    { method: "POST", path: "/auth", handler: authRoute },

    { method: "GET", path: "/user/sync", handler: userRoute },
    { method: "POST", path: "/user/sync", handler: userRoute },
    { method: "GET", path: "/user/profile", handler: userRoute },
    { method: "POST", path: "/user/profile", handler: userRoute },
    { method: "PUT", path: "/user/profile", handler: userRoute },
    { method: "POST", path: "/user/avatar", handler: userRoute },
    { method: "POST", path: "/user/username", handler: userRoute },
    { method: "POST", path: "/user/status", handler: userRoute },
    { method: "POST", path: "/user/delete", handler: userRoute },
    { method: "DELETE", path: "/user/delete", handler: userRoute },
    { method: "GET", path: "/user/check", handler: userRoute },
    { method: "GET", path: "/user/search/username", handler: userRoute },
    { method: "GET", path: "/user/search/email", handler: userRoute },

    { method: "GET", path: "/wallet", handler: walletRoute },
    { method: "POST", path: "/wallet", handler: walletRoute },
    { method: "POST", path: "/wallet/create", handler: walletRoute },
    { method: "POST", path: "/wallet/update", handler: walletRoute },
    { method: "GET", path: "/wallet/chains", handler: walletRoute },
    { method: "POST", path: "/wallet/pin", handler: walletRoute },
    { method: "POST", path: "/wallet/pin/verify", handler: walletRoute },
    { method: "POST", path: "/wallet/biometric", handler: walletRoute },
    { method: "GET", path: "/wallet/recovery", handler: walletRoute },
    { method: "POST", path: "/wallet/recovery/verify", handler: walletRoute },
    { method: "GET", path: "/wallet/export", handler: walletRoute },
    { method: "POST", path: "/wallet/import", handler: walletRoute },
    { method: "GET", path: "/wallet/history", handler: walletRoute },

    { method: "POST", path: "/mining", handler: miningRoute },
    { method: "POST", path: "/mining/start", handler: miningRoute },
    { method: "POST", path: "/mining/claim", handler: miningRoute },
    { method: "POST", path: "/mining/state", handler: miningRoute },

    { method: "GET", path: "/referral", handler: referralRoute },
    { method: "GET", path: "/referral/link", handler: referralRoute },
    { method: "GET", path: "/referral/history", handler: referralRoute },
    { method: "GET", path: "/referral/leaderboard", handler: referralRoute },
    { method: "POST", path: "/referral/apply", handler: referralRoute }
];

/* ==========================================================
   SERVER
========================================================== */

async function handleServerPing(env) {
    return success(env, {
        message: "ALEXA API Online"
    });
}

async function handleServerTime(env) {
    return success(env, {
        timestamp: Date.now(),
        iso: new Date().toISOString()
    });
}

/* ==========================================================
   ROUTE RESOLVER
========================================================== */

function resolveRoute(method, path) {
    return ROUTES.find((route) => route.method === method && route.path === path) || null;
}

/* ==========================================================
   FETCH
========================================================== */

export default {
    async fetch(request, env) {
        try {
            env.REQUEST_ORIGIN = request.headers.get("Origin") || "";

            if (request.method === "OPTIONS") {
                return new Response(null, {
                    headers: corsHeaders(env)
                });
            }

            const url = new URL(request.url);
            const method = request.method.toUpperCase();
            const path = url.pathname;

            if (isDevelopment(env)) {
                console.log(`[${method}] ${path}`);
            }

            const route = resolveRoute(method, path);

            if (!route) {
                return error(env, "Endpoint Not Found", 404);
            }

            return await route.handler(env, request, path);
        } catch (err) {
            if (isDevelopment(env)) {
                console.error(err);
            }

            return error(env, err?.message || "Internal Error", 500);
        }
    }
};