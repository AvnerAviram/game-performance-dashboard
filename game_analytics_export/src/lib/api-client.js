/**
 * Shared API client — wraps fetch with consistent JSON handling,
 * error normalization, and authentication error detection.
 */

export class ApiError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

/**
 * Fetch JSON from an API endpoint with standardized error handling.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>} parsed JSON body
 * @throws {ApiError} on non-ok response
 */
export async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    let body;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        body = await res.json();
    } else {
        body = await res.text();
    }

    if (!res.ok) {
        const msg = typeof body === 'object' ? (body.error || body.message || res.statusText) : res.statusText;
        throw new ApiError(msg, res.status, body);
    }

    return body;
}

/**
 * POST JSON to an API endpoint.
 * @param {string} url
 * @param {object} data
 * @returns {Promise<any>}
 */
export async function apiPost(url, data) {
    return apiFetch(url, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * PATCH JSON to an API endpoint.
 * @param {string} url
 * @param {object} data
 * @returns {Promise<any>}
 */
export async function apiPatch(url, data) {
    return apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}

/**
 * DELETE an API resource.
 * @param {string} url
 * @returns {Promise<any>}
 */
export async function apiDelete(url) {
    return apiFetch(url, { method: 'DELETE' });
}
