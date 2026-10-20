/* Base maps: the simple built-in map, or standard web map tiles (OpenStreetMap, topographic,
   satellite, dark streets, NASA night lights) warped onto the globe. Each tile is cut into a grid of
   triangles and each triangle is drawn with its own affine transform, which needs no pixel access,
   so it works with any tile server. Lower-zoom tiles stand in while sharper ones load. */

const BASEMAPS = [
  { id:'simple', name:'Simple' },
  { id:'osm', name:'OpenStreetMap', url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max:19, attr:'© OpenStreetMap contributors' },
  { id:'topo', name:'Topographic', url:'https://tile.opentopomap.org/{z}/{x}/{y}.png', max:17, attr:'© OpenStreetMap contributors, SRTM · map style © OpenTopoMap (CC-BY-SA)' },
  { id:'sat', name:'Satellite', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max:18, attr:'Imagery © Esri, Maxar, Earthstar Geographics' },
  { id:'dark', name:'Dark streets', url:'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', max:19, attr:'© OpenStreetMap contributors © CARTO' },
  { id:'night', name:'Night lights (NASA)', url:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', max:8, attr:'NASA Black Marble 2016 (VIIRS) via GIBS' }
];
S.basemap = store.get('basemap','simple');
function currentBasemap(){ return BASEMAPS.find(b=>b.id===S.basemap) || BASEMAPS[0]; }

const TILES = new Map(); let tileQueue=[], tileActive=0;
function tileKey(bm,z,x,y){ return `${bm.id}/${z}/${x}/${y}`; }
function requestTile(bm,z,x,y){
  const k=tileKey(bm,z,x,y); let t=TILES.get(k);
  if(t) return t;
  t={ img:null, ok:false, err:false, z,x,y }; TILES.set(k,t);
  tileQueue.push(()=>new Promise(res=>{
    const img=new Image(); img.decoding='async';
    img.onload=()=>{ t.img=img; t.ok=true; bm.fails=0; res(); render(); };
    img.onerror=()=>{ t.err=true; bm.fails=(bm.fails||0)+1; res(); if(bm.fails===4) showAttribution(); };
    img.src=bm.url.replace('{z}',z).replace('{x}',x).replace('{y}',y);
  }));
  pumpTiles();
  if(TILES.size>900){ let n=0; for(const [kk,v] of TILES){ if(n++>300) break; if(v.ok||v.err) TILES.delete(kk); } }
  return t;
}
function pumpTiles(){
  while(tileActive<8 && tileQueue.length){ const job=tileQueue.pop(); tileActive++; job().then(()=>{ tileActive--; pumpTiles(); }); }
}
// a loaded tile, or a loaded ancestor plus the source rectangle that covers this tile
function tileOrAncestor(bm,z,x,y){
  for(let dz=0; dz<=4 && z-dz>=0; dz++){
    const zz=z-dz, f=1<<dz, xx=Math.floor(x/f), yy=Math.floor(y/f);
    const t=TILES.get(tileKey(bm,zz,xx,yy));
    if(t && t.ok){ const size=256/f; return { img:t.img, sx:(x-xx*f)*size, sy:(y-yy*f)*size, s:size/256, iw:t.img.naturalWidth/256 }; }
  }
  return null;
}
const mercLat = yy => Math.atan(Math.sinh(Math.PI*(1-2*yy)))*180/Math.PI; // yy: 0..1 across the map
const tileX = (lon,n) => Math.floor((lon+180)/360*n);
const tileY = (lat,n) => { const r=clamp(lat,-85.05,85.05)*Math.PI/180; return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n); };

