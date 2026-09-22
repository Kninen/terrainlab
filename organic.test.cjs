const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const controls={};
for(const [id,value] of Object.entries({outlineMode:'organic',curveSize:2,irregularity:65,seed:21,depth:3,sideWidth:2,shadowColor:'#000000',shadowOpacity:40,grassColor:'#88aa44',tileShape:'square'}))controls[id]={value};
for(const id of ['mask','transparentBase','transparentOverlay'])controls[id]={checked:false};
controls.edgeStyle={value:'smooth'};controls.rough={value:2};
function canvas(w,h){const c={width:w,height:h,calls:[]};c.ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:d=>{c.pixels=d.data;},createPattern:()=>({}),fillRect(){},drawImage:(...args)=>c.calls.push(args)};return c;}
const env=vm.createContext({controls,canvas,assert,console});
vm.runInContext(`let T=16;const W=24,H=16,$=id=>controls[id],cells=new Uint8Array(W*H);let base=canvas(T,T),overlay=canvas(T,T);const sideDirections=[];function sideSettings(){return {}}function surface(w=T,h=T){return canvas(w,h)}function context(c){return c.ctx}function flatMapDimensions(){return isHex()?[(W+.5)*T,(H*.75+.25)*T]:[W*T,H*T]}`,env);
const app=fs.readFileSync(__dirname+'/app.js','utf8');
vm.runInContext(app.slice(app.indexOf('function rng('),app.indexOf('\nfunction surface(')),env);
vm.runInContext(fs.readFileSync(__dirname+'/hex.js','utf8'),env);
vm.runInContext(fs.readFileSync(__dirname+'/organic.js','utf8'),env);
vm.runInContext(`
const count=map=>map.mask.pixels.reduce((n,a,i)=>n+(i%4===3&&a>0?1:0),0);
assert.equal(count(organicMap()),0,'empty map');
cells[8*W+12]=1;assert(count(organicMap())>0,'isolated painted cell survives');
cells.fill(0);for(let y=3;y<13;y++)for(let x=2;x<22;x++)cells[y*W+x]=1;
const first=organicMap();assert.equal(organicMap(),first,'unchanged map uses cache');
organicCache=null;assert.deepEqual(organicMap().mask.pixels,first.mask.pixels,'deterministic mask');
$('seed').value=44;assert.notDeepEqual(organicMap().mask.pixels,first.mask.pixels,'seed changes outline');
$('curveSize').value=5;const large=organicMap();$('curveSize').value=.5;assert.notDeepEqual(organicMap().mask.pixels,large.mask.pixels,'curve size changes outline');
$('irregularity').value=0;const regular=organicMap();$('irregularity').value=100;assert.notDeepEqual(organicMap().mask.pixels,regular.mask.pixels,'irregularity changes outline');
for(const shape of ['square','hex']){
 $('tileShape').value=shape;
 const styled=[];
 for(const style of ['smooth','organic','stepped','jagged']){
  $('edgeStyle').value=style;const map=organicMap();styled.push(map.mask.pixels);
  assert.equal(organicAtlasMetadata().outline.edgeStyle,style);
  organicCache=null;assert.deepEqual(organicMap().mask.pixels,map.mask.pixels,'style is deterministic');
 }
 for(let i=0;i<styled.length;i++)for(let j=i+1;j<styled.length;j++)assert.notDeepEqual(styled[i],styled[j],'edge styles produce different contours');
 $('rough').value=0;const zero=organicMap().mask.pixels;$('edgeStyle').value='smooth';assert.deepEqual(organicMap().mask.pixels,zero,'zero roughness keeps the smooth contour');$('rough').value=2;
 $('tileShape').value=shape;const result=organicMap(),meta=organicAtlasMetadata(),atlas=organicAtlasCanvas();
 assert.equal(atlas.calls[0][0],result.terrain,'atlas copies exact unprojected render');
 assert.equal(meta.tiles.length,meta.atlas.columns*meta.atlas.rows);
 for(const t of meta.tiles){assert.equal(t.x,t.mapX);assert.equal(t.y,t.mapY);assert(t.x+T<=atlas.width&&t.y+T<=atlas.height);}
 if(shape==='hex')for(let y=0;y<result.mask.height;y++)for(let x=0;x<result.mask.width;x++)if(result.mask.pixels[(y*result.mask.width+x)*4+3])assert(hexPosition(x+.5,y+.5),'hex mask remains in footprint');
 $('mask').checked=true;assert.equal(organicAtlasCanvas().calls[0][0],organicMap().mask,'mask atlas uses same outline');$('mask').checked=false;
 $('transparentOverlay').checked=true;const cutout=organicMap();assert.equal(cutout.terrain.calls[0][0],cutout.mask,'cutout uses identical mask');$('transparentOverlay').checked=false;
}
console.log('PASS: empty/isolated maps, determinism, controls, cache, hex footprint, mask/cutout composition, and exact atlas placement.');
`,env);
