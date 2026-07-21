/* ==========================================================
   ALEXA API
   File : helpers/response.js
   Description : Response Helpers
========================================================== */

import { config, getAllowedOrigins } from "./config.js";

/* ==========================================================
   CORS
========================================================== */

export function corsHeaders(env) {

    const origins = getAllowedOrigins(env);
    const origin = env.REQUEST_ORIGIN || "";

    return {

        "Access-Control-Allow-Origin":
            origins.includes(origin)
                ? origin
                : origins[0],

        "Access-Control-Allow-Methods":
            "GET,POST,OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type, Authorization",

        "Access-Control-Allow-Credentials":
            "true",

        "Access-Control-Max-Age":
            "86400",

        "Vary":
            "Origin"

    };

}

/* ==========================================================
   JSON RESPONSE
========================================================== */

export function jsonResponse(env, data, status = 200) {

    return new Response(

        JSON.stringify(data),

        {

            status,

            headers: {

                "Content-Type":
                    "application/json; charset=utf-8",

                ...corsHeaders(env)

            }

        }

    );

}

/* ==========================================================
   SUCCESS
========================================================== */

export function success(env, data = {}, status = 200) {

    const cfg = config(env);

    return jsonResponse(

        env,

        {

            success: true,

            app: cfg.APP_NAME,

            version: cfg.APP_VERSION,

            ...data

        },

        status

    );

}

/* ==========================================================
   ERROR
========================================================== */

export function error(
    env,
    message = "Unknown Error",
    status = 500,
    extra = {}
) {

    const cfg = config(env);

    return jsonResponse(

        env,

        {

            success: false,

            app: cfg.APP_NAME,

            version: cfg.APP_VERSION,

            message,

            ...extra

        },

        status

    );

}