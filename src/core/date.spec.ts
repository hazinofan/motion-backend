import {describe,expect,it} from 'vitest';
import {addDays,dateOnly,dayDifference} from './validate.js';
describe('local date helpers',()=>{
 it('advances across month boundaries',()=>expect(addDays('2026-10-31',1)).toBe('2026-11-01'));
 it('computes days remaining across years',()=>expect(dayDifference('2027-01-31','2026-10-28')).toBe(95));
 it('rejects impossible calendar dates',()=>expect(()=>dateOnly('2026-02-30')).toThrow());
});
