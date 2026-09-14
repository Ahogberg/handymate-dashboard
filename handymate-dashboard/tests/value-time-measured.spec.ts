import { test, expect } from '@playwright/test'
import { measureElapsedMinutes, timeObservation, sumValueTime } from '../lib/value/time-measured'
test('timestamp differences are elapsed time; missing, reversed and invalid pairs never become measured',()=>{
 expect(measureElapsedMinutes('2026-08-02T10:00:00Z','2026-08-02T10:02:30Z')).toBe(2.5)
 for(const pair of [[null,'2026-08-02'],['invalid','2026-08-02'],['2026-08-03','2026-08-02']]) {
 expect(timeObservation(pair[0],pair[1],6)).toMatchObject({minutes:6,minutes_basis:'estimate',metric:'estimated_labour_minutes'})
 }
 expect(timeObservation('2026-08-02','2026-08-03',6)).toMatchObject({minutes:1440,minutes_basis:'measured',metric:'elapsed_minutes'})
})
test('measured and estimated totals remain distinct and have no money field',()=>{
 expect(sumValueTime([{event_type:'time_measured',minutes:60},{event_type:'time_estimated',minutes:5}])).toEqual({
 measured_minutes:60,estimated_minutes:5,measured_minutes_basis:'elapsed_workflow_time_not_labour_saved'})
})
