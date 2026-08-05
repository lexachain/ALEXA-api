/* ==========================================================
   ALEXA API
   File : helpers/upload.js
   Description : R2 Image Upload Helpers
========================================================== */

import { config } from "./config.js";

/* ==========================================================
   CONSTANTS
========================================================== */

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp"
]);

const DEFAULT_AVATAR_MAX_BYTES = 3 * 1024 * 1024;      // 3 MB
const DEFAULT_COMMUNITY_MAX_BYTES = 8 * 1024 * 1024;   // 8 MB

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

/* ==========================================================
   BASIC HELPERS
========================================================== */

function randomHex(length = 12) {
    const byteLength = Math.max(1, Math.ceil(length / 2));
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, length);
}

function sanitizeSegment(value, fallback = "item") {
    const text = String(value ?? "").trim();

    const clean = text
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");

    return clean || fallback;
}

function sanitizePath(value, fallback = "item") {
    return String(value ?? "")
        .split("/")
        .map((part) => sanitizeSegment(part, fallback))
        .filter(Boolean)
        .join("/");
}

function getExtensionFromMimeType(mimeType) {
    switch (String(mimeType || "").toLowerCase()) {
        case "image/png":
            return "png";
        case "image/jpeg":
            return "jpg";
        case "image/webp":
            return "webp";
        default:
            return "bin";
    }
}

function normalizeMimeType(mimeType) {
    return String(mimeType || "").trim().toLowerCase();
}

function isAllowedImageMimeType(mimeType, allowedMimeTypes = ALLOWED_IMAGE_MIME_TYPES) {
    return allowedMimeTypes.has(normalizeMimeType(mimeType));
}

function buildR2PublicUrl(env, key) {
    const base = config(env)?.R2_PUBLIC_URL || "";
    if (!base) {
        throw new Error("R2_PUBLIC_URL is missing.");
    }

    const cleanBase = String(base).trim().replace(/\/+$/, "");
    const cleanKey = String(key || "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

    return `${cleanBase}/${cleanKey}`;
}

async function deleteR2ObjectsByPrefix(env, prefix, keepKey = null) {
    if (!env?.STORAGE?.list || !env?.STORAGE?.delete) {
        return [];
    }

    const listed = await env.STORAGE.list({
        prefix: String(prefix || "")
    });

    const keys = (listed?.objects || [])
        .map((item) => item?.key)
        .filter(Boolean)
        .filter((key) => key !== keepKey);

    if (!keys.length) return [];

    await Promise.all(
        keys.map((key) =>
            env.STORAGE.delete(key).catch(() => null)
        )
    );

    return keys;
}

async function validateImageFile(file, {
    fieldName = "image",
    maxBytes = DEFAULT_COMMUNITY_MAX_BYTES,
    allowedMimeTypes = ALLOWED_IMAGE_MIME_TYPES
} = {}) {
    if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
        throw new Error(`${fieldName} file is required.`);
    }

    const mimeType = normalizeMimeType(file.type);

    if (!isAllowedImageMimeType(mimeType, allowedMimeTypes)) {
        throw new Error("Only PNG, JPEG, and WEBP images are allowed.");
    }

    const size = Number(file.size || 0);
    if (!Number.isFinite(size) || size <= 0) {
        throw new Error("Uploaded file is invalid.");
    }

    if (size > maxBytes) {
        const mb = Math.max(1, Math.floor(maxBytes / (1024 * 1024)));
        throw new Error(`Image size must be under ${mb} MB.`);
    }

    return {
        mimeType,
        size,
        originalName: String(file.name || "").trim()
    };
}

async function putImageToR2(env, key, file, {
    mimeType,
    cacheControl = DEFAULT_CACHE_CONTROL,
    customMetadata = {}
} = {}) {
    if (!env?.STORAGE?.put) {
        throw new Error("STORAGE binding is not available.");
    }

    const bytes = await file.arrayBuffer();

    await env.STORAGE.put(key, bytes, {
        httpMetadata: {
            contentType: mimeType,
            cacheControl
        },
        customMetadata: {
            ...customMetadata,
            uploadedAt: String(Date.now())
        }
    });

    return buildR2PublicUrl(env, key);
}

