/**
 * Phase 6: Game Lab QA
 *
 * Validates RTP band metrics structure and boundary integrity.
 * Feature recipes and combos were removed in Phase 2 (SQL migration).
 */
import { describe, it, expect } from 'vitest';
import { RTP_BANDS } from '../../src/lib/metrics.js';

describe('RTP Band QA', () => {
    it('RTP_BANDS covers full range', () => {
        expect(RTP_BANDS.length).toBeGreaterThanOrEqual(4);
        expect(RTP_BANDS[0].min).toBe(97);
        expect(RTP_BANDS[RTP_BANDS.length - 1].max).toBe(93);
    });

    it('RTP bands have correct boundary ranges', () => {
        for (const b of RTP_BANDS) {
            expect(b.min).toBeLessThan(b.max);
            expect(b.label).toBeTruthy();
        }
    });

    it('RTP bands do not overlap', () => {
        for (let i = 0; i < RTP_BANDS.length - 1; i++) {
            expect(RTP_BANDS[i].min).toBe(RTP_BANDS[i + 1].max);
        }
    });
});
