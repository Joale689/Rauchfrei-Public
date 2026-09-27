import { cigaretteCost } from './costs.js';
import { validateProfile } from './profile.js';
import { correctEventTime, localMinute, resolveEditedTime, APP, MAX_BYTES, initialState, validateState, createStore, dayAt, summary, history, addEvent, startDay, importBackup } from './core.js';



const $ = id => document.getElementById(id);

// localStorage is shared by origin, not by PWA scope. Isolate both product and path.

const ROOT = new URL('../', import.meta.url);

const KEY = `rauchfrei_public_v1:${ROOT.pathname}`;

let storage;

try { storage = window.localStorage; } catch { storage = { getItem() { throw Error('Speicher gesperrt'); } }; }

const store = createStore(storage, KEY);

let state = null, busy = false;

const dt = date => new Intl.DateTimeFormat('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(date);

const clock = date => new Intl.DateTimeFormat('de-DE', { hour:'2-digit', minute:'2-digit' }).format(date);

function notice(message, error = false) { $('notice').textContent = message; $('notice').className = error ? 'error' : ''; $('notice').hidden = false; if (error) $('notice').scrollIntoView({block:'center'}); }

function download(text, name) {

  const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));

  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 15000);

}

function backup() {

  try { const current = store.read(); if (!current) return; download(JSON.stringify(current, null, 2), `rauchfrei-public-${new Date().toISOString().slice(0,10)}.json`); }

  catch (error) { notice(error.message, true); }

}

function elapsed(ms) {

  const minutes = Math.max(0, Math.floor(ms / 60000));

  const hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);

  return days ? `${days} T ${hours % 24} Std ${minutes % 60} Min` : hours ? `${hours} Std ${minutes % 60} Min` : `${minutes} Min`;

}

function element(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }

function button(text, action) { const e = element('button', text, 'secondary'); e.type = 'button'; e.addEventListener('click', action); return e; }

function invalidateDays(next, timestamps) {

  const changed = timestamps.map(t => dayAt(next, new Date(t)).start.toISOString());

  next.completeDays = next.completeDays.filter(t => !changed.includes(t));

}

async function exclusive(work) {

  if (busy) return;

  busy = true;

  try {

    if (navigator.locks) await navigator.locks.request(KEY, work);

    else await work();

  } catch (error) { notice(error.message, true); }

  finally { busy = false; refresh(); }

}

function mutate(change, message) {

  return exclusive(() => {

    const current = store.read();

    if (!current) throw Error('Bitte zuerst lokal beginnen.');

    const next = change(structuredClone(current));

    store.write(next, current.revision);

    notice(message);

  });

}



function render() {
  renderOverview();
  renderProfile();

  const now = new Date();

  const current = summary(state, dayAt(state, now), now);

  $('period').textContent = `${dt(current.start)} bis ${dt(current.end)}`;

  $('cigCount').textContent = current.cigarettes;

  $('vapeCount').textContent = current.vapes;

  $('dayHint').textContent = current.events.length ? 'Das sind deine erfassten Einträge. Dampfer-Einträge sagen nichts über die aufgenommene Nikotinmenge aus.' : 'Bisher keine Einträge. Das allein belegt noch keinen rauchfreien Tag.';

  $('rhythmText').textContent = `Automatischer Tageswechsel um ${clock(current.end)} Uhr · ${state.timezone}.`;

  const last = state.events.filter(e => e.type === 'cigarette').at(-1);

  $('sinceLast').textContent = last ? elapsed(now - new Date(last.timestamp)) : 'Noch keine erfasst';

  $('undoBtn').disabled = !state.events.length;

  $('history').replaceChildren();

  for (const day of history(state, now)) {

    const row = element('div', undefined, 'history-row');

    const copy = element('div');

    copy.append(element('strong', `${dt(day.start)}${!day.closed ? ' · aktuell' : ''}`));

    const counts = day.complete && day.cigarettes === 0 ? `${day.partial ? 'Erfasster Teilzeitraum rauchfrei' : 'Rauchfrei bestätigt'} · ${day.vapes} Dampfer` : `${day.cigarettes} Zigaretten · ${day.vapes} Dampfer`;

    copy.append(element('p', counts, 'counts'));

    copy.append(element('p', `${day.partial ? 'Erster Tag nur teilweise beobachtet. ' : ''}${day.complete ? 'Erfassung als vollständig bestätigt.' : day.closed ? 'Vollständigkeit unbekannt.' : 'Tag läuft noch.'}`));

    row.append(copy);

    if (day.closed) row.append(button(day.complete ? 'Bestätigung aufheben' : 'Vollständig erfasst', () => mutate(next => {

      const id = day.start.toISOString();

      if (next.completeDays.includes(id)) next.completeDays = next.completeDays.filter(t => t !== id);

      else next.completeDays.push(id);

      return next;

    }, 'Tagesbestätigung gespeichert.')));

    $('history').append(row);

  }

  $('events').replaceChildren();

  if (!current.events.length) $('events').append(element('li', 'Hier erscheinen deine nächsten Einträge.'));

  for (const event of [...current.events].reverse()) {

    const row = element('li');

    row.append(element('span', `${clock(new Date(event.timestamp))} · ${event.type === 'cigarette' ? 'Zigarette' : 'Dampfer'}`));

    const actions = element('div', undefined, 'entry-actions');

    actions.append(button('Uhrzeit ändern', () => edit(event)), button('Entfernen', () => {

      if (!confirm('Diesen Eintrag entfernen?')) return;

      mutate(next => { const target = next.events.find(e => e.id === event.id); if (!target) throw Error('Der Eintrag wurde bereits entfernt.'); invalidateDays(next, [target.timestamp]); next.events = next.events.filter(e => e.id !== event.id); return next; }, 'Eintrag entfernt.');

    }));

    row.append(actions); $('events').append(row);

  }

  $('recoveryBtn').hidden = storage.getItem(`${KEY}:before-import`) === null;

}

