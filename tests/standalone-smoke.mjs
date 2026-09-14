import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const reservation=createServer();
await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
const origin='http://127.0.0.1:'+port;
const env={...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',APP_URL:origin,NODE_ENV:'production'};
for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','GEMINI_API_KEY','GEMINI_MODEL'])delete env[key];
const server=spawn(process.execPath,['.next/standalone/server.js'],{env,stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
try {
  let ready=false;
  for(let i=0;i<80;i++){
    try {if((await fetch(origin+'/api/health')).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'O servidor não iniciou: '+logs);
  const home=await fetch(origin+'/');assert.equal(home.status,200);
  const html=await home.text();assert.match(html,/stockinho/i);
  const stylesheet=html.match(/href="([^" ]+\.css[^" ]*)"/);assert.ok(stylesheet,'CSS ausente');
  assert.equal((await fetch(new URL(stylesheet[1].replaceAll('&amp;','&'),origin))).status,200);
  assert.equal((await fetch(origin+'/favicon.svg')).status,200);
  assert.equal((await fetch(origin+'/login')).status,200);
  const stock=await fetch(origin+'/api/stock');assert.equal(stock.status,401);assert.ok((await stock.json()).error);
  const blocked=await fetch(origin+'/api/auth',{method:'POST',headers:{origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,403);
  const missing=await fetch(origin+'/api/auth',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'test-password',action:'login'})});assert.equal(missing.status,503);
  console.log('PASS: Next.js standalone, painel, login, CSS, favicon, healthcheck, API 401 e validação de origem.');
} finally {server.kill('SIGTERM');}
