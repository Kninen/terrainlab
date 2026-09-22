'use strict';
let organicCache=null,organicPreview=null;
function organicEnabled(){return $('outlineMode').value==='organic'||forestEnabled();}
function organicSettings(){return {curveSizeTiles:+$('curveSize').value,irregularityPercent:+$('irregularity').value,seed:Number($('seed').value)||0,edgeStyle:$('edgeStyle').value,roughnessPx:+$('rough').value,forest:forestEnabled()?forestSettings():null};}
function organicEdgeSample(x,y,settings){
  const rough=settings.roughnessPx,style=settings.edgeStyle;
  if(!rough||style==='smooth')return [x+.5,y+.5,0];
  if(style==='stepped'){
    const step=1+Math.round(rough);
    return [(Math.floor(x/step)+.5)*step,(Math.floor(y/step)+.5)*step,0];
  }
  const detail=style==='jagged'?(((x+y)%4<2)?1:-1):outlineNoise(x/Math.max(2,rough*2),y/Math.max(2,rough*2),settings.seed+8191)*2-1;
  return [x+.5,y+.5,detail*rough/T*.45];
}
function smoothField(src,w,h,r){
  const tmp=new Float32Array(src.length),out=new Float32Array(src.length),n=2*r+1;
  for(let y=0;y<h;y++){let sum=0;for(let k=0;k<=r;k++)sum+=src[y*w+k]||0;for(let x=0;x<w;x++){tmp[y*w+x]=sum/n;if(x-r>=0)sum-=src[y*w+x-r];if(x+r+1<w)sum+=src[y*w+x+r+1];}}
  for(let x=0;x<w;x++){let sum=0;for(let k=0;k<=r;k++)sum+=tmp[k*w+x]||0;for(let y=0;y<h;y++){out[y*w+x]=sum/n;if(y-r>=0)sum-=tmp[(y-r)*w+x];if(y+r+1<h)sum+=tmp[(y+r+1)*w+x];}}
  return out;
}
function fieldSample(a,w,h,x,y){
  x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);
  return (a[iy*w+ix]*(1-fx)+a[iy*w+jx]*fx)*(1-fy)+(a[jy*w+ix]*(1-fx)+a[jy*w+jx]*fx)*fy;
}
function outlineNoise(x,y,seed){
  const ix=Math.floor(x),iy=Math.floor(y),sx=x-ix,sy=y-iy,fx=sx*sx*(3-2*sx),fy=sy*sy*(3-2*sy);
  const hash=(a,b)=>rng(seed+Math.imul(a,374761393)+Math.imul(b,668265263))();
  return (hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx)*(1-fy)+(hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx)*fy;
}
function organicMap(){
  const settings=organicSettings(),key=JSON.stringify([T,isHex(),settings,Array.from(cells),$('depth').value,$('mask').checked,$('transparentBase').checked,$('transparentOverlay').checked,sideSettings(),$('sideWidth').value,$('shadowColor').value,$('shadowOpacity').value,$('grassColor').value]);
  if(organicCache?.key===key&&organicCache.base===base)return organicCache;
  const [w,h]=flatMapDimensions(),scale=Math.min(1,24/T),fw=Math.ceil(w*scale),fh=Math.ceil(h*scale),raw=new Float32Array(fw*fh);
  for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
    const px=(x+.5)/scale,py=(y+.5)/scale,p=isHex()?hexPosition(px,py):[Math.floor(px/T),Math.floor(py/T)];
    if(p&&p[0]>=0&&p[0]<W&&p[1]>=0&&p[1]<H)raw[y*fw+x]=cells[p[1]*W+p[0]];
  }
  // Smooth the painted region globally, then vary its contour with slow world-space noise.
  // No tile-local curve is repeated or restarted at cell boundaries.
  const radius=Math.max(1,Math.round(T*scale*.42));
  const field=smoothField(smoothField(raw,fw,fh,radius),fw,fh,radius),noise=new Float32Array(fw*fh),noiseY=new Float32Array(fw*fh);
  for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
    const u=x/(scale*T*settings.curveSizeTiles),v=y/(scale*T*settings.curveSizeTiles);
    noise[y*fw+x]=outlineNoise(u,v,settings.seed)*2-1;
    noiseY[y*fw+x]=outlineNoise(u,v,settings.seed+104729)*2-1;
  }
  const mask=surface(w,h),mx=context(mask),data=mx.createImageData(w,h),alpha=new Uint8Array(w*h),amount=settings.irregularityPercent/100*.23,threshold=.5+Math.min(.1,+$('depth').value/T*.3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const [sampleX,sampleY,detail]=organicEdgeSample(x,y,settings),fx=sampleX*scale-.5,fy=sampleY*scale-.5;
    if(isHex()&&!hexPosition(x+.5,y+.5))continue;
    const nx=fieldSample(noise,fw,fh,fx,fy),ny=fieldSample(noiseY,fw,fh,fx,fy),warp=amount*T*scale*2;
    if(fieldSample(field,fw,fh,fx+nx*warp,fy+ny*warp)>threshold+nx*amount*.5+detail){alpha[y*w+x]=1;data.data.fill(255,(y*w+x)*4,(y*w+x)*4+4);}
  }
  const crowns=settings.forest?growForestCanopy(alpha,w,h,settings.forest,settings.seed):[];
  if(settings.forest)for(let i=0;i<alpha.length;i++)if(alpha[i])data.data.fill(255,i*4,i*4+4);
  mx.putImageData(data,0,0);
  const terrain=surface(w,h),tx=context(terrain),layer=surface(w,h),lx=context(layer);
  tx.fillStyle=tx.createPattern(base,'repeat');tx.fillRect(0,0,w,h);
  if($('transparentOverlay').checked){tx.globalCompositeOperation='destination-out';tx.drawImage(mask,0,0);tx.globalCompositeOperation='source-over';}
  else{
    if(settings.forest)lx.drawImage(forestLayer(alpha,w,h,settings.forest,crowns),0,0);
    else{lx.fillStyle=lx.createPattern(overlay,'repeat');lx.fillRect(0,0,w,h);lx.globalCompositeOperation='destination-in';lx.drawImage(mask,0,0);lx.globalCompositeOperation='source-over';}
    const selected=sideDirections.map(([name,dx,dy])=>[$('side'+name).value,dx,dy]).filter(([mode])=>mode!=='none'),width=+$('sideWidth').value;
    if(selected.length)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(!alpha[y*w+x])continue;
      let shadow=false,grass=false;
      for(const [mode,dx,dy] of selected){const reach=mode==='grass'?Math.max(1,Math.round(width*(.4+rng(settings.seed+(dx?y:x)*7919)()*.6))):width;
        for(let d=1;d<=reach;d++){const nx=x+dx*d,ny=y+dy*d;if(nx<0||ny<0||nx>=w||ny>=h||!alpha[ny*w+nx]){if(mode==='grass')grass=true;else shadow=true;break;}}
      }
      if(grass||shadow){lx.globalAlpha=grass?1:+$('shadowOpacity').value/100;lx.fillStyle=grass?$('grassColor').value:$('shadowColor').value;lx.fillRect(x,y,1,1);}
    }
    tx.drawImage(layer,0,0);
  }
  if(isHex()){
    const boundary=surface(w,h),bx=context(boundary),pixels=bx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(hexPosition(x+.5,y+.5))pixels.data.fill(255,(y*w+x)*4,(y*w+x)*4+4);
    bx.putImageData(pixels,0,0);tx.globalCompositeOperation='destination-in';tx.drawImage(boundary,0,0);tx.globalCompositeOperation='source-over';
  }
  organicCache={key,base,mask,terrain};return organicCache;
}
function drawOrganicTo(c,grid){
  const map=organicMap(),x=context(c);x.clearRect(0,0,c.width,c.height);x.drawImage($('mask').checked?map.mask:map.terrain,0,0);
  if(!grid)return;
  x.strokeStyle='rgba(25,35,18,.25)';x.lineWidth=1;
  if(isHex()){for(let row=0;row<H;row++)for(let col=0;col<W;col++){hexPath(x,...hexOrigin(col,row));x.stroke();}}
  else{x.beginPath();for(let col=1;col<W;col++){x.moveTo(col*T+.5,0);x.lineTo(col*T+.5,c.height);}for(let row=1;row<H;row++){x.moveTo(0,row*T+.5);x.lineTo(c.width,row*T+.5);}x.stroke();}
}
function organicAtlasMetadata(){
  const [w,h]=flatMapDimensions(),columns=Math.ceil(w/T),rows=Math.ceil(h/T);
  return {schema:'terrain-lab-baked-map-atlas',version:1,image:$('mask').checked?'terrain-organic-masks.png':'terrain-organic-atlas.png',mode:$('mask').checked?'alpha-mask':'composited-terrain',atlas:{tileWidth:T,tileHeight:T,width:columns*T,height:rows*T,columns,rows,tileCount:columns*rows,padding:0,spacing:0,order:'row-major'},map:{width:w,height:h,paintedColumns:W,paintedRows:H,shape:isHex()?'hex':'square',projection:'top-down',cells:Array.from(cells)},outline:organicSettings(),tiles:Array.from({length:columns*rows},(_,i)=>({index:i,x:i%columns*T,y:Math.floor(i/columns)*T,width:T,height:T,mapX:i%columns*T,mapY:Math.floor(i/columns)*T})),notes:['Map-specific rectangular raster chunks. Place tiles at mapX/mapY; do not select by neighbor mask.','The atlas is top-down, including for hex maps. Clip reconstruction to map.width/map.height.','Map PNG uses the selected view. Re-export PNG and JSON after painting or changing settings.']};
}
function organicAtlasCanvas(){const meta=organicAtlasMetadata(),map=organicMap(),c=surface(meta.atlas.width,meta.atlas.height);context(c).drawImage($('mask').checked?map.mask:map.terrain,0,0);return c;}
function renderOrganicAtlas(){
  const host=$('atlas'),meta=organicAtlasMetadata(),map=organicMap(),source=$('mask').checked?map.mask:map.terrain;host.replaceChildren();
  for(const tile of meta.tiles){const c=surface();context(c).drawImage(source,tile.x,tile.y,T,T,0,0,T,T);c.title=`Map tile ${tile.index} · ${tile.mapX}, ${tile.mapY}`;host.append(c);}
  organicPreview=map;
}
function syncOutlineControls(){
  $('forestControls').hidden=!forestEnabled();
  $('canopySizeValue').value=$('canopySize').value+' tiles';$('canopyRimValue').value=$('canopyRim').value+'%';
  const organic=organicEnabled();$('curveSize').disabled=!organic;$('irregularity').disabled=!organic;
  $('curveSizeValue').value=$('curveSize').value+' tiles';$('irregularityValue').value=$('irregularity').value+'%';
  $('round').disabled=organic||isHex();$('rough').disabled=false;$('edgeStyle').disabled=false;
  $('atlasCount').textContent=organic?'MAP-SPECIFIC TILES':isHex()?'64 HEX VARIANTS':'47 CONNECTED VARIANTS';
  $('exportAtlas').textContent=organic?'Export organic map tiles ↗':'Export tile atlas ↗';
}
