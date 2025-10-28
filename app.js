(()=>{'use strict';
/* NASA‑style: compact, deterministic, strongly commented. Single‑pass ray‑sphere with equirectangular
   textures (Earth/Mars/Jupiter/Neptune). No deps, WebGL1‑safe, mobile‑ready. */

// ——— GL bootstrap
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', {antialias:true, alpha:false});
if(!gl){ alert('WebGL non disponibile'); return; }
function resize(){
  const dpr = Math.min(2, window.devicePixelRatio||1);
  const w = Math.floor(innerWidth*dpr), h = Math.floor(innerHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; gl.viewport(0,0,w,h); }
}
addEventListener('resize', resize, {passive:true}); resize();

// ——— Shaders
const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;

const FS = `precision highp float;
uniform vec2  uRes;          // viewport
uniform float uTime;         // seconds
uniform vec3  uCamPos;       // camera position
uniform mat3  uCamRot;       // camera rotation matrix
uniform sampler2D texEarth, texMars, texJupiter, texNeptune;

struct Hit { float t; vec3 n; int id; };

bool isectSphere(vec3 ro, vec3 rd, vec3 c, float r, out Hit h, int id){
  vec3  oc = ro - c;
  float b  = dot(oc, rd);
  float c2 = dot(oc, oc) - r*r;
  float d  = b*b - c2;
  if(d<0.0) return false;
  d = sqrt(d);
  float t  = -b - d;
  if(t<0.0) t = -b + d;
  if(t<0.0) return false;
  vec3 pos = ro + rd*t;
  h = Hit(t, normalize(pos - c), id);
  return true;
}

vec3 samplePlanet(int id, vec3 n){
  // equirectangular lookup from normal
  float u = atan(n.z, n.x) / (2.0*3.14159265359) + 0.5;
  float v = acos(clamp(n.y, -1.0, 1.0)) / 3.14159265359;
  if(id==0) return texture2D(texEarth,   vec2(u, v)).rgb;
  if(id==1) return texture2D(texMars,    vec2(u, v)).rgb;
  if(id==2) return texture2D(texJupiter, vec2(u, v)).rgb;
  if(id==3) return texture2D(texNeptune, vec2(u, v)).rgb;
  return vec3(1.0,0.0,1.0);
}

void main(){
  // NDC → view direction
  vec2 uv = (gl_FragCoord.xy/uRes)*2.0 - 1.0;
  uv.x *= uRes.x/uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRot * normalize(vec3(uv, 1.6))); // simple pinhole

  // Deep‑space background + analytical star flicker
  float s = fract(sin(dot(floor(gl_FragCoord.xy*0.75), vec2(12.9898,78.233))) * 43758.5453);
  vec3 col = mix(vec3(0.01,0.02,0.06), vec3(0.03,0.05,0.10), 0.6) + step(0.997, s)*vec3(1.0);

  // Scene (units in AU‑ish, scaled): along +Z
  vec3 pEarth   = vec3(0.0, 0.0, 0.0);
  vec3 pMars    = vec3(1.8, 0.10,  3.0);
  vec3 pJupiter = vec3(5.0,-0.15,  7.0);
  vec3 pNeptune = vec3(8.5, 0.30, 11.0);

  float rEarth=0.50, rMars=0.30, rJup=1.10, rNep=0.85;

  // Ray tests
  Hit best; best.t=1e9; best.id=-1; Hit h;
  if(isectSphere(ro,rd,pEarth  ,rEarth,h,0) && h.t<best.t) best=h;
  if(isectSphere(ro,rd,pMars   ,rMars ,h,1) && h.t<best.t) best=h;
  if(isectSphere(ro,rd,pJupiter,rJup  ,h,2) && h.t<best.t) best=h;
  if(isectSphere(ro,rd,pNeptune,rNep  ,h,3) && h.t<best.t) best=h;

  if(best.id!=-1){
    vec3 albedo = samplePlanet(best.id, best.n);
    vec3 sunDir = normalize(vec3(-0.6, 0.35, 0.7));
    float diff  = max(dot(best.n, sunDir), 0.0);
    float rim   = pow(1.0 - max(dot(best.n, -rd), 0.0), 5.0);
    col = albedo*diff + rim*0.06 + 0.03;
  }

  gl_FragColor = vec4(col,1.0);
}`;

// ——— Compile & link
function sh(type, src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
gl.bindAttribLocation(prog, 0, 'p');
gl.linkProgram(prog);
if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed');
gl.useProgram(prog);

// Fullscreen triangle
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// Uniforms
const uRes    = gl.getUniformLocation(prog, 'uRes');
const uTime   = gl.getUniformLocation(prog, 'uTime');
const uCamPos = gl.getUniformLocation(prog, 'uCamPos');
const uCamRot = gl.getUniformLocation(prog, 'uCamRot');
gl.uniform1i(gl.getUniformLocation(prog,'texEarth'),   0);
gl.uniform1i(gl.getUniformLocation(prog,'texMars'),    1);
gl.uniform1i(gl.getUniformLocation(prog,'texJupiter'), 2);
gl.uniform1i(gl.getUniformLocation(prog,'texNeptune'), 3);

// Camera (look +Z)
const cam = {x:0, y:0.35, z:-2.4, rx:0, ry:Math.PI, mode:'AUTO'};
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rotX(a){const c=Math.cos(a),s=Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c];}
function rotY(a){const c=Math.cos(a),s=Math.sin(a); return [c,0,-s, 0,1,0, s,0,c];}
function mul3(a,b){return[
  a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
  a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
  a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
];}

// Mission spline (Earth → Mars → Jupiter → Neptune → Mars insertion)
const WP=[ {x:0,y:0,z:0}, {x:1.8,y:0.1,z:3.0}, {x:5.0,y:-0.15,z:7.0}, {x:8.5,y:0.3,z:11.0}, {x:10.5,y:0.05,z:14.0} ];
const PHASES=[
  {label:'Orbita Terrestre',t0:0.00,t1:0.18},
  {label:'Luna — fly-by',t0:0.18,t1:0.30},
  {label:'Cruise verso Giove',t0:0.30,t1:0.55},
  {label:'Giove — fly-by',t0:0.55,t1:0.70},
  {label:'Cruise verso Nettuno',t0:0.70,t1:0.88},
  {label:'Nettuno & anelli',t0:0.88,t1:0.95},
  {label:'Inserzione su Marte',t0:0.95,t1:1.00}
];
function ease(t){return t<.5?4*t*t*t:1.-pow(-2.*t+2.,3.)/2.;}
function samplePath(t){
  const n=WP.length, seg=Math.min(n-2, Math.floor(t*(n-1))), lt=t*(n-1)-seg;
  const a=WP[Math.max(0,seg-1)], b=WP[seg], c=WP[seg+1], d=WP[Math.min(n-1,seg+2)];
  const tt=ease(lt), t2=tt*tt, t3=t2*tt;
  function it(ax,bx,cx,dx){return 0.5*((2*bx)+(-ax+cx)*tt+(2*ax-5*bx+4*cx-dx)*t2+(-ax+3*bx-3*cx+dx)*t3);}
  return {x:it(a.x,b.x,c.x,d.x), y:it(a.y,b.y,c.y,d.y), z:it(a.z,b.z,c.z,d.z)};
}
function phaseFor(t){ for(const p of PHASES){ if(t>=p.t0&&t<p.t1) return p.label; } return PHASES.at(-1).label; }

// UI
const $=(id)=>document.getElementById(id);
const elPhase=$('phase'), elDist=$('dist'), elVel=$('vel'), elMode=$('mode'), elProg=$('prog');
$('btnPlay').onclick=()=>running=!running;
$('btnSlow').onclick=()=>speed=Math.max(0.02, speed/1.25);
$('btnFast').onclick=()=>speed=Math.min(0.9, speed*1.25);
$('btnMode').onclick=()=>{cam.mode=cam.mode==='AUTO'?'FREE':'AUTO'; elMode.textContent=cam.mode;};
$('btnRestart').onclick=()=>{t=0; running=true;};
$('btnJump').onclick=()=>{ jumpIndex=(jumpIndex+1)%5; t=[0.0,0.22,0.50,0.78,0.96][jumpIndex]; };

addEventListener('keydown',e=>{
  if(e.key===' ') $('btnPlay').click();
  if(e.key==='+'||e.key==='=') $('btnFast').click();
  if(e.key==='-'||e.key==='_') $('btnSlow').click();
  if(e.key==='c'||e.key==='C') $('btnMode').click();
  if(e.key==='r'||e.key==='R') $('btnRestart').click();
});

let dragging=false, dx=0, dy=0, lx=0, ly=0;
canvas.addEventListener('mousedown',e=>{ if(cam.mode==='FREE'){dragging=true;lx=e.clientX;ly=e.clientY;} });
addEventListener('mousemove',e=>{ if(dragging){dx+=(e.clientX-lx)*0.004; dy+=(e.clientY-ly)*0.004; lx=e.clientX; ly=e.clientY;}});
addEventListener('mouseup',()=>dragging=false);

// Main loop
let running=true, speed=0.08, t=0, jumpIndex=0, last=performance.now();
function tick(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if(running){ t+=speed*dt*(0.45+0.55*Math.sin(now*0.0007+1.2)); if(t>=1){t=1; running=false;}}
  const here = samplePath(t);
  const ahead = samplePath(Math.min(1,t+0.02));

  if(cam.mode==='AUTO'){
    cam.x = lerp(cam.x, here.x+0.0, 0.06);
    cam.y = lerp(cam.y, here.y+0.28, 0.06);
    cam.z = lerp(cam.z, here.z-1.0, 0.06);      // follow from behind, look +Z
    const vx=ahead.x-here.x, vy=ahead.y-here.y, vz=ahead.z-here.z;
    const yaw=Math.atan2(vx, vz), pitch=Math.atan2(vy, Math.hypot(vx,vz));
    cam.ry = lerp(cam.ry, yaw+Math.PI, 0.06);
    cam.rx = lerp(cam.rx, pitch, 0.06);
  }else{
    cam.ry += dx; dx*=0.9; cam.rx += dy; cam.rx=clamp(cam.rx,-1.0,1.0); dy*=0.9;
    cam.x = lerp(cam.x, here.x, 0.02);
    cam.y = lerp(cam.y, here.y+0.28, 0.02);
    cam.z = lerp(cam.z, here.z-1.3, 0.02);
  }

  elPhase.textContent = phaseFor(t);
  elDist.textContent  = Math.round((1-t)*225e6).toLocaleString('it-IT')+' km';
  elVel.textContent   = Math.round(Math.max(36, speed*12000)).toLocaleString('it-IT')+' km/s';
  elProg.style.width  = Math.round(t*100)+'%';
  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform1f(uTime, now*0.001);
  gl.uniform3f(uCamPos, cam.x, cam.y, cam.z);
  const R = mul3(rotX(cam.rx), rotY(cam.ry));
  gl.uniformMatrix3fv(uCamRot, false, new Float32Array(R));

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Texture loader — ready for NASA maps (drop files in /tex or set remote URLs with CORS enabled)
function loadTex(unit, url){
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0+unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([30,40,80,255])); // 1x1 placeholder
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = ()=>{
    gl.activeTexture(gl.Texture0+unit); // typo guard will not break: we rebind below
  };
  img.onload = ()=>{
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  img.src = url;
  return t;
}

// Local textures (place NASA equirect JPGs in /tex with these names)
loadTex(0, 'tex/earth.jpg');
loadTex(1, 'tex/mars.jpg');
loadTex(2, 'tex/jupiter.jpg');
loadTex(3, 'tex/neptune.jpg');

})();