function drawBasemap(){
  const bm=currentBasemap(); if(!bm.url) return false;
  const r=proj.scale(), center=proj.invert(proj.translate());
  let z=clamp(Math.round(Math.log2(r*2*Math.PI/256)+0.3), 1, bm.max);
  // which tiles are visible: sample the screen
  let minLat=90,maxLat=-90,minLon=180,maxLon=-180, any=false, poleN=false, poleS=false;
  for(let i=0;i<=14;i++) for(let j=0;j<=14;j++){
    const ll=proj.invert([W*j/14,H*i/14]); if(!ll||isNaN(ll[0])||!visiblePt(ll)) continue; any=true;
    minLat=Math.min(minLat,ll[1]); maxLat=Math.max(maxLat,ll[1]); minLon=Math.min(minLon,ll[0]); maxLon=Math.max(maxLon,ll[0]);
  }
  const onScreen = ll => { const q=visiblePt(ll); return q && q[0]>=0 && q[0]<=W && q[1]>=0 && q[1]<=H; };
  if(onScreen([0,89.9])) poleN=true; if(onScreen([0,-89.9])) poleS=true;
  if(!any) return true;
  if(poleN) maxLat=85; if(poleS) minLat=-85;
  const wrap = poleN || poleS || (maxLon-minLon)>300;
  let tiles;
  for(;;){
    const n=1<<z; tiles=[];
    const x0= wrap?0:tileX(minLon,n), x1= wrap?n-1:tileX(maxLon,n), y0=tileY(Math.min(85,maxLat+1),n), y1=tileY(Math.max(-85,minLat-1),n);
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) tiles.push([x,y]);
    if(tiles.length<=48 || z<=1) break; z--;
  }
  const n=1<<z, lo = quality!=='hi';
  const cells = lo ? (z<=3?6:3) : (z<=3?12:z<=5?6:4);
  ctx.save(); ctx.beginPath(); path({type:'Sphere'}); ctx.clip();
  for(const [x,y] of tiles){
    // tile corners must touch the visible hemisphere
    const lonA=x/n*360-180, lonB=(x+1)/n*360-180, latA=mercLat(y/n), latB=mercLat((y+1)/n);
    const mid=[(lonA+lonB)/2,(latA+latB)/2];
    if(center && d3.geoDistance(mid,center) > Math.PI/2 + (lonB-lonA)*Math.PI/180) continue;
    if(!lo) requestTile(bm,z,x,y); else if(!TILES.has(tileKey(bm,z,x,y))) requestTile(bm,z,x,y);
    const src=tileOrAncestor(bm,z,x,y); if(!src) continue;
    // grid of projected points
    const P=[];
    for(let i=0;i<=cells;i++){ const row=[]; for(let j=0;j<=cells;j++){
      const lon=lonA+(lonB-lonA)*j/cells, lat=mercLat((y+i/cells)/n);
      row.push(center && d3.geoDistance([lon,lat],center) < Math.PI/2-0.002 ? proj([lon,lat]) : null);
    } P.push(row); }
    const k=256/cells;
    for(let i=0;i<cells;i++) for(let j=0;j<cells;j++){
      const a=P[i][j], b=P[i][j+1], c=P[i+1][j], d=P[i+1][j+1];
      const S0=[j*k,i*k], S1=[(j+1)*k,i*k], S2=[j*k,(i+1)*k], S3=[(j+1)*k,(i+1)*k];
      if(a&&b&&c) drawTri(src, S0,S1,S2, a,b,c);
      if(b&&d&&c) drawTri(src, S1,S3,S2, b,d,c);
    }
  }
  ctx.restore();
  return true;
}
function drawTri(src, s0,s1,s2, d0,d1,d2){
  // map source pixels (in this tile's 256-px space) to the ancestor image actually loaded
  const m=src.s*src.iw, ox=src.sx*src.iw, oy=src.sy*src.iw;
  const S=[[ox+s0[0]*m, oy+s0[1]*m],[ox+s1[0]*m, oy+s1[1]*m],[ox+s2[0]*m, oy+s2[1]*m]];
  const den = S[0][0]*(S[1][1]-S[2][1]) + S[1][0]*(S[2][1]-S[0][1]) + S[2][0]*(S[0][1]-S[1][1]);
  if(Math.abs(den)<1e-9) return;
  const solve = (p0,p1,p2) => [
    (p0*(S[1][1]-S[2][1]) + p1*(S[2][1]-S[0][1]) + p2*(S[0][1]-S[1][1]))/den,
    (p0*(S[2][0]-S[1][0]) + p1*(S[0][0]-S[2][0]) + p2*(S[1][0]-S[0][0]))/den,
    (p0*(S[1][0]*S[2][1]-S[2][0]*S[1][1]) + p1*(S[2][0]*S[0][1]-S[0][0]*S[2][1]) + p2*(S[0][0]*S[1][1]-S[1][0]*S[0][1]))/den ];
  const [a,c,e]=solve(d0[0],d1[0],d2[0]), [b,d,f]=solve(d0[1],d1[1],d2[1]);
  // clip to the triangle, grown by half a pixel so neighbours overlap without seams
  const cx=(d0[0]+d1[0]+d2[0])/3, cy=(d0[1]+d1[1]+d2[1])/3, g=pt=>{ const dx=pt[0]-cx, dy=pt[1]-cy, l=Math.hypot(dx,dy)||1; return [pt[0]+dx/l*0.6, pt[1]+dy/l*0.6]; };
  const q0=g(d0), q1=g(d1), q2=g(d2);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(q0[0],q0[1]); ctx.lineTo(q1[0],q1[1]); ctx.lineTo(q2[0],q2[1]); ctx.closePath(); ctx.clip();
  ctx.transform(a,b,c,d,e,f);
  ctx.drawImage(src.img,0,0);
  ctx.restore();
}
function showAttribution(){
  const el=$('#attrib'); if(!el) return; const bm=currentBasemap();
  el.hidden = !bm.url;
  el.textContent = bm.url ? (bm.fails>=4 && ![...TILES.values()].some(t=>t.ok) ? `${bm.name} tiles could not be loaded right now.` : bm.attr) : '';
}
function basemapHTML(){
  return `<div class="lgroup"><h3>Base map</h3><div class="chips">${BASEMAPS.map(b=>`<button class="chip radio" data-bm="${b.id}" aria-pressed="${b.id===S.basemap}"><span class="sw" style="background:${({simple:'#142033',osm:'#e8e0d0',topo:'#c9d6a8',sat:'#3b4a2e',dark:'#262b33',night:'#e9b14a'})[b.id]}"></span>${b.name}</button>`).join('')}</div></div>`;
}
function wireBasemap(root){
  root.querySelectorAll('[data-bm]').forEach(b=>b.onclick=()=>{ S.basemap=b.dataset.bm; store.set('basemap',S.basemap); buildLayers(); showAttribution(); render(); });
}
