
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/profile.js';
import { initialState, validateState, importBackup } from '../src/core.js';

test('Leeres Profil verwendet neutrale Vorgaben', () => {
  const p = validateProfile();
  assert.equal(p.mode, 'observe');
  assert.equal(p.packPrice, null);
  assert.equal(p.reasons, '');
});

test('Profil bleibt bei Prüfung und Backup-Import erhalten', () => {
  const s = initialState();
  s.profile = validateProfile({
    mode:'reduce', reasons:'Mehr Zeit mit meiner Familie',
    packPrice:8.5, packSize:20
  });
  assert.deepEqual(validateState(s).profile, s.profile);
  assert.deepEqual(importBackup(JSON.stringify(s)).state.profile, s.profile);
});

test('Bestehende Daten ohne Profil bleiben gültig', () => {
  const s = initialState();
  assert.deepEqual(validateState(s), s);
});

test('Ungültige Zahlen und unbekannte Wege werden abgewiesen', () => {
  for (const p of [
    {packPrice:-1}, {packPrice:NaN}, {packSize:2.5},
    {mode:'unknown'}, {reasons:42}
  ]) assert.throws(() => validateProfile(p));
});

test('Ungültiges Datum wird abgewiesen', () => {
  assert.throws(() => validateProfile({quitDate:'2026-02-30'}));
  assert.equal(validateProfile({quitDate:'2026-09-21'}).quitDate,'2026-09-21');
});

test('Profiländerung verändert keine Rauchereignisse', () => {
  const s = initialState();
  const events = JSON.stringify(s.events);
  const starts = JSON.stringify(s.dayStarts);
  s.profile = validateProfile({mode:'smoke-free'});
  const checked = validateState(s);
  assert.equal(JSON.stringify(checked.events),events);
  assert.equal(JSON.stringify(checked.dayStarts),starts);
});
