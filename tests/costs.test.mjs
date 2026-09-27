
import test from 'node:test';
import assert from 'node:assert/strict';
import { cigaretteCost } from '../src/costs.js';

test('Ohne vollständige Preisangaben wird kein Betrag behauptet', () => {
  assert.equal(cigaretteCost(10), null);
  assert.equal(cigaretteCost(10, {packPrice:8.5}), null);
  assert.equal(cigaretteCost(10, {packSize:20}), null);
});

test('Eine Packung entspricht dem Packungspreis', () => {
  assert.equal(cigaretteCost(20, {packPrice:8.5,packSize:20}), 850);
});

test('Teilpackungen werden am Gesamtbetrag gerundet', () => {
  assert.equal(cigaretteCost(7, {packPrice:8.5,packSize:20}), 298);
});

test('Null erfasste Zigaretten ergeben null Cent', () => {
  assert.equal(cigaretteCost(0, {packPrice:8.5,packSize:20}), 0);
});

test('Ungültige Mengen und Preise werden abgewiesen', () => {
  assert.throws(() => cigaretteCost(-1));
  assert.throws(() => cigaretteCost(1.5));
  assert.throws(() => cigaretteCost(10, {packPrice:-2,packSize:20}));
  assert.throws(() => cigaretteCost(10, {packPrice:8.5,packSize:0}));
});

test('Große Mengen werden korrekt berechnet', () => {
  assert.equal(cigaretteCost(10000, {packPrice:8.5,packSize:20}), 425000);
});
