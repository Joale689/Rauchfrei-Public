import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, validateState, dayAt, summary, history, addEvent, startDay, importBackup, createStore, APP } from '../src/core.js';
process.env.TZ = 'Europe/Berlin';
const date = s => new Date(s);
const now = date('2026-09-21T12:00:00+02:00');
const fresh = () => initialState(now);
const memory = () => { const data = new Map(); return { data, getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value) }; };
test('05-Uhr-Grenze funktioniert vor und nach Mitternacht', () => {
  const s = initialState(date('2026-09-20T08:00:00+02:00'));
  assert.equal(dayAt(s, date('2026-09-21T04:59:00+02:00')).start.toISOString(), '2026-09-20T03:00:00.000Z');
  assert.equal(dayAt(s, date('2026-09-21T05:00:00+02:00')).start.toISOString(), '2026-09-21T03:00:00.000Z');
});
test('Sommerzeit: automatische Tage haben 23 bzw. 25 Stunden', () => {
  for (const [stamp,hours] of [['2026-03-28T12:00:00+01:00',23], ['2026-10-24T12:00:00+02:00',25]]) {
    const when=date(stamp), s=initialState(when), p=dayAt(s,when);
    assert.equal((p.end-p.start)/3600000,hours);
    assert.equal(p.end.getHours(),5);
  }
});
test('Tagesgrenze in übersprungener Stunde bleibt lückenlos', () => {
  const s=initialState(date('2026-03-28T12:00:00+01:00'),2);
  const first=dayAt(s,date('2026-03-28T12:00:00+01:00'));
  assert.equal(dayAt(s,date('2026-03-29T01:59:00+01:00')).start.getTime(),first.start.getTime());
  const next=dayAt(s,first.end);
  assert.equal(next.start.getTime(),first.end.getTime());
  assert.ok(next.end>next.start);
});
test('Doppelte Herbststunde erzeugt keinen zweiten automatischen Tag', () => {
  const s=initialState(date('2026-10-24T12:00:00+02:00'),2);
  const early=dayAt(s,date('2026-10-25T02:30:00+02:00'));
  const late=dayAt(s,date('2026-10-25T02:30:00+01:00'));
  assert.equal(early.start.getTime(),late.start.getTime());
  assert.equal((late.end-late.start)/3600000,25);
});
test('Manueller Start braucht keine Zigarette und verschiebt künftige Grenze', () => {
  const s=fresh(); startDay(s,now);
  const p=dayAt(s,now);
  assert.equal(p.start.toISOString(),now.toISOString());
  assert.equal(s.events.length,0);
  assert.equal(dayAt(s,date('2026-09-22T13:00:00+02:00')).start.getHours(),12);
  assert.equal(dayAt(s,new Date(now.getTime()-1)).end.toISOString(),now.toISOString());
});
test('Doppeltipp auf Tagesbeginn wird abgefangen', () => {
  const s=fresh(); startDay(s,now);
  assert.throws(()=>startDay(s,new Date(+now+60000)),/zehn Minuten/);
});
test('Leere Tage bleiben unbekannt, vollständiger Nulltag muss bestätigt werden', () => {
  const s=initialState(date('2026-09-18T12:00:00+02:00'));
  const days=history(s,now);
  assert.equal(days.length,4);
  assert.equal(days[1].complete,false);
  s.completeDays.push(days[1].start.toISOString());
  const checked=validateState(s,now);
  assert.equal(history(checked,now)[1].complete,true);
  assert.equal(history(checked,now)[1].cigarettes,0);
  assert.equal(days.at(-1).partial,true);
});
test('Laufender Tag darf nicht als abgeschlossen bestätigt werden', () => {
  const s=fresh(); s.completeDays=[dayAt(s,now).start.toISOString()];
  assert.throws(()=>validateState(s,now),/abgeschlossene Tage/);
});
test('Ereignis auf Tagesgrenze zählt ausschließlich zum neuen Tag', () => {
  const s=initialState(date('2026-09-20T08:00:00+02:00'));
  addEvent(s,'cigarette',date('2026-09-21T05:00:00+02:00'));
  const days=history(s,now);
  assert.equal(days[0].cigarettes,1); assert.equal(days[1].cigarettes,0);
});
test('Unsortierte persönliche Backups werden chronologisch übernommen', () => {
  const events=[{type:'cigarette',timestamp:'2026-09-21T08:00:00.000Z'}, {type:'first-cigarette',timestamp:'2026-09-20T06:00:00.000Z'}];
  const {state:s,legacy}=importBackup(JSON.stringify({app:'Rauchfrei',events}),now);
  assert.equal(legacy,true); assert.equal(s.events[0].timestamp,events[1].timestamp);
  assert.equal(history(s,now)[0].cigarettes,1); assert.deepEqual(s.completeDays,[]);
});
test('Leeres persönliches Backup ist gültig', () => {
  assert.equal(importBackup(JSON.stringify({app:'Rauchfrei',events:[]}),now).state.events.length,0);
});
test('Import lehnt Zukunft, unbekannten Typ und ungültiges Datum ab', () => {
  for (const event of [{type:'cigarette',timestamp:'2026-09-22T12:00:00.000Z'}, {type:'unknown',timestamp:now.toISOString()}, {type:'vape',timestamp:'2026-02-30T01:00:00.000Z'}]) {
    assert.throws(()=>importBackup(JSON.stringify({app:'Rauchfrei',events:[event]}),now));
  }
});
test('Doppelte IDs, falsche Schema-Version und fremde Zeitzone werden abgewiesen', () => {
  let s=fresh();addEvent(s,'vape',now);s.events.push({...s.events[0]});assert.throws(()=>validateState(s,now),/doppelte/);
  s=fresh();s.schema=99;assert.throws(()=>validateState(s,now),/Dateiformat/);
  s=fresh();s.timezone='Pacific/Honolulu';assert.throws(()=>validateState(s,now),/Zeitzone/);
});
test('Export/Import-Rundlauf erhält Daten und Bestätigungen', () => {
  const s=initialState(date('2026-09-19T08:00:00+02:00'));addEvent(s,'cigarette',now);s.completeDays=[history(s,now)[1].start.toISOString()];
  assert.deepEqual(importBackup(JSON.stringify(s),now).state,s);
});
test('Defekter Speicher wird weder geleert noch überschrieben', () => {
  const mem=memory();mem.setItem('key','{broken');const store=createStore(mem,'key');
  assert.throws(()=>store.read(now),/bleiben erhalten/);assert.throws(()=>store.write(fresh(),null,now));assert.equal(mem.getItem('key'),'{broken');
});
test('Speicher voll: letzter gültiger Stand bleibt unverändert', () => {
  const mem=memory(),store=createStore(mem,'key');const saved=store.write(fresh(),null,now);const raw=mem.getItem('key');
  mem.setItem=()=>{throw Error('QuotaExceededError');};addEvent(saved,'cigarette',now);
  assert.throws(()=>store.write(saved,saved.revision,now),/nicht übernommen/);assert.equal(mem.getItem('key'),raw);
});
test('Import legt vor Überschreiben eine lokale Sicherung an', () => {
  const mem=memory(),store=createStore(mem,'key');store.write(fresh(),null,now);const raw=mem.getItem('key');
  const next=fresh();addEvent(next,'vape',now);store.replace(next,now);
  assert.equal(mem.getItem('key:before-import'),raw);assert.equal(store.read(now).events.length,1);
});
test('Fehlgeschlagene Importsicherung verhindert das Ersetzen', () => {
  const mem=memory(),store=createStore(mem,'key');store.write(fresh(),null,now);const raw=mem.getItem('key');
  mem.setItem=()=>{throw Error('Quota');};assert.throws(()=>store.replace(fresh(),now),/Import abgebrochen/);assert.equal(mem.getItem('key'),raw);
});
test('Veralteter Datenstand aus zweitem Tab überschreibt nichts', () => {
  const mem=memory(),store=createStore(mem,'key');const stale=store.write(fresh(),null,now);const next=structuredClone(stale);addEvent(next,'vape',now);store.write(next,stale.revision,now);
  assert.throws(()=>store.write(stale,stale.revision,now),/anderen Fenster/);assert.equal(store.read(now).events.length,1);
});
test('Persönlicher Speicher bleibt unangetastet', () => {
  const mem=memory();mem.setItem('rauchfrei_v1_events','private');const store=createStore(mem,'rauchfrei_public_v1:/');store.write(fresh(),null,now);
  assert.equal(mem.getItem('rauchfrei_v1_events'),'private');assert.equal(store.read(now).app,APP);
});
