/* ==========================================================
   ALEXA API
   File : helpers/firestore.js
   Description : Firestore REST Helpers
========================================================== */

import { getAccessToken, projectId } from "./auth.js";

/* ==========================================================
   BASE
========================================================== */

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects";

/* ==========================================================
   URL
========================================================== */

function firestoreUrl(env, docPath) {
    return `${FIRESTORE_BASE}/${projectId(env)}/databases/(default)/documents/${docPath}`;
}

function runQueryUrl(env) {
    return `${FIRESTORE_BASE}/${projectId(env)}/databases/(default)/documents:runQuery`;
}

/* ==========================================================
   ENCODE
========================================================== */

function encodeValue(value) {
    if (value === null) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };

    if (typeof value === "number") {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }

    if (value instanceof Date) {
        return { timestampValue: value.toISOString() };
    }

    if (Array.isArray(value)) {
        return {
            arrayValue: {
                values: value.map(encodeValue)
            }
        };
    }

    if (typeof value === "object") {
        return {
            mapValue: {
                fields: encodeFields(value)
            }
        };
    }

    return { stringValue: String(value) };
}

function encodeFields(obj = {}) {
    const fields = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value === undefined) continue;
        fields[key] = encodeValue(value);
    }
    return fields;
}

/* ==========================================================
   DECODE
========================================================== */

function decodeValue(value) {
    if (!value || typeof value !== "object") return null;

    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return Number(value.integerValue);
    if (value.doubleValue !== undefined) return Number(value.doubleValue);
    if (value.booleanValue !== undefined) return Boolean(value.booleanValue);
    if (value.nullValue !== undefined) return null;
    if (value.timestampValue !== undefined) return value.timestampValue;

    if (value.arrayValue) {
        return (value.arrayValue.values || []).map(decodeValue);
    }

    if (value.mapValue) {
        return decodeFields(value.mapValue.fields || {});
    }

    return null;
}

function decodeFields(fields = {}) {
    const obj = {};
    for (const key of Object.keys(fields)) {
        obj[key] = decodeValue(fields[key]);
    }
    return obj;
}

/* ==========================================================
   DOCUMENTS
========================================================== */

export async function getDocument(env, docPath) {
    const token = await getAccessToken(env);

    const response = await fetch(firestoreUrl(env, docPath), {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore GET failed${text ? `: ${text}` : ""}`);
    }

    const json = await response.json();
    return decodeFields(json.fields || {});
}

export async function patchDocument(env, docPath, data) {
    const token = await getAccessToken(env);

    const response = await fetch(firestoreUrl(env, docPath), {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: encodeFields(data)
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore PATCH failed${text ? `: ${text}` : ""}`);
    }

    return true;
}

export async function setDocument(env, docPath, data) {
    return patchDocument(env, docPath, data);
}

export async function deleteDocument(env, docPath) {
    const token = await getAccessToken(env);

    const response = await fetch(firestoreUrl(env, docPath), {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore DELETE failed${text ? `: ${text}` : ""}`);
    }

    return true;
}

/* ==========================================================
   QUERY
========================================================== */

export async function runQuery(env, structuredQuery) {
    const token = await getAccessToken(env);

    const response = await fetch(runQueryUrl(env), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ structuredQuery })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore Query Failed${text ? `: ${text}` : ""}`);
    }

    const result = await response.json();

    return result
        .filter(item => item?.document)
        .map(item => ({
            name: item.document.name || "",
            createTime: item.document.createTime || "",
            updateTime: item.document.updateTime || "",
            id: (item.document.name || "").split("/").pop() || "",
            ...decodeFields(item.document.fields || {})
        }));
}

/* ==========================================================
   EXPORTS (OPTIONAL)
========================================================== */

export {
    encodeValue,
    encodeFields,
    decodeValue,
    decodeFields
};