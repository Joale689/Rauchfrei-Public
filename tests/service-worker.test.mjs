import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
function setup() {
  const handlers={},deleted=[],cached=[];
  const scope='https://example.test/public/';
  let claims=0, fetches=0, storedResponse=null;
  const context={ URL, self:{registration:{scope},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>claims++}},
    caches:{keys:async()=>['other-app','rauchfrei-v08',`rauchfrei-public:${scope}:0.0.1`,`rauchfrei-public:${scope}:0.1.1`],delete:async key=>deleted.push(key),
      open:async()=>({addAll:async urls=>cached.push(...urls),match:async()=>storedResponse,put:async()=>{}})},
    fetch:async()=>{fetches++;return{ok:false,status:503}}};
  vm.createContext(context);vm.runInContext(code,context);
  return {handlers,deleted,cached,scope,setCached:value=>storedResponse=value,get claims(){return claims;},get fetches(){return fetches;}};
}
test('Worker löscht nur eigene alte Cache-Versionen',async()=>{
  const s=setup();let pending;s.handlers.activate({waitUntil:p=>pending=p});await pending;
  assert.deepEqual(s.deleted,[`rauchfrei-public:${s.scope}:0.0.1`]);assert.equal(s.claims,1);
});
test('Installation lädt alle acht erforderlichen Ressourcen vor',async()=>{
  const s=setup();let pending;s.handlers.install({waitUntil:p=>pending=p});await pending;
  assert.equal(s.cached.length,8);
  for(const url of s.cached) assert.ok(url.startsWith(s.scope));
  assert.ok(s.cached.includes(s.scope+'src/core.js'));
});
test('Vorhandener Cache wird ohne Netzwerkzugriff verwendet',async()=>{
  const s=setup();const response={ok:true};s.setCached(response);let pending;
  s.handlers.fetch({request:{url:s.scope+'index.html',method:'GET'},respondWith:p=>pending=p});
  assert.equal(await pending,response);assert.equal(s.fetches,0);
});
test('Fremde URLs und Schreibzugriffe werden nicht abgefangen',()=>{
  const s=setup();let calls=0;
  for(const request of [{url:'https://example.test/private/index.html',method:'GET'},{url:s.scope+'index.html',method:'POST'}]) s.handlers.fetch({request,respondWith:()=>calls++});
  assert.equal(calls,0);
});
