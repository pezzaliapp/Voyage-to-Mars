(()=>{'use strict';

// PWA: service worker + install prompt
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
let deferredPrompt=null; const btnInstall=document.getElementById('btnInstall'); const installBox=document.getElementById('install');
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; installBox.style.display=''; });
btnInstall?.addEventListener('click', async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBox.style.display='none'; }});

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
let W=0,H=0, DPR=Math.min(2, window.devicePixelRatio||1);

function resize(){
  W = canvas.width = Math.floor(window.innerWidth * DPR);
  H = canvas.height = Math.floor((window.innerHeight) * DPR);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
}
addEventListener('resize', resize, {passive:true}); resize();

/* ===== Utilities ===== */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp = (a,b,t)=>a+(b-a)*t;
const ease = t=>t<.5? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const TAU = Math.PI*2;
function hsl(h,s,l,a=1){ return `hsla(${h} ${s}% ${l}% / ${a})`; }

/* ===== Camera & projection (look toward +Z) ===== */
const cam = { x:0, y:0.25, z:-2.8, rx:0, ry:Math.PI, mode:'AUTO' };
function rotateY(v, a){ const {x,z}=v; const ca=Math.cos(a), sa=Math.sin(a); return {...v, x:x*ca - z*sa, z:x*sa + z*ca}; }
function rotateX(v, a){ const {y,z}=v; const ca=Math.cos(a), sa=Math.sin(a); return {...v, y:y*ca - z*sa, z:y*sa + z*ca}; }
function worldToScreen(p){
  let v = {x:p.x - cam.x, y:p.y - cam.y, z:p.z - cam.z};
  v = rotateY(v, -cam.ry);
  v = rotateX(v, -cam.rx);
  const fov = 1.2;
  const z = v.z <= 0.01 ? 0.01 : v.z;     // look +Z
  const sx = (v.x / (z * fov)) * (W/2) + W/2;
  const sy = (v.y / (z * fov)) * (W/2) + H/2;
  const s = 1 / (z * fov);
  return {x:sx, y:sy, scale:s, z};
}

/* ===== Starfield ===== */
const stars = [];
function initStars(){
  stars.length=0;
  for(let i=0;i<900;i++){
    const r = 30 + Math.random()*120;
    const u = Math.random()*TAU, v = Math.acos(2*Math.random()-1);
    const x = r*Math.sin(v)*Math.cos(u);
    const y = r*Math.cos(v);
    const z = r*Math.sin(v)*Math.sin(u);
    const mag = Math.random();
    stars.push({x,y,z,mag});
  }
}
initStars();

/* ===== Waypoints with positive Z ===== */
const WAYPOINTS = [
  { name:'Earth',   p:{x:0,    y:0, z:0},     r:0.18, color:[220,90,64], type:'planet' },
  { name:'Moon',    p:{x:0.6,  y:0.02, z:0.4}, r:0.05, color:[220,20,85], type:'moon' },
  { name:'Jupiter', p:{x:5.5,  y:-0.2, z:3.0}, r:0.35, color:[30,60,65],  type:'planet' },
  { name:'Neptune', p:{x:9.0,  y:0.4, z:5.0},  r:0.28, color:[210,70,60], type:'planet', rings:true },
  { name:'Mars',    p:{x:12.0, y:0.05,z:7.0},  r:0.16, color:[10,65,60],  type:'planet' },
];

const PHASES = [
  {label:'Orbita Terrestre',      t0:0.00, t1:0.18},
  {label:'Luna — fly-by',         t0:0.18, t1:0.32},
  {label:'Cruise verso Giove',    t0:0.32, t1:0.58},
  {label:'Giove — fly-by',        t0:0.58, t1:0.68},
  {label:'Cruise verso Nettuno',  t0:0.68, t1:0.86},
  {label:'Nettuno & anelli',      t0:0.86, t1:0.93},
  {label:'Inserzione su Marte',   t0:0.93, t1:1.00}
];

/* Path */
function samplePath(t){
  const n = WAYPOINTS.length;
  const seg = Math.min(n-2, Math.floor(t*(n-1)));
  const lt = t*(n-1)-seg;
  const p0 = WAYPOINTS[Math.max(0, seg-1)].p;
  const p1 = WAYPOINTS[seg].p;
  const p2 = WAYPOINTS[seg+1].p;
  const p3 = WAYPOINTS[Math.min(n-1, seg+2)].p;
  const tt = ease(lt);
  function interp(a,b,c,d,t){
    const t2 = t*t, t3 = t2*t;
    return 0.5*((2*b) + (-a + c)*t + (2*a-5*b+4*c - d)*t2 + (-a+3*b-3*c+d)*t3);
  }
  return { x: interp(p0.x,p1.x,p2.x,p3.x,tt),
           y: interp(p0.y,p1.y,p2.y,p3.y,tt),
           z: interp(p0.z,p1.z,p2.z,p3.z,tt) };
}

