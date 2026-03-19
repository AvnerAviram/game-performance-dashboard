import { describe, it, expect, vi } from 'vitest';
import { debounce } from '../../src/lib/debounce.js';

describe('debounce', () => {
    it('delays execution', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        await new Promise(r => setTimeout(r, 60));
        expect(fn).toHaveBeenCalledOnce();
    });

    it('resets timer on rapid calls', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced('a');
        debounced('b');
        debounced('c');

        await new Promise(r => setTimeout(r, 60));
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith('c');
    });

    it('passes arguments through', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 20);

        debounced(1, 'two', { three: 3 });
        await new Promise(r => setTimeout(r, 30));

        expect(fn).toHaveBeenCalledWith(1, 'two', { three: 3 });
    });

    it('defaults to 300ms', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn);

        debounced();
        await new Promise(r => setTimeout(r, 100));
        expect(fn).not.toHaveBeenCalled();

        await new Promise(r => setTimeout(r, 250));
        expect(fn).toHaveBeenCalledOnce();
    });

    it('allows multiple independent debounced calls after timeout', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 30);

        debounced('first');
        await new Promise(r => setTimeout(r, 40));
        expect(fn).toHaveBeenCalledWith('first');

        debounced('second');
        await new Promise(r => setTimeout(r, 40));
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('second');
    });
});
