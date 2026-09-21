'use strict';
const hexVariants=Array.from({length:64},(_,i)=>i);
const hexNames=['E','SE','SW','W','NW','NE'];
function isHex(){return $('tileShape').value==='hex';}
function activeVariants(){return isHex()?hexVariants:variants;}
function hexNeighbors(row){const odd=row&1;return [[1,0,1],[odd,1,2],[odd-1,1,4],[-1,0,8],[odd-1,-1,16],[odd,-1,32]];}
function hexOrigin(col,row){return [(col+(row&1)/2)*T,row*T*.75];}
function hexVertices(){return [[T,T*.25],[T,T*.75],[T/2,T],[0,T*.75],[0,T*.25],[T/2,0]];}
function hexPath(x,ox=0,oy=0){x.beginPath();hexVertices().forEach(([a,b],i)=>i?x.lineTo(ox+a,oy+b):x.moveTo(ox+a,oy+b));x.closePath();}
function hexInside(x,y){return x>=0&&x<T&&y>=0&&y<T&&Math.abs(x-T/2)<=Math.min(T/2,2*y,2*(T-y));}
function hexPosition(x,y){
  const row=Math.floor(y/(T*.75));
  for(let r=row-1;r<=row;r++)for(let c=Math.floor(x/T)-1;c<=Math.floor(x/T);c++){
    const [ox,oy]=hexOrigin(c,r);
    if(c>=0&&c<W&&r>=0&&r<H&&hexInside(x-ox,y-oy))return [c,r];
  }
  return null;
}
function hexBitAt(col,row){let bits=0;for(const [dx,dy,bit] of hexNeighbors(row)){const x=col+dx,y=row+dy;if(x>=0&&x<W&&y>=0&&y<H&&cells[y*W+x])bits|=bit;}return bits;}
function hexLine(from,to){
  const cube=([col,row])=>{const q=col-(row-(row&1))/2;return [q,-q-row,row];};
  const a=cube(from),b=cube(to),steps=Math.max(...a.map((v,i)=>Math.abs(v-b[i])),1),result=[];
  for(let i=0;i<=steps;i++){
    const p=a.map((v,k)=>v+(b[k]-v)*i/steps),r=p.map(Math.round),diff=r.map((v,k)=>Math.abs(v-p[k]));
    const k=diff.indexOf(Math.max(...diff));r[k]=-r[(k+1)%3]-r[(k+2)%3];
    const row=r[2],col=r[0]+(row-(row&1))/2;
    // Offset-grid borders zigzag; keep rounded paths on the boundary cells.
    result.push([Math.max(0,Math.min(W-1,col)),Math.max(0,Math.min(H-1,row))]);
  }
  return result;
}
function makeHexMask(bits,depth,rough,seed,roundness,style){
  const c=surface(),x=context(c),data=x.createImageData(T,T),vertices=hexVertices();
  for(let y=0;y<T;y++)for(let px=0;px<T;px++){
    if(!hexInside(px+.5,y+.5))continue;
    let keep=true;
    for(let i=0;i<6;i++){
      if(bits&(1<<i))continue;
      const [ax,ay]=vertices[i],[bx,by]=vertices[(i+1)%6],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
      const along=Math.max(0,Math.min(1,((px+.5-ax)*dx+(y+.5-ay)*dy)/(len*len)));
      const sample=Math.floor(Math.min(along,1-along)*len);
      const noise=style==='smooth'?0:style==='jagged'?(sample%2?rough:-rough):Math.round((rng(seed+Math.floor(sample/(style==='stepped'?Math.max(1,T/8):1))*7919)()-.5)*rough*2);
      if((dx*(y+.5-ay)-dy*(px+.5-ax))/len<Math.max(0,depth+noise)){keep=false;break;}
    }
    if(keep){const n=(y*T+px)*4;data.data.fill(255,n,n+4);}
  }
  x.putImageData(data,0,0);return c;
}
function clipHexTiles(){const shape=makeHexMask(63,0,0,0);for(const tile of tiles.values()){const x=context(tile);x.save();x.globalCompositeOperation='destination-in';x.drawImage(shape,0,0);x.restore();}}
function drawHexTo(c,grid){
  const x=context(c),maskMode=$('mask').checked;x.clearRect(0,0,c.width,c.height);
  const hexBase=surface(),bx=context(hexBase);bx.drawImage(base,0,0);bx.globalCompositeOperation='destination-in';bx.drawImage(makeHexMask(63,0,0,0),0,0);
  for(let row=0;row<H;row++)for(let col=0;col<W;col++){
    const [ox,oy]=hexOrigin(col,row);
    if(cells[row*W+col])x.drawImage((maskMode?masks:tiles).get(hexBitAt(col,row)),ox,oy);
    else if(!maskMode)x.drawImage(hexBase,ox,oy);
    if(grid){hexPath(x,ox,oy);x.strokeStyle='rgba(25,35,18,.3)';x.lineWidth=1;x.stroke();}
  }
}
function hexMetadata(meta){
  meta.schema='terrain-lab-hex-atlas';meta.image=$('mask').checked?'terrain-hex-masks.png':'terrain-hex-atlas.png';
  Object.assign(meta.atlas,{rows:8,height:8*T,tileCount:64,unusedIndices:[]});
  meta.layout={shape:'pointy-top-hex',coordinates:'odd-r',tileWidth:T,tileHeight:T,columnStep:T,rowStep:.75*T,oddRowOffset:T/2};
  meta.neighbors={evenRows:hexNeighbors(0).map(([dx,dy,bit],i)=>({direction:hexNames[i],dx,dy,bit})),oddRows:hexNeighbors(1).map(([dx,dy,bit],i)=>({direction:hexNames[i],dx,dy,bit}))};
  meta.selection={occupied:'Set bits for the six occupied neighbors using the row parity offsets.',outsideMap:'Treat out-of-bounds neighbors as unoccupied.',combine:'Bitwise OR the six neighbor bits. No diagonal normalization.',lookup:'The neighbor mask is the tile index (0–63).'};
  meta.rawMaskToTileIndex=hexVariants.slice();
  meta.tiles=hexVariants.map((b)=>({index:b,column:b%8,row:Math.floor(b/8),x:b%8*T,y:Math.floor(b/8)*T,width:T,height:T,neighborMask:b,neighbors:hexNames.filter((_,i)=>b&(1<<i))}));
  meta.settings.roundnessPercent=null;
  meta.notes.push('Hex tiles use square image slots with transparent corners. Roundness is unavailable for hex tiles.');
  return meta;
}
