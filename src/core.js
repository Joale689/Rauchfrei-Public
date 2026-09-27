import { validateProfile } from './profile.js';
export const APP = 'Rauchfrei-Public';
export const VERSION = 1;
export const MAX_EVENTS = 10000;
export const MAX_BYTES = 2 * 1024 * 1024;
export const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const uid = () => crypto.randomUUID();
const fail = message => { throw new Error(message); };
const time = value => new Date(value).getTime();
const sort = rows => rows.sort((a, b) => time(a.timestamp) - time(b.timestamp));

function timestamp(value, now, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(time(value)) || new Date(value).toISOString() !== value)
    fail(`${label}: Ein gültiger UTC-Zeitstempel wird benötigt.`);
  if (time(value) > now.getTime()) fail(`${label}: Ein Zeitpunkt liegt in der Zukunft. Bitte Gerätezeit und Datei prüfen.`);
  return value;
}

export function initialState(now = new Date(), hour = 5) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) fail('Ungültige Tagesgrenze.');
  const start = new Date(now);
  start.setHours(hour, 0, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return { app: APP, schema: VERSION, revision: 0, createdAt: now.toISOString(), timezone: zone(),
    events: [], dayStarts: [{ id: uid(), timestamp: start.toISOString() }], completeDays: [] };
}

