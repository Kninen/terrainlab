'use strict';
let T=32;
const W=24,H=16,$=id=>document.getElementById(id);
const directions=[[0,-1,1],[1,0,2],[0,1,4],[-1,0,8],[1,-1,16],[1,1,32],[-1,1,64],[-1,-1,128]];
function normalize(b){if((b&3)!==3)b&=~16;if((b&6)!==6)b&=~32;if((b&12)!==12)b&=~64;if((b&9)!==9)b&=~128;return b;}
const variants=[...new Set(Array.from({length:256},(_,i)=>normalize(i)))].sort((a,b)=>a-b);
function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function surface(w=T,h=T){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function context(c){const x=c.getContext('2d');x.imageSmoothingEnabled=false;return x;}
let cells=new Uint8Array(W*H),tiles=new Map(),masks=new Map(),base,overlay,tool=1,drawing=false,last=null;
const images={};
let mapZoom=1;
function updateMapZoom(){
  const viewport=$('mapViewport'),c=$('map');
  viewport.style.height=Math.max(220,Math.min(520,viewport.clientWidth*c.height/c.width+18))+'px';
  c.style.width=viewport.clientWidth*mapZoom+'px';
  $('zoomValue').value=Math.round(mapZoom*100)+'%';
  $('zoomOut').disabled=mapZoom<=1;$('zoomIn').disabled=mapZoom>=8;
}
function setMapZoom(value,clientX,clientY){
  const viewport=$('mapViewport'),c=$('map'),rect=c.getBoundingClientRect(),box=viewport.getBoundingClientRect();
  const anchorX=clientX??box.left+viewport.clientLeft+viewport.clientWidth/2;
  const anchorY=clientY??box.top+viewport.clientTop+viewport.clientHeight/2;
  const u=(anchorX-rect.left)/rect.width,v=(anchorY-rect.top)/rect.height;
  mapZoom=Math.max(1,Math.min(8,value));last=null;
  updateMapZoom();
  const next=c.getBoundingClientRect();
  viewport.scrollLeft+=next.left+u*next.width-anchorX;
  viewport.scrollTop+=next.top+v*next.height-anchorY;
}
function texture(color,seed,img){const c=surface(),x=context(c);x.fillStyle=color;x.fillRect(0,0,T,T);if($('noTexture').checked)return c;if(img){x.drawImage(img,0,0,T,T);return c;}const random=rng(seed);for(let i=0;i<Math.round(75*T*T/1024);i++){x.fillStyle=i%2?'rgba(255,255,190,.13)':'rgba(20,35,10,.13)';x.fillRect(Math.floor(random()*T),Math.floor(random()*T),1+Math.floor(random()*3),1);}return c;}
// A quadrant is governed by its two sides and its diagonal. Canonical profiles
// use distance from the corner so both tiles sharing an edge use identical cuts.
function makeMask(bits,depth,rough,seed,roundness=0.5,style='organic'){const c=surface(),x=context(c),data=x.createImageData(T,T);const noise=rng(seed+87),step=Math.max(2,Math.round(T/8));let block=0;
const profile=Array.from({length:T/2},(_,i)=>{
  // Anchor the shared boundary; both adjoining tiles use this same profile.
  if(i===0||style==='smooth')return 0;
  if(style==='stepped'){if(i===1||i%step===0)block=Math.round((noise()-.5)*rough*2);return block;}
  if(style==='jagged')return (i%2?1:-1)*rough;
  return Math.round((noise()-.5)*rough*2);
});
for(let y=0;y<T;y++)for(let px=0;px<T;px++){const right=px>=T/2,bottom=y>=T/2,u=right?T-1-px:px,v=bottom?T-1-y:y;const horizontal=!!(bits&(right?2:8)),vertical=!!(bits&(bottom?4:1)),diagonal=!!(bits&(bottom?(right?32:64):(right?16:128)));let keep=true;
if(!horizontal&&!vertical){
  const a=u-depth-profile[v],b=v-depth-profile[u];
  const radius=Math.max(0,T/2-depth-1)*roundness;
  const dx=Math.max(0,radius-a),dy=Math.max(0,radius-b);
  keep=a>=0&&b>=0&&(radius===0||dx*dx+dy*dy<=radius*radius);
}
else if(!horizontal)keep=u>=depth+profile[v];else if(!vertical)keep=v>=depth+profile[u];else if(!diagonal)keep=(1-roundness)*Math.max(u,v)+roundness*Math.hypot(u,v)>=depth+profile[Math.min(u,v)];
if(keep){const i=(y*T+px)*4;data.data[i]=data.data[i+1]=data.data[i+2]=data.data[i+3]=255;}}
x.putImageData(data,0,0);return c;}
function rebuild(){const seed=Number($('seed').value)||0,depth=+$('depth').value,rough=+$('rough').value;$('roundValue').value=$('round').value+'%';$('depthValue').value=depth+' px';$('roughValue').value=rough+' px';base=$('transparentBase').checked?surface():texture($('base').value,seed,images.base);overlay=texture($('overlay').value,seed+1,images.overlay);tiles.clear();masks.clear();for(const b of activeVariants()){const mask=(isHex()?makeHexMask:makeMask)(b,depth,rough,seed,+$('round').value/100,$('edgeStyle').value),layer=surface(),lx=context(layer);lx.drawImage(overlay,0,0);lx.globalCompositeOperation='destination-in';lx.drawImage(mask,0,0);const tile=surface(),tx=context(tile);tx.drawImage(base,0,0);if($('transparentOverlay').checked){tx.globalCompositeOperation='destination-out';tx.drawImage(mask,0,0);tx.globalCompositeOperation='source-over';}else tx.drawImage(layer,0,0);tiles.set(b,tile);masks.set(b,mask);}applySideEffects();if(isHex())clipHexTiles();renderAtlas();draw();}
const sideDirections=[['Top',0,-1],['Right',1,0],['Bottom',0,1],['Left',-1,0]];
function sideSettings(){return Object.fromEntries(sideDirections.map(([name])=>[name.toLowerCase(),$('side'+name).value]));}
function applySideEffects(){
  $('sideWidthValue').value=$('sideWidth').value+' px';
  $('shadowOpacityValue').value=$('shadowOpacity').value+'%';
  if($('transparentOverlay').checked)return;
  const selected=sideDirections.map(([name,dx,dy])=>[$('side'+name).value,dx,dy]).filter(([mode])=>mode!=='none');
  if(!selected.length)return;
  const width=+$('sideWidth').value,seed=Number($('seed').value)||0;
  const reaches=selected.map(([mode,dx])=>Array.from({length:T},(_,t)=>mode==='grass'?Math.max(1,Math.round(width*(.4+rng(seed+Math.min(t,T-1-t)*7919+(dx?101:211))()*.6))):width));
  for(const b of activeVariants()){
    const alpha=context(masks.get(b)).getImageData(0,0,T,T).data,x=context(tiles.get(b));
    x.save();
    // Search for real contours, including inner corners, never tile borders.
    for(let y=0;y<T;y++)for(let px=0;px<T;px++){
      if(!alpha[(y*T+px)*4+3])continue;
      let shadow=false,grass=false,tip=false;
      selected.forEach(([mode,dx,dy],i)=>{
        const reach=reaches[i][dx?y:px];
        for(let d=1;d<=reach;d++){
          const nx=px+dx*d,ny=y+dy*d;
          if(nx<0||ny<0||nx>=T||ny>=T)break;
          if(isHex()&&!hexInside(nx+.5,ny+.5))break;
          if(!alpha[(ny*T+nx)*4+3]){
            if(mode==='grass'){grass=true;tip=tip||d===reach;}else shadow=true;
            break;
          }
        }
      });
      if(grass){x.globalAlpha=1;x.fillStyle=$('grassColor').value;x.fillRect(px,y,1,1);if(tip){x.globalAlpha=.18;x.fillStyle='#ffffff';x.fillRect(px,y,1,1);}}
      else if(shadow){x.globalAlpha=+$('shadowOpacity').value/100;x.fillStyle=$('shadowColor').value;x.fillRect(px,y,1,1);}
    }
    x.restore();
  }
}
function bitAt(x,y){let b=0;for(const [dx,dy,bit]of directions){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<W&&ny<H&&cells[ny*W+nx])b|=bit;}return normalize(b);}
function drawFlatTo(c,grid=false){const x=context(c),maskMode=$('mask').checked;x.clearRect(0,0,c.width,c.height);for(let y=0;y<H;y++)for(let col=0;col<W;col++){if(cells[y*W+col])x.drawImage((maskMode?masks:tiles).get(bitAt(col,y)),col*T,y*T);else if(!maskMode)x.drawImage(base,col*T,y*T);}if(grid){x.strokeStyle='rgba(25,35,18,.18)';x.lineWidth=1;x.beginPath();for(let i=1;i<W;i++){x.moveTo(i*T+.5,0);x.lineTo(i*T+.5,H*T);}for(let i=1;i<H;i++){x.moveTo(0,i*T+.5);x.lineTo(W*T,i*T+.5);}x.stroke();}}
function isIsometric(){return $('mapView').value==='isometric';}
function flatMapDimensions(){return isHex()?[Math.ceil((W+.5)*T),Math.ceil((H*.75+.25)*T)]:[W*T,H*T];}
function mapDimensions(){const [w,h]=flatMapDimensions();return isIsometric()?[Math.ceil((w+h)/2),Math.ceil((w+h)/4)]:[w,h];}
function drawTo(c,grid=false){
  const render=isHex()?drawHexTo:drawFlatTo;
  if(!isIsometric()){render(c,grid);return;}
  // Project the complete flat map so adjacent tile edges cannot develop seams.
  const [w,h]=flatMapDimensions(),flat=surface(w,h);render(flat,grid);
  const x=context(c);x.clearRect(0,0,c.width,c.height);
  x.save();x.setTransform(.5,.25,-.5,.25,h/2,0);x.drawImage(flat,0,0);x.restore();
}
function draw(){
  const c=$('map'),[width,height]=mapDimensions();
  if(c.width!==width||c.height!==height){c.width=width;c.height=height;}
  updateMapZoom();
  drawTo(c,$('grid').checked);
  c.parentElement.classList.toggle('transparency-preview',isHex()||isIsometric()||$('mask').checked||$('transparentBase').checked||$('transparentOverlay').checked);
}
function renderAtlas(){const host=$('atlas');host.replaceChildren();for(const b of activeVariants()){const c=surface();context(c).drawImage(($('mask').checked?masks:tiles).get(b),0,0);c.title=`Neighbor mask ${b} · 0x${b.toString(16).padStart(2,'0')}`;host.append(c);}}
function example(){cells.fill(0);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const island=((x-8)/6)**2+((y-7)/5)**2<1;const second=((x-18)/3.5)**2+((y-10)/3)**2<1;const hole=(x===7||x===8)&&(y===6||y===7);if((island||second)&&!hole)cells[y*W+x]=1;}draw();}
function setTool(v){tool=v;for(const [id,value]of [['paint',1],['erase',0]]){$(id).classList.toggle('active',v===value);$(id).setAttribute('aria-pressed',String(v===value));}}
function position(e){
  const c=$('map'),r=c.getBoundingClientRect();
  if(!r.width||!r.height)return null;
  const sx=(e.clientX-r.left)/r.width*c.width,sy=(e.clientY-r.top)/r.height*c.height;
  const offset=flatMapDimensions()[1]/2;
  const x=isIsometric()?sx-offset+2*sy:sx,y=isIsometric()?2*sy-(sx-offset):sy;
  if(isHex())return hexPosition(x,y);
  const col=Math.floor(x/T),row=Math.floor(y/T);
  return col>=0&&col<W&&row>=0&&row<H?[col,row]:null;
}
function stroke(e){const p=position(e);if(!p){last=null;return;}if(isHex()){for(const [x,y] of hexLine(last||p,p))cells[y*W+x]=(e.buttons&2)?0:tool;last=p;draw();return;}const from=last||p,steps=Math.max(Math.abs(p[0]-from[0]),Math.abs(p[1]-from[1]),1);for(let i=0;i<=steps;i++){const x=Math.round(from[0]+(p[0]-from[0])*i/steps),y=Math.round(from[1]+(p[1]-from[1])*i/steps);cells[y*W+x]=(e.buttons&2)?0:tool;}last=p;draw();}
$('map').addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;drawing=true;last=null;$('map').setPointerCapture(e.pointerId);stroke(e);});$('map').addEventListener('pointermove',e=>{if(drawing)stroke(e);});for(const event of ['pointerup','pointercancel','lostpointercapture'])$('map').addEventListener(event,()=>{drawing=false;last=null;});$('map').addEventListener('contextmenu',e=>e.preventDefault());
$('paint').onclick=()=>setTool(1);$('erase').onclick=()=>setTool(0);$('demo').onclick=example;$('clear').onclick=()=>{cells.fill(0);draw();};for(const id of ['base','overlay','depth','rough','round','seed','edgeStyle'])$(id).addEventListener('input',()=>{if(id==='base'||id==='overlay')delete images[id];rebuild();});$('grid').onchange=draw;$('mask').onchange=()=>{renderAtlas();draw();};$('reseed').onclick=()=>{$('seed').value=Math.floor(Math.random()*1000000);rebuild();};
for(const kind of ['base','overlay'])$(kind+'File').onchange=()=>{const file=$(kind+'File').files[0];if(!file)return;const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{images[kind]=img;URL.revokeObjectURL(url);rebuild();$('status').textContent=`Loaded ${kind} texture: ${file.name}`;};img.onerror=()=>{URL.revokeObjectURL(url);$('status').textContent='That image could not be loaded. Try a PNG or JPG.';};img.src=url;};
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent=`Exported ${name}`;}
function download(c,name){c.toBlob(blob=>{if(blob)downloadBlob(blob,name);});}
function squareMetadata(){
  const maskMode=$('mask').checked;
  const names=['N','E','S','W','NE','SE','SW','NW'];
  return {
    schema:'terrain-lab-blob-atlas',version:1,
    image:maskMode?'terrain-masks.png':'terrain-atlas.png',
    mode:maskMode?'alpha-mask':'composited-terrain',
    atlas:{tileWidth:T,tileHeight:T,width:8*T,height:6*T,columns:8,rows:6,tileCount:47,padding:0,spacing:0,order:'row-major',indexBase:0,origin:'top-left',xAxis:'right',yAxis:'down',unusedIndices:[47]},
    rendering:{filter:'nearest',maskMeaning:'Opaque white keeps the overlay; transparent pixels discard it.',terrainMeaning:'Base is transparent when settings.transparentBase is true. When settings.transparentOverlay is true, the mask cuts a transparent hole out of the base; otherwise the masked overlay is composited on top. Both toggles produce fully transparent terrain tiles. Mask exports always retain the white shape regardless of terrain transparency.',emptyCells:'Draw the base terrain separately (or leave transparent in mask mode). Mask 0 is an isolated occupied tile, not an empty cell.',baseOnlyTileIncluded:false},
    neighbors:directions.map(([dx,dy,bit],i)=>({direction:names[i],dx,dy,bit})),
    selection:{
      occupied:'A cell belongs to the overlay terrain. Set a neighbor bit only when that neighbor belongs to the same terrain.',
      outsideMap:'Treat out-of-bounds neighbors as unoccupied.',
      combine:'Bitwise OR the occupied neighbor bits, then normalize diagonals before selecting a tile.',
      diagonalRequirements:{NE:['N','E'],SE:['S','E'],SW:['S','W'],NW:['N','W']},
      normalizeJavaScript:normalize.toString(),
      lookup:'Use rawMaskToTileIndex[rawMask] for any raw 8-bit mask (0–255), or find tiles[].neighborMask matching the normalized mask.'
    },
    rawMaskToTileIndex:Array.from({length:256},(_,b)=>variants.indexOf(normalize(b))),
    tiles:variants.map((b,index)=>({index,column:index%8,row:Math.floor(index/8),x:(index%8)*T,y:Math.floor(index/8)*T,width:T,height:T,neighborMask:b,neighbors:names.filter((_,i)=>b&directions[i][2])})),
    settings:{edgeStyle:$('edgeStyle').value,transparentBase:$('transparentBase').checked,transparentOverlay:$('transparentOverlay').checked,baseColor:$('base').value,overlayColor:$('overlay').value,noTexture:$('noTexture').checked,seed:Number($('seed').value)||0,edgeDepthPx:+$('depth').value,roughnessPx:+$('rough').value,roundnessPercent:+$('round').value,customBaseTextureLoaded:!!images.base,customOverlayTextureLoaded:!!images.overlay},
    sideEffects:{sides:sideSettings(),widthPx:+$('sideWidth').value,shadowColor:$('shadowColor').value,shadowOpacityPercent:+$('shadowOpacity').value,grassColor:$('grassColor').value,placement:'inside-overlay',cornerPriority:'grass',appliesTo:'visible-overlay-only'},
    notes:['This metadata describes the current export settings. Export its PNG without changing settings.','Uploaded source images are not embedded; the PNG contains the rendered result.','This is a custom atlas format; an engine importer must use the supplied coordinates and neighbor lookup.']
  };
}
function atlasMetadata(){const meta=squareMetadata();return isHex()?hexMetadata(meta):meta;}
$('exportJson').onclick=()=>downloadBlob(new Blob([JSON.stringify(atlasMetadata(),null,2)+'\n'],{type:'application/json'}),atlasMetadata().image.replace('.png','.json'));
$('exportAtlas').onclick=()=>{const c=surface(8*T,(isHex()?8:6)*T),x=context(c);activeVariants().forEach((b,i)=>x.drawImage(($('mask').checked?masks:tiles).get(b),(i%8)*T,Math.floor(i/8)*T));download(c,atlasMetadata().image);};$('exportMap').onclick=()=>{const c=surface(...mapDimensions());drawTo(c);download(c,'terrain-map'+(isHex()?'-hex':'')+(isIsometric()?'-isometric':'')+'.png');};
for(const id of ['sideTop','sideRight','sideBottom','sideLeft','sideWidth','shadowColor','shadowOpacity','grassColor'])$(id).addEventListener('input',rebuild);
for(const id of ['noTexture','transparentBase','transparentOverlay'])$(id).onchange=rebuild;
$('tileSize').onchange=()=>{
  const previous=T;T=Number($('tileSize').value);
  // Scale edge settings with the tile, keeping them within each quadrant.
  for(const [id,min,max] of [['depth',1,Math.floor(T*3/8)],['rough',0,Math.floor(T/8)],['sideWidth',1,Math.floor(T/4)]]){
    const control=$(id),scaled=Math.round(Number(control.value)*T/previous);
    control.min=min;control.max=max;control.value=Math.max(min,Math.min(max,scaled));
  }
  $('map').width=W*T;$('map').height=H*T;
  $('tileSizeHint').textContent=T;$('tileSizeFooter').textContent=T+' × '+T;
  rebuild();
};
$('tileShape').onchange=()=>{
  drawing=false;last=null;
  $('round').disabled=isHex();
  $('atlasCount').textContent=isHex()?'64 HEX VARIANTS':'47 CONNECTED VARIANTS';
  $('topologyFooter').textContent=isHex()?'6-NEIGHBOR HEX AUTOTILING':'8-NEIGHBOR BLOB AUTOTILING';
  $('shapeHint').textContent=isHex()?'Hex tiles use six neighbors and support normal and isometric views. Roundness is available for square tiles.':'Square tiles support normal and isometric views.';
  rebuild();
};
$('mapView').onchange=()=>{drawing=false;last=null;draw();};
$('zoomIn').onclick=()=>setMapZoom(mapZoom*1.25);
$('zoomOut').onclick=()=>setMapZoom(mapZoom/1.25);
$('zoomFit').onclick=()=>{setMapZoom(1);$('mapViewport').scrollLeft=0;$('mapViewport').scrollTop=0;};
$('mapViewport').addEventListener('wheel',e=>{
  if(e.ctrlKey||e.metaKey||e.shiftKey||!e.deltaY)return;
  e.preventDefault();
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?$('mapViewport').clientHeight:1);
  setMapZoom(mapZoom*Math.exp(-Math.max(-120,Math.min(120,delta))*.002),e.clientX,e.clientY);
},{passive:false});
new ResizeObserver(updateMapZoom).observe($('mapViewport'));
rebuild();example();