/* ===== Planet rendering ===== */
function drawPlanet(p, radius, hue, sat, light, rings=false, ringTilt=0.6){
  const S = worldToScreen(p);
  if(S.z<=0) return;
  const R = radius * S.scale * W;
  if(R<2) return;
  const g = ctx.createRadialGradient(S.x-R*0.35, S.y-R*0.35, R*0.1, S.x, S.y, R);
  g.addColorStop(0, hsl(hue, sat, Math.min(96, light+18), 0.95));
  g.addColorStop(0.5, hsl(hue, sat, light, 0.95));
  g.addColorStop(1, hsl(hue, sat, Math.max(8, light-26), 0.95));
  ctx.beginPath(); ctx.arc(S.x, S.y, R, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill();
  if(hue<60 || hue>180){
    const bands = 8; ctx.globalAlpha = 0.08; ctx.beginPath();
    for(let i=0;i<=bands;i++){
      const yy = S.y + (i/bands*2-1)*R*0.9;
      ctx.moveTo(S.x - Math.sqrt(Math.max(0,R*R - (yy-S.y)*(yy-S.y))), yy);
      ctx.lineTo(S.x + Math.sqrt(Math.max(0,R*R - (yy-S.y)*(yy-S.y))), yy);
    }
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
  }
  if(rings){
    const a = R*1.9, b = R*0.55; ctx.save(); ctx.translate(S.x, S.y); ctx.rotate(0.7);
    ctx.globalAlpha=.35; ctx.beginPath(); ctx.ellipse(0,0,a,b,0,Math.PI,0,true); ctx.lineWidth=R*0.28;
    ctx.strokeStyle='rgba(220,230,255,0.25)'; ctx.stroke(); ctx.globalAlpha=1;
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.clip();
    ctx.globalAlpha=.6; ctx.beginPath(); ctx.ellipse(0,0,a,b,0,0,Math.PI); ctx.lineWidth=R*0.28;
    ctx.strokeStyle='rgba(245,250,255,0.55)'; ctx.stroke(); ctx.restore();
  }
  return {x:S.x, y:S.y, r:R};
}

/* ===== Labels ===== */
const labelsHost = document.getElementById('labels');
const domLabels = new Map();
function setLabel(name, x,y){
  let el = domLabels.get(name);
  if(!el){ el = document.createElement('div'); el.className='label'; el.textContent = name; labelsHost.appendChild(el); domLabels.set(name, el); }
  el.style.left = Math.round(x/DPR) + 'px';
  el.style.top  = Math.round(y/DPR - 18) + 'px';
}
function hideUnusedLabels(setUsed){
  for(const [name, el] of domLabels){ el.style.display = setUsed.has(name)? '' : 'none'; }
}

/* ===== UI ===== */
const elPhase = document.getElementById('phase');
const elDist  = document.getElementById('dist');
const elVel   = document.getElementById('vel');
const elMode  = document.getElementById('mode');
const elProg  = document.getElementById('prog');
const elBadge = document.getElementById('badge');

const btnPlay = document.getElementById('btnPlay');
const btnDown = document.getElementById('btnSpeedDown');
const btnUp   = document.getElementById('btnSpeedUp');
const btnMode = document.getElementById('btnMode');
const btnRe   = document.getElementById('btnRestart');

/* ===== Interaction ===== */
let running = true;
let speed = 0.08;
let t = 0;
let yawDrag=0, pitchDrag=0, dragging=false, dragX=0, dragY=0;

function toggleRun(){ running = !running; elBadge.style.display = running?'none':''; elBadge.textContent='PAUSA'; }
function restart(){ t=0; running=true; elBadge.style.display='none'; }
function changeMode(){ cam.mode = cam.mode==='AUTO' ? 'FREE' : 'AUTO'; elMode.textContent = cam.mode==='AUTO' ? 'Camera AUTO' : 'Camera LIBERA'; }

addEventListener('keydown', (e)=>{
  if(e.key===' '){ e.preventDefault(); toggleRun(); }
  if(e.key==='r' || e.key==='R') restart();
  if(e.key==='c' || e.key==='C') changeMode();
  if(e.key==='+' || e.key==='=' ) speed = Math.min(0.6, speed*1.25);
  if(e.key==='-' || e.key==='_' ) speed = Math.max(0.01, speed/1.25);
});
function onDown(x,y){ if(cam.mode==='FREE'){ dragging=true; dragX=x; dragY=y; } }
function onMove(x,y){ if(dragging){ yawDrag += (x-dragX)*0.004; pitchDrag += (y-dragY)*0.004; dragX=x; dragY=y; } }
function onUp(){ dragging=false; }
canvas.addEventListener('mousedown', e=>onDown(e.clientX,e.clientY));
addEventListener('mousemove', e=>onMove(e.clientX,e.clientY));
addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', e=>{const t=e.changedTouches[0]; onDown(t.clientX,t.clientY);},{passive:true});
canvas.addEventListener('touchmove', e=>{const t=e.changedTouches[0]; onMove(t.clientX,t.clientY);},{passive:true});
canvas.addEventListener('touchend', onUp, {passive:true});

btnPlay.onclick = toggleRun;
btnDown.onclick = ()=>speed = Math.max(0.01, speed/1.25);
btnUp.onclick   = ()=>speed = Math.min(0.6, speed*1.25);
btnMode.onclick = changeMode;
btnRe.onclick   = restart;

addEventListener('dblclick', ()=>{
  const hud = document.getElementById('hud');
  hud.style.display = hud.style.display==='none' ? '' : 'none';
});

function phaseFor(t){ for(const p of PHASES){ if(t>=p.t0 && t<p.t1) return p.label; } return PHASES[PHASES.length-1].label; }

/* ===== Loop ===== */
let last = performance.now();
function tick(now){
  const dt = Math.min(0.05, (now-last)/1000); last=now;
  if(running){
    t += speed*dt*(0.45 + 0.55*Math.sin(now*0.0007+1.2));
    if(t>=1){ t=1; running=false; elBadge.style.display=''; elBadge.textContent='ARRIVO: MARTE'; }
  }
  const here = samplePath(t);
  const ahead = samplePath(clamp(t+0.02,0,1));
  const remaining = Math.max(0, (1-t)*225e6);
  const v_kms = clamp(speed*12000, 36, 48000);

  if(cam.mode==='AUTO'){
    cam.x = lerp(cam.x, here.x+0.0, 0.06);
    cam.y = lerp(cam.y, here.y+0.25, 0.06);
    cam.z = lerp(cam.z, here.z-0.75, 0.06); // follow from behind (look +Z)
    const dx=ahead.x-here.x, dy=ahead.y-here.y, dz=ahead.z-here.z;
    const targetYaw = Math.atan2(dx,dz);
    const targetPitch = Math.atan2(dy, Math.hypot(dx,dz));
    cam.ry = lerp(cam.ry, targetYaw+Math.PI, 0.06); // align look +Z
    cam.rx = lerp(cam.rx, targetPitch, 0.06);
  } else {
    cam.ry += yawDrag; yawDrag *= 0.9;
    cam.rx = clamp(cam.rx + pitchDrag, -1.0, 1.0); pitchDrag *= 0.9;
    cam.x = lerp(cam.x, here.x+0.0, 0.02);
    cam.y = lerp(cam.y, here.y+0.25, 0.02);
    cam.z = lerp(cam.z, here.z-0.95, 0.02);
  }

  document.getElementById('phase').textContent = phaseFor(t);
  document.getElementById('dist').textContent  = remaining.toLocaleString('it-IT')+' km';
  document.getElementById('vel').textContent   = Math.round(v_kms).toLocaleString('it-IT')+' km/s';
  document.getElementById('prog').style.width  = Math.round(t*100)+'%';

  renderScene(here);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ===== Rendering ===== */
function renderScene(here){
  ctx.clearRect(0,0,W,H);

  // stars: positive Z
  ctx.save();
  for(const s of stars){
    const p = worldToScreen({x:s.x*0.02, y:s.y*0.02, z:50 + s.z*0.02});
    if(p.x<0||p.x>W||p.y<0||p.y>H) continue;
    ctx.globalAlpha = 0.35 + s.mag*0.65;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x, p.y, 1.2, 1.2);
  }
  ctx.restore();

  // trajectory ahead
  ctx.beginPath();
  for(let i=0;i<=120;i++){
    const tt = clamp(t + i/120*0.22, 0, 1);
    const P = worldToScreen(samplePath(tt));
    if(i===0) ctx.moveTo(P.x,P.y); else ctx.lineTo(P.x,P.y);
  }
  ctx.strokeStyle = 'rgba(77,208,255,.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // planets sorted by depth
  const bodies = [];
  for(const wp of WAYPOINTS){
    const wob = 0.15*Math.sin(performance.now()*0.0002 + wp.p.x*1.3);
    const pos = {x:wp.p.x, y:wp.p.y, z:wp.p.z+wob};
    const scr = worldToScreen(pos);
    bodies.push({wp,pos,scr});
  }
  bodies.sort((a,b)=>b.scr.z - a.scr.z);

  const used = new Set();
  for(const b of bodies){
    const [h,s,l] = b.wp.color;
    const hit = drawPlanet(b.pos, b.wp.r, h,s,l, !!b.wp.rings, 0.7);
    if(hit){ setLabel(b.wp.name, hit.x, hit.y - hit.r*1.05); used.add(b.wp.name); }
  }
  hideUnusedLabels(used);

  // spacecraft marker
  const ship = worldToScreen(here);
  if(ship.z>0){
    ctx.beginPath(); ctx.arc(ship.x, ship.y, Math.max(2, 4*ship.scale*W), 0, Math.PI*2);
    ctx.fillStyle = '#9ae6ff'; ctx.fill();
    const ahead = worldToScreen(samplePath(clamp(t+0.01,0,1)));
    const a = Math.atan2(ahead.y - ship.y, ahead.x - ship.x);
    ctx.beginPath(); ctx.moveTo(ship.x, ship.y);
    ctx.lineTo(ship.x + Math.cos(a)*30, ship.y + Math.sin(a)*30);
    ctx.strokeStyle = 'rgba(154,224,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

})();