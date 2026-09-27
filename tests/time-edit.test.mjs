
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, addEvent, correctEventTime, resolveEditedTime, localMinute, validateState, history } from '../src/core.js';
process.env.TZ = 'Europe/Berlin';
const now = new Date('2026-09-21T16:00:00+02:00');
function state() { const s=initialState(new Date('2026-09-21T12:00:35.123+02:00')); addEvent(s,'cigarette',new Date('2026-09-21T12:00:45.987+02:00')); return s; }
test('Unveraenderte Minute behaelt Sekunden und Millisekunden',()=>{ const original=state().events[0].timestamp; assert.equal(resolveEditedTime(original,localMinute(original),now),original); });
test('Korrektur vor App-Start innerhalb des ersten Tages funktioniert',()=>{ const s=state(),created=s.createdAt; correctEventTime(s,s.events[0].id,'2026-09-21T06:00:00.000Z',now); validateState(s,now); assert.equal(s.createdAt,created); assert.equal(history(s,now)[0].partial,true); });
test('Korrektur vor dem ersten Tag wird ohne Mutation abgelehnt',()=>{ const s=state(),before=JSON.stringify(s); assert.throws(()=>correctEventTime(s,s.events[0].id,'2026-09-20T06:00:00.000Z',now),/ersten erfassten Tages/); assert.equal(JSON.stringify(s),before); });
test('Zukunft wird abgelehnt',()=>{ assert.throws(()=>resolveEditedTime(state().events[0].timestamp,'2026-09-22T10:00',now),/Zukunft/); });
test('Nicht existierende Sommerzeit-Uhrzeit wird abgelehnt',()=>{ assert.throws(()=>resolveEditedTime('2026-03-28T10:00:00.000Z','2026-03-29T02:30',now),/Zeitumstellung/); });
test('Unveraenderte doppelte Herbststunde behaelt ihren UTC-Zeitpunkt',()=>{ const original='2026-10-25T01:30:45.123Z'; assert.equal(resolveEditedTime(original,localMinute(original),new Date('2026-10-26')),original); });
test('Parallele Korrektur eines geaenderten Eintrags wird abgelehnt',()=>{ const s=state(); assert.throws(()=>correctEventTime(s,s.events[0].id,'2026-09-21T06:00:00.000Z',now,'2026-09-21T11:00:00.000Z'),/inzwischen/); });
test('Korrektur ueber Tagesgrenze entfernt beide Tagesbestaetigungen',()=>{ const s=initialState(new Date('2026-09-18T08:00:00+02:00')); addEvent(s,'cigarette',new Date('2026-09-19T12:00:00+02:00')); const days=history(s,now); s.completeDays=[days[1].start.toISOString(),days[2].start.toISOString()]; correctEventTime(s,s.events[0].id,'2026-09-20T10:00:00.000Z',now); assert.deepEqual(s.completeDays,[]); validateState(s,now); });
