/* Voyage to Mars — Film Mode (CesiumJS)
 * Pianeti proporzionati (raggio + distanza compressa), anelli e camera cinematografica
 * MIT 2025 — pezzaliAPP
 */

(async function(){
  'use strict';

  // --- Inserisci il tuo token Cesium ion ---
  Cesium.Ion.defaultAccessToken = 'INSERISCI_IL_TUO_TOKEN_CESIUM_ION';

  // Viewer senza globo/immagini: scena “deep space”
  const viewer = new Cesium.Viewer('gl', {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    imageryProvider: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider()
  });

  // Sfondo pulito
  viewer.scene.skyBox = undefined;
  viewer.scene.skyAtmosphere = undefined;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#040a1c');

  // UI refs
  const elFase = document.getElementById('fase');
  const elDist = document.getElementById('dist');
  const elVel  = document.getElementById('vel');
  const elMode = document.getElementById('mode');
  const elBarF = document.getElementById('barfill');

  // --- Parametri scala ---
  const AU_KM = 149_597_870;        // km
  const R_SCALE = 3000;             // raggio compresso
  const DIST_AU_SCALE = 1.0;
  const compressAU = (au) => DIST_AU_SCALE * Math.pow(au, 0.60); // curva di compressione
  const KM_TO_M = 1000;

  // Tempo simulazione
  const J2000 = Date.UTC(2000,0,1,12);
  const daysSinceJ2000 = (tms) => (tms - J2000)/86400000;

  // Dati orbitali minimi
  // a UA, e eccentr., P giorni, R raggio km
  const PLANETS = [
    {name:'Mercurio', a:0.387, e:0.2056, P:87.969,  R:2440,  color:'#c7b49a'},
    {name:'Venere',   a:0.723, e:0.0068, P:224.701, R:6052,  color:'#d8c7b0'},
    {name:'Terra',    a:1.000, e:0.0167, P:365.256, R:6371,  color:'#6fb1ff'},
    {name:'Luna',     a:1.00257, e:0.0549, P:27.322, R:1737, color:'#b8c0d0', moon:true}, // orbita attorno alla Terra (sempl.)
    {name:'Marte',    a:1.524, e:0.0934, P:686.980, R:3390,  color:'#c66f3d'},
    {name:'Giove',    a:5.204, e:0.0489, P:4332.59, R:69911, color:'#d2a06f'},
    {name:'Saturno',  a:9.582, e:0.0565, P:10759.2,R:58232, color:'#d9c59b', ring:{inner:74_500, outer:140_220}},
    {name:'Urano',    a:19.201,e:0.0463, P:30688.5,R:25362, color:'#9ad0e8', ring:{inner:37_000, outer:51_000}},
    {name:'Nettuno',  a:30.047,e:0.0086, P:60182.0,R:24622, color:'#5ea7ff', ring:{inner:41_900, outer:62_900}},
  ];

  // Keplero (sufficiente per visual)
  function keplerE(M,e){ let E=M; for(let i=0;i<5;i++) E = M + e*Math.sin(E); return E; }
  function heliocentricPosAU(planet, tDays, phase=0){
    const n = 2*Math.PI/planet.P;
    const M = n*tDays + phase;
    const E = keplerE(M, planet.e);
    const a = planet.a, e = planet.e;
    const x = a*(Math.cos(E) - e);
    const y = a*Math.sqrt(1 - e*e)*Math.sin(E);
    return {x, y, z:0};
  }

  // Entità pianeta
  function createPlanetEntity(p){
    const radius = p.R / R_SCALE;
    const ent = viewer.entities.add({
      name: p.name,
      position: Cesium.Cartesian3.ZERO,
      ellipsoid: {
        radii: new Cesium.Cartesian3(radius, radius, radius),
        material: p.color,
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.15)
      },
      label: {
        text: p.name,
        font: '14px system-ui',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        pixelOffset: new Cesium.Cartesian2(0, - (radius*1.4)),
        translucencyByDistance: new Cesium.NearFarScalar(1e7, 1.0, 1e13, 0.0)
      }
    });

    if (p.ring){
      ent._ring = addRingPrimitive(ent, p.ring.inner/R_SCALE, p.ring.outer/R_SCALE, p.color);
    }
    return ent;
  }

  // Geometria ring (piano XY locale)
  Cesium.RingGeometry = function({innerRadius, outerRadius}){
    const positions = [];
    const st = [];
    const N = 128;
    for(let i=0;i<=N;i++){
      const th = i/N * Math.PI*2;
      const c = Math.cos(th), s = Math.sin(th);
      positions.push(outerRadius*c, outerRadius*s, 0);
      positions.push(innerRadius*c, innerRadius*s, 0);
      st.push(1,1, 0,0);
    }
    return new Cesium.Geometry({
      attributes: {
        position: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.DOUBLE,
          componentsPerAttribute:3,
          values:new Float64Array(positions)
        }),
        st: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute:2,
          values:new Float32Array(st)
        })
      },
      indices: new Uint16Array([...Array(N).keys()].flatMap(i=>[2*i,2*i+1,2*i+2, 2*i+1,2*i+3,2*i+2])),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: new Cesium.BoundingSphere(new Cesium.Cartesian3(0,0,0), outerRadius)
    });
  };

  function addRingPrimitive(hostEntity, innerR, outerR, colorCss){
    const geom = Cesium.RingGeometry({ innerRadius: innerR, outerRadius: outerR });

    const material = Cesium.Material.fromType('Stripe', {
      horizontal: true,
      evenColor: Cesium.Color.fromCssColorString(colorCss).withAlpha(0.40),
      oddColor: Cesium.Color.TRANSPARENT,
      repeat: 80
    });

    const appearance = new Cesium.MaterialAppearance({
      material,
      translucent: true,
      flat: true
    });

    const prim = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({ geometry: geom }),
      appearance,
      asynchronous: false
    });

    viewer.scene.primitives.add(prim);
    prim._host = hostEntity;
    return prim;
  }

  // Crea le entità
  const bodies = PLANETS.map(p => ({ data:p, entity: createPlanetEntity(p) }));

  // Picking semplice (click su pianeta)
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(function(click){
    const p = viewer.scene.pick(click.position);
    if (Cesium.defined(p) && p.id && p.id.name){
      focus(p.id.name);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Aggiornamento posizioni continuo
  viewer.scene.preRender.addEventListener(function(scene, time){
    const now = Cesium.JulianDate.toDate(viewer.clock.currentTime).getTime();
    const tDays = daysSinceJ2000(now);

    // posizione Terra (per Luna e per HUD distanza)
    const terr = bodies.find(b=>b.data.name==='Terra');
    let terraPos = null;

    bodies.forEach((b, idx)=>{
      if (b.data.name === 'Luna') return; // la calcoliamo dopo attorno alla Terra

      const posAU = heliocentricPosAU(b.data, tDays, idx*0.3);
      const rAU = Math.hypot(posAU.x, posAU.y);
      const scale = compressAU(rAU);
      const nx = (posAU.x/(rAU||1));
      const ny = (posAU.y/(rAU||1));

      const x = nx * scale * AU_KM * KM_TO_M;
      const y = ny * scale * AU_KM * KM_TO_M;
      const cart = new Cesium.Cartesian3(x, y, 0);

      b.entity.position = cart
