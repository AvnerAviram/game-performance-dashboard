import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiPost, apiPatch, apiDelete, ApiError } from '../../src/lib/api-client.js';

describe('api-client', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('apiFetch', () => {
        it('returns parsed JSON on success', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ data: 42 }),
            });
            const result = await apiFetch('/api/test');
            expect(result).toEqual({ data: 42 });
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/test',
                expect.objectContaining({
                    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                })
            );
        });

        it('throws ApiError on non-ok response', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ error: 'Invalid credentials' }),
            });
            await expect(apiFetch('/api/login')).rejects.toThrow(ApiError);
            try {
                await apiFetch('/api/login');
            } catch (e) {
                expect(e.status).toBe(401);
                expect(e.message).toBe('Invalid credentials');
            }
        });

        it('handles text responses', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => 'text/plain' },
                text: () => Promise.resolve('OK'),
            });
            const result = await apiFetch('/health');
            expect(result).toBe('OK');
        });

        it('propagates fetch network errors', async () => {
            global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
            await expect(apiFetch('/api/data')).rejects.toThrow('Failed to fetch');
        });
    });

    describe('apiPost', () => {
        it('sends POST with JSON body', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ id: 1 }),
            });
            const result = await apiPost('/api/items', { name: 'test' });
            expect(result).toEqual({ id: 1 });
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/items',
                expect.objectContaining({
                    method: 'POST',
                    body: '{"name":"test"}',
                })
            );
        });
    });

    describe('apiPatch', () => {
        it('sends PATCH with JSON body', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ updated: true }),
            });
            await apiPatch('/api/items/1', { status: 'done' });
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/items/1',
                expect.objectContaining({
                    method: 'PATCH',
                    body: '{"status":"done"}',
                })
            );
        });
    });

    describe('apiDelete', () => {
        it('sends DELETE request', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ deleted: true }),
            });
            await apiDelete('/api/items/1');
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/items/1',
                expect.objectContaining({
                    method: 'DELETE',
                })
            );
        });
    });
});