function refresh() {

  try {

    state = store.read();

    $('blocked').hidden = true; $('setup').hidden = !!state; $('tracker').hidden = !state;

    if (state) render();

  } catch (error) {

    $('blockedText').textContent = error.message; $('blocked').hidden = false; $('setup').hidden = true; $('tracker').hidden = true;

  }

}

function ask(dialog) { return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept'), {once:true}); dialog.returnValue = 'cancel'; dialog.showModal(); }); }

async function edit(event) {

  $('editTime').value = localMinute(event.timestamp);

  if (!await ask($('editDialog'))) return;

  try {

    const value = resolveEditedTime(event.timestamp, $('editTime').value);

    if (value === event.timestamp) { notice('Uhrzeit unveraendert.'); return; }

    await mutate(next => correctEventTime(next, event.id, value, new Date(), event.timestamp), 'Uhrzeit korrigiert.');

  } catch (error) { notice(error.message, true); }

}



for (let hour = 0; hour < 24; hour++) { const option = element('option', `${String(hour).padStart(2,'0')}:00 Uhr`); option.value = hour; option.selected = hour === 5; $('boundary').append(option); }

$('begin').addEventListener('click', () => exclusive(() => { store.write(initialState(new Date(), Number($('boundary').value)), null); notice('Du kannst jetzt Einträge erfassen.'); }));

for (const [id, type] of [['cigBtn','cigarette'], ['vapeBtn','vape']]) $(id).addEventListener('click', () => mutate(next => addEvent(next, type), 'Eintrag gespeichert.'));

$('undoBtn').addEventListener('click', () => {

  const expectedId = state.events.at(-1)?.id;

  if (!expectedId || !confirm('Den zeitlich letzten Rauch- oder Dampfer-Eintrag entfernen? Ein Tagesbeginn wird dadurch nicht verändert.')) return;

  mutate(next => { if (next.events.at(-1)?.id !== expectedId) throw Error('Der letzte Eintrag wurde inzwischen geändert. Bitte erneut prüfen.'); invalidateDays(next, [next.events.at(-1).timestamp]); next.events.pop(); return next; }, 'Letzter Eintrag entfernt.');

});

$('startDayBtn').addEventListener('click', () => {

  if (!confirm('Den bisherigen Tag jetzt beenden und einen neuen beginnen? Es wird keine Zigarette erfasst. Die automatische Tagesgrenze wechselt auf die jetzige Uhrzeit.')) return;

  mutate(next => startDay(next), 'Neuer Tag begonnen. Die bisherigen Einträge bleiben erhalten.');

});

$('exportBtn').addEventListener('click', backup); $('dialogExport').addEventListener('click', backup);

$('rawExport').addEventListener('click', () => { try { const raw = storage.getItem(KEY); if (raw !== null) download(raw, 'rauchfrei-public-rohdaten.json'); } catch { notice('Der Browser blockiert auch das Lesen. Bitte die Speichereinstellungen prüfen.', true); } });

$('recoveryBtn').addEventListener('click', () => { try { const raw = storage.getItem(`${KEY}:before-import`); if (raw) download(raw, 'rauchfrei-public-vor-import.json'); } catch (error) { notice(error.message, true); } });

$('importBtn').addEventListener('click', () => { $('importFile').value = ''; $('importFile').click(); });

$('importFile').addEventListener('change', async () => {

  const file = $('importFile').files[0]; if (!file) return;

  try {

    if (file.size > MAX_BYTES) throw Error('Die Datei ist größer als 2 MB.');

    const parsed = importBackup(await file.text());

    const viewedRevision = store.read()?.revision;

    $('importSummary').textContent = `${parsed.state.events.length} Einträge. ${parsed.legacy ? 'Altes persönliches Backup: Startmarker werden übernommen, die Tageszuordnung folgt dem neuen Modell. Kein Tag wird automatisch als vollständig bestätigt.' : 'Backup der öffentlichen Testversion.'}`;

    if (!await ask($('importDialog'))) return;

    await exclusive(() => { if (store.read()?.revision !== viewedRevision) throw Error('Seit der Vorschau wurden Daten geändert. Bitte den Import erneut öffnen.'); store.replace(parsed.state); notice('Backup importiert.'); });

  } catch (error) { notice(error.message, true); }

});

window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) refresh(); });