export function validateState(input, now = new Date()) {
  if (!input || input.app !== APP || input.schema !== VERSION) fail('Dieses Dateiformat wird nicht unterstützt.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('Ungültiger Datenstand.');
  if (input.timezone !== zone()) fail(`Diese Daten gehören zur Zeitzone ${String(input.timezone).slice(0,60)}. Diese Testversion benötigt dieselbe Gerätezeitzone; es wird nichts überschrieben.`);
  const createdAt = timestamp(input.createdAt, now, 'Erfassungsbeginn');
  const ids = new Set();
  function rows(values, events) {
    if (!Array.isArray(values) || values.length > MAX_EVENTS) fail('Zu viele oder ungültige Einträge.');
    return sort(values.map(row => {
      if (!row || typeof row.id !== 'string' || !row.id.length || row.id.length > 100 || ids.has(row.id)) fail('Fehlende oder doppelte Eintrags-ID.');
      ids.add(row.id);
      const result = { id: row.id, timestamp: timestamp(row.timestamp, now, 'Eintrag') };
      if (events) {
        if (!['cigarette', 'vape'].includes(row.type)) fail('Unbekannte Eintragsart.');
        result.type = row.type;
      }
      return result;
    }));
  }
  const events = rows(input.events, true);
  const dayStarts = rows(input.dayStarts, false);
  if (!dayStarts.length || time(dayStarts[0].timestamp) > time(createdAt)) fail('Der erste Tagesbeginn fehlt.');
  if (events.some(e => time(e.timestamp) < time(dayStarts[0].timestamp))) fail('Eintrag liegt vor dem ersten erfassten Tag.');
  if (new Set(dayStarts.map(row => row.timestamp)).size !== dayStarts.length) fail('Doppelte Tagesgrenze.');
  if (dayStarts.slice(1).some(row => time(row.timestamp) < time(createdAt))) fail('Tagesbeginn liegt vor dem Erfassungsbeginn.');
  if (!Array.isArray(input.completeDays) || input.completeDays.length > MAX_EVENTS) fail('Ungültige Tagesbestätigungen.');
  const state = { app: APP, schema: VERSION, revision: input.revision, createdAt, timezone: input.timezone, events, dayStarts, completeDays: [] };
  if (input.profile !== undefined) state.profile = validateProfile(input.profile);
  state.completeDays = [...new Set(input.completeDays.map(value => {
    timestamp(value, now, 'Tagesbestätigung');
    if (time(value) < time(dayStarts[0].timestamp)) fail('Tagesbestätigung liegt vor dem Beginn.');
    const period = dayAt(state, new Date(value));
    if (period.start.toISOString() !== value || period.end > now) fail('Nur abgeschlossene Tage können vollständig bestätigt werden.');
    return value;
  }))];
  return state;
}

// Calendar arithmetic preserves the local clock across 23/25-hour DST days.
// A manual start becomes the new repeating local boundary, until the next start.
export function dayAt(state, when = new Date()) {
  let index = -1;
  for (let i = 0; i < state.dayStarts.length; i++) if (time(state.dayStarts[i].timestamp) <= when.getTime()) index = i;
  if (index < 0) fail('Zeitpunkt liegt vor dem ersten erfassten Tag.');
  const anchor = new Date(state.dayStarts[index].timestamp);
  let start = new Date(when.getFullYear(), when.getMonth(), when.getDate(), anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
  if (start > when) start = new Date(when.getFullYear(), when.getMonth(), when.getDate() - 1, anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
  // During a repeated fall-back hour, never move behind the explicit anchor.
  if (start < anchor) start.setTime(anchor.getTime());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
  const next = state.dayStarts[index + 1];
  if (next && time(next.timestamp) < end.getTime()) end.setTime(time(next.timestamp));
  return { start, end };
}

export function summary(state, period, now = new Date()) {
  const events = state.events.filter(e => time(e.timestamp) >= period.start && time(e.timestamp) < period.end && time(e.timestamp) <= now);
  return { ...period, events, cigarettes: events.filter(e => e.type === 'cigarette').length,
    vapes: events.filter(e => e.type === 'vape').length,
    closed: period.end <= now, complete: state.completeDays.includes(period.start.toISOString()),
    partial: time(state.createdAt) > period.start.getTime() };
}

export function history(state, now = new Date(), limit = 14) {
  const result = [];
  let point = now;
  for (let i = 0; i < limit && point >= new Date(state.dayStarts[0].timestamp); i++) {
    const period = dayAt(state, point);
    result.push(summary(state, period, now));
    point = new Date(period.start.getTime() - 1);
  }
  return result;
}

export function addEvent(state, type, now = new Date()) {
  if (!['cigarette', 'vape'].includes(type)) fail('Ungültige Eintragsart.');
  if (state.events.length >= MAX_EVENTS) fail('Das Eintragslimit dieser Testversion ist erreicht. Bitte zuerst exportieren.');
  state.events.push({ id: uid(), type, timestamp: now.toISOString() });
  return state;
}

export function startDay(state, now = new Date()) {
  const previous = state.dayStarts.at(-1);
  if (now.getTime() - time(previous.timestamp) < 600000) fail('Der letzte Tagesbeginn liegt weniger als zehn Minuten zurück.');
  state.dayStarts.push({ id: uid(), timestamp: now.toISOString() });
  return state;
}

export function importBackup(text, now = new Date()) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) fail('Die Datei ist größer als 2 MB.');
  let input;
  try { input = JSON.parse(text); } catch { fail('Die Datei enthält kein gültiges JSON.'); }
  if (input?.app === APP) return { state: validateState(input, now), legacy: false };
  if (input?.app !== 'Rauchfrei' || !Array.isArray(input.events) || input.events.length > MAX_EVENTS) fail('Kein unterstütztes Rauchfrei-Backup.');
  // Old IDs are not relied on: V0.8 import did not require unique IDs.
  const legacy = input.events.map(row => {
    if (!row || !['first-cigarette', 'cigarette', 'vape'].includes(row.type)) fail('Unbekannte Eintragsart im alten Backup.');
    return { id: uid(), type: row.type, timestamp: timestamp(row.timestamp, now, 'Alter Eintrag') };
  });
  sort(legacy);
  const state = initialState(legacy.length ? new Date(legacy[0].timestamp) : now);
  const markers = legacy.filter(e => e.type === 'first-cigarette');
  if (markers.length && markers[0].timestamp === legacy[0]?.timestamp) state.dayStarts = [];
  const seen = new Set(state.dayStarts.map(e => e.timestamp));
  for (const e of markers) if (!seen.has(e.timestamp)) { state.dayStarts.push({ id: uid(), timestamp: e.timestamp }); seen.add(e.timestamp); }
  state.events = legacy.map(e => ({ ...e, type: e.type === 'first-cigarette' ? 'cigarette' : e.type }));
  return { state: validateState(state, now), legacy: true };
}

export function createStore(storage, key) {
  function read(now = new Date()) {
    let raw;
    try { raw = storage.getItem(key); } catch { fail('Der Browser erlaubt keinen lokalen Speicher. Bitte die Speichereinstellungen prüfen.'); }
    if (raw === null) return null;
    try { return validateState(JSON.parse(raw), now); }
    catch (error) { fail(`Gespeicherte Daten konnten nicht geladen werden. Sie bleiben erhalten. ${error.message}`); }
  }
  function write(state, expectedRevision, now = new Date()) {
    const current = read(now);
    if ((current?.revision ?? null) !== expectedRevision) fail('Die Daten wurden in einem anderen Fenster geändert. Bitte erneut versuchen.');
    const result = validateState({ ...state, revision: (current?.revision ?? 0) + 1 }, now);
    try { storage.setItem(key, JSON.stringify(result)); }
    catch { fail('Speichern fehlgeschlagen. Der Eintrag wurde nicht übernommen. Bitte ein Backup exportieren und freien Speicher prüfen.'); }
    return result;
  }
  return { read, write, replace(state, now = new Date()) {
    const current = read(now);
    const previous = storage.getItem(key);
    const checked = validateState(state, now);
    if (previous !== null) {
      try { storage.setItem(`${key}:before-import`, previous); }
      catch { fail('Die Sicherung vor dem Import konnte nicht gespeichert werden. Import abgebrochen.'); }
    }
    return write(checked, current?.revision ?? null, now);
  } };
}


export function localMinute(value) {
  const d = new Date(value), pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function resolveEditedTime(original, entered, now = new Date()) {
  if (entered === localMinute(original)) return original;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(entered)) fail('Bitte Datum und Uhrzeit vollstaendig eingeben.');
  const date = new Date(entered);
  if (!Number.isFinite(date.getTime()) || date > now) fail('Bitte einen gueltigen Zeitpunkt ohne Zukunftsdatum waehlen.');
  if (localMinute(date) !== entered) fail('Diese Ortszeit existiert wegen der Zeitumstellung nicht.');
  if ([-3600000, 3600000].some(offset => localMinute(new Date(+date + offset)) === entered)) fail('Diese Uhrzeit kommt bei der Zeitumstellung zweimal vor und ist nicht eindeutig.');
  return date.toISOString();
}

export function correctEventTime(state, id, value, now = new Date(), expected) {
  timestamp(value, now, 'Korrektur');
  const event = state.events.find(e => e.id === id);
  if (!event) fail('Der Eintrag wurde bereits entfernt.');
  if (expected !== undefined && event.timestamp !== expected) fail('Der Eintrag wurde inzwischen geaendert. Bitte erneut oeffnen.');
  if (value === event.timestamp) return state;
  if (time(value) < time(state.dayStarts[0].timestamp)) fail('Die Uhrzeit liegt vor dem Beginn des ersten erfassten Tages.');
  const affected = [event.timestamp, value].map(t => dayAt(state, new Date(t)).start.toISOString());
  event.timestamp = value;
  sort(state.events);
  state.completeDays = state.completeDays.filter(t => !affected.includes(t));
  return state;
}
