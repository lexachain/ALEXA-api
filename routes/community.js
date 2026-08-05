/* ==========================================================
   ALEXA API
   File : routes/community.js
   Description : Community Routes
========================================================== */

import { success, error } from "../helpers/response.js";
import { requireUser, checkRateLimit } from "../helpers/security.js";
import { uploadCommunityImageToR2 } from "../helpers/upload.js";

/* ==========================================================
   ROUTE
========================================================== */

export async function communityRoute(env, request, path) {

    try {

        const method = request.method.toUpperCase();

        switch (path) {

            case "/community/upload":

                if (method === "POST") {

                    if (!checkRateLimit(request)) {
                        return error(env, "Too many requests.", 429);
                    }

                    return communityUploadImage(env, request);
                }

                break;

            default:
                return error(env, "Community route not found.", 404);

        }

    } catch (err) {

        return error(
            env,
            err?.message || "Internal Error",
            500
        );

    }

}

/* ==========================================================
   POST /community/upload
========================================================== */

async function communityUploadImage(env, request) {

    const auth = await requireUser(env, request);

    if (!auth?.uid) {
        return error(env, "Unauthorized.", 401);
    }

    const form = await request.formData();

    const image = form.get("image");

    if (!image) {
        return error(env, "Image is required.", 400);
    }

    const uploaded = await uploadCommunityImageToR2(
        env,
        image,
        {
            customMetadata: {
                uid: auth.uid
            }
        }
    );

    return success(env, {
        imageUrl: uploaded.url,
        key: uploaded.key,
        mimeType: uploaded.mimeType,
        size: uploaded.size
    });

}