document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });


// PROFILE_V1
const profileFields = {
  mode: 'profileMode',
  quitDate: 'profileDate',
  reasons: 'profileReasons',
  triggers: 'profileTriggers',
  aids: 'profileAids',
  packPrice: 'profilePrice',
  packSize: 'profileSize'
};

function renderProfile() {
  if ($('profileForm').dataset.dirty === '1') return;
  const profile = validateProfile(state?.profile ?? {});
  for (const [key, id] of Object.entries(profileFields))
    $(id).value = profile[key] ?? '';
}

$('profileForm').addEventListener('input', () => {
  $('profileForm').dataset.dirty = '1';
  $('profileStatus').textContent = 'Noch nicht gespeichert.';
});

$('profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const input = {};
    for (const [key, id] of Object.entries(profileFields))
      input[key] = $(id).value;

    for (const key of ['packPrice', 'packSize'])
      input[key] = input[key] === '' ? null : Number(input[key]);

    const desired = validateProfile(input);
    await mutate(next => {
      next.profile = desired;
      return next;
    }, 'Profil gespeichert.');

    if (JSON.stringify(store.read()?.profile) === JSON.stringify(desired)) {
      $('profileForm').dataset.dirty = '0';
      $('profileStatus').textContent = 'Auf diesem Gerät gespeichert.';
      renderProfile();
    } else {
      $('profileStatus').textContent =
        'Nicht gespeichert. Bitte die Meldung oben beachten.';
    }
  } catch (error) {
    $('profileStatus').textContent = error.message;
    notice(error.message, true);
  }
});


function renderOverview() {
  const days = history(state, new Date(), 14);
  const profile = state.profile ?? {};
  const currentCount = days[0]?.cigarettes ?? 0;
  const totalCount = state.events.filter(e => e.type === 'cigarette').length;
  const euro = cents => cents === null ? '–' :
    new Intl.NumberFormat('de-DE', {
      style:'currency', currency:'EUR'
    }).format(cents / 100);

  const currentCost = cigaretteCost(currentCount, profile);
  const totalCost = cigaretteCost(totalCount, profile);

  $('currentCost').textContent = euro(currentCost);
  $('totalCost').textContent = euro(totalCost);

  $('costExplanation').textContent = totalCost === null
    ? 'Hinterlege Packungspreis und Zigaretten je Packung in deinem Profil, um die Kosten berechnen zu lassen.'
    : `Rechnerischer Wert von insgesamt ${totalCount} erfassten Zigaretten zum aktuell hinterlegten Packungspreis. Preisänderungen gelten hier auch für ältere Einträge. Fehlende Einträge und Kosten für Hilfsmittel sind nicht enthalten.`;

  const chart = $('consumptionChart');
  chart.replaceChildren();
  const maximum = Math.max(1, ...days.map(day => day.cigarettes));

  for (const day of [...days].reverse()) {
    const row = element('div', undefined, 'chart-row');
    row.setAttribute('role', 'listitem');

    const label = element('div', undefined, 'chart-label');
    label.append(element('strong', dt(day.start)));
    label.append(element('div', day.closed ? 'abgeschlossen' : 'läuft noch'));

    const content = element('div');
    const track = element('div', undefined, 'chart-track');
    track.setAttribute('aria-hidden', 'true');

    const fill = element(
      'div', undefined,
      'chart-fill' + (day.complete ? '' : ' unconfirmed')
    );
    fill.style.width = `${100 * day.cigarettes / maximum}%`;
    track.append(fill);

    let status = day.complete ? 'vollständig bestätigt' : 'unbestätigt';
    if (day.partial) status += ' · Teilzeitraum';

    content.append(
      track,
      element(
        'div',
        `${day.cigarettes} Zigaretten · ${day.vapes} Dampfer · ${status}`,
        'chart-value'
      )
    );
    row.append(label, content);
    chart.append(row);
  }
}

setInterval(refresh, 30000);

refresh();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {

  navigator.serviceWorker.register(new URL('../service-worker.js', import.meta.url), { scope: ROOT.pathname }).then(async registration => {

    await navigator.serviceWorker.ready;

    $('offline').textContent = 'Offline-Grundfunktion vorbereitet · Backups bleiben deine Verantwortung.';

    const update = () => { if (registration.waiting) notice('Eine neue Version ist bereit. Schließe alle Fenster dieser App und öffne sie erneut.'); };

    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', update)); update();

  }).catch(() => { $('offline').textContent = 'Offline-Funktion konnte nicht eingerichtet werden. Bitte online erneut öffnen.'; });

} else $('offline').textContent = 'Zum Testen über localhost öffnen. Direkt geöffnete Dateien unterstützen diese PWA nicht.';