function buildObjectKey({
    folder,
    scope = "",
    fileBase = "",
    extension = "bin"
}) {
    const safeFolder = sanitizePath(folder, "uploads");
    const safeScope = scope ? sanitizePath(scope, "") : "";
    const safeBase = sanitizeSegment(fileBase || `${Date.now()}-${randomHex(12)}`, "file");
    const safeExt = sanitizeSegment(extension, "bin");

    const parts = [safeFolder];
    if (safeScope) parts.push(safeScope);
    parts.push(`${safeBase}.${safeExt}`);

    return parts.join("/");
}

async function uploadImageToR2(env, file, {
    folder,
    scope = "",
    fieldName = "image",
    maxBytes = DEFAULT_COMMUNITY_MAX_BYTES,
    allowedMimeTypes = ALLOWED_IMAGE_MIME_TYPES,
    cacheControl = DEFAULT_CACHE_CONTROL,
    customMetadata = {},
    cleanupPrefix = null,
    fileBase = "",
    mimeTypeOverride = null
} = {}) {
    const info = await validateImageFile(file, {
        fieldName,
        maxBytes,
        allowedMimeTypes
    });

    const mimeType = normalizeMimeType(mimeTypeOverride || info.mimeType);
    const extension = getExtensionFromMimeType(mimeType);
    const key = buildObjectKey({
        folder,
        scope,
        fileBase: fileBase || `${Date.now()}-${randomHex(12)}`,
        extension
    });

    const url = await putImageToR2(env, key, file, {
        mimeType,
        cacheControl,
        customMetadata: {
            ...customMetadata,
            fileName: info.originalName || "",
            fileSize: String(info.size),
            mimeType
        }
    });

    let deletedKeys = [];
    if (cleanupPrefix) {
        deletedKeys = await deleteR2ObjectsByPrefix(env, cleanupPrefix, key);
    }

    return {
        key,
        url,
        mimeType,
        size: info.size,
        fileName: info.originalName,
        deletedKeys
    };
}

/* ==========================================================
   PUBLIC API
========================================================== */

export async function uploadAvatarToR2(env, uid, file, options = {}) {
    if (!uid) {
        throw new Error("uid is required.");
    }

    const safeUid = sanitizeSegment(uid, "user");

    return uploadImageToR2(env, file, {
        folder: "avatar",
        scope: safeUid,
        fieldName: "avatar",
        maxBytes: options.maxBytes ?? DEFAULT_AVATAR_MAX_BYTES,
        allowedMimeTypes: options.allowedMimeTypes ?? ALLOWED_IMAGE_MIME_TYPES,
        cacheControl: options.cacheControl || DEFAULT_CACHE_CONTROL,
        cleanupPrefix: `avatar/${safeUid}/`,
        fileBase: options.fileBase || `${Date.now()}-${randomHex(12)}`,
        customMetadata: {
            purpose: "avatar",
            uid: String(uid),
            ...(options.customMetadata || {})
        }
    });
}

export async function uploadCommunityImageToR2(env, file, options = {}) {
    const scopeParts = [];

    if (options.channelId) {
        scopeParts.push(sanitizeSegment(options.channelId, "channel"));
    }

    if (options.messageId) {
        scopeParts.push(sanitizeSegment(options.messageId, "message"));
    }

    const scope = scopeParts.join("/");

    return uploadImageToR2(env, file, {
        folder: "community",
        scope,
        fieldName: options.fieldName || "image",
        maxBytes: options.maxBytes ?? DEFAULT_COMMUNITY_MAX_BYTES,
        allowedMimeTypes: options.allowedMimeTypes ?? ALLOWED_IMAGE_MIME_TYPES,
        cacheControl: options.cacheControl || DEFAULT_CACHE_CONTROL,
        fileBase: options.fileBase || `${Date.now()}-${randomHex(12)}`,
        customMetadata: {
            purpose: "community",
            ...(options.channelId ? { channelId: String(options.channelId) } : {}),
            ...(options.messageId ? { messageId: String(options.messageId) } : {}),
            ...(options.customMetadata || {})
        }
    });
}

export async function deleteAvatarFromR2(env, uid) {
    if (!uid) {
        throw new Error("uid is required.");
    }

    const safeUid = sanitizeSegment(uid, "user");
    const prefix = `avatar/${safeUid}/`;

    return deleteR2ObjectsByPrefix(env, prefix);
}

export {
    buildR2PublicUrl,
    deleteR2ObjectsByPrefix,
    sanitizeSegment,
    sanitizePath
};