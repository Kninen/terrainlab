'use strict';
function forestEnabled(){return $('outlineMode').value==='forest';}
function forestSettings(){return {color:$('forestColor').value,canopySizeTiles:+$('canopySize').value,rimPercent:+$('canopyRim').value};}
function growForestCanopy(alpha,w,h,settings,seed){
  const radius=Math.max(2,T*settings.canopySizeTiles*.36),spacing=Math.max(3,Math.round(radius*1.5)),candidates=new Map();
  // Choose contour points in world-space buckets, never restart crowns at tile seams.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(!alpha[y*w+x])continue;
    if(x>0&&y>0&&x<w-1&&y<h-1&&alpha[y*w+x-1]&&alpha[y*w+x+1]&&alpha[(y-1)*w+x]&&alpha[(y+1)*w+x])continue;
    const gx=Math.floor(x/spacing),gy=Math.floor(y/spacing),key=gx+','+gy,score=(x-(gx+.5)*spacing)**2+(y-(gy+.5)*spacing)**2;
    if(!candidates.has(key)||score<candidates.get(key).score)candidates.set(key,{x,y,score,gx,gy});
  }
  const crowns=[];
  for(const {x,y,gx,gy} of candidates.values()){
    const r=radius*(.8+rng(seed+Math.imul(gx,7919)+Math.imul(gy,104729))()*.4);crowns.push({x,y,r});
    for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(h-1,Math.ceil(y+r));py++)for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(w-1,Math.ceil(x+r));px++){
      if((px-x)**2+(py-y)**2<=r*r&&(!isHex()||hexPosition(px+.5,py+.5)))alpha[py*w+px]=1;
    }
  }
  return crowns;
}
function forestLayer(alpha,w,h,settings,crowns){
  const c=surface(w,h),x=context(c),data=x.createImageData(w,h),rim=Math.max(1,Math.round(T*settings.rimPercent/100)),dist=new Uint16Array(w*h);
  const rgb=settings.color.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16));
  for(let y=0;y<h;y++)for(let px=0;px<w;px++){
    const i=y*w+px;if(alpha[i])dist[i]=Math.min(px?dist[i-1]+1:1,y?dist[i-w]+1:1,rim*3+1);
  }
  for(let y=h-1;y>=0;y--)for(let px=w-1;px>=0;px--){const i=y*w+px;if(alpha[i])dist[i]=Math.min(dist[i],px<w-1?dist[i+1]+1:1,y<h-1?dist[i+w]+1:1);}
  const shade=new Float32Array(w*h);
  if(settings.rimPercent>0){
    for(const {x:cx,y:cy,r} of crowns)for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)for(let px=Math.max(0,Math.floor(cx-r));px<=Math.min(w-1,Math.ceil(cx+r));px++){
      const i=y*w+px,d=Math.hypot(px-cx,y-cy);
      if(alpha[i]&&dist[i]<=rim*3&&d>r-rim&&d<=r)shade[i]=Math.min(shade[i],-.13*(1-(r-d)/rim));
    }
  }
  for(let y=0;y<h;y++)for(let px=0;px<w;px++){
    const i=y*w+px;if(!alpha[i])continue;
    let amount=shade[i];
    if(settings.rimPercent>0){
      if(dist[i]===1)amount=-.35;
      else if(dist[i]<=rim){const up=y<rim||!alpha[(y-rim)*w+px],left=px<rim||!alpha[y*w+px-rim];amount+=((up||left) ? .16 : -.2)*(1-dist[i]/(rim+1));}
    }
    for(let channel=0;channel<3;channel++)data.data[i*4+channel]=Math.round(amount<0?rgb[channel]*(1+amount):rgb[channel]+(255-rgb[channel])*amount);
    data.data[i*4+3]=255;
  }
  x.putImageData(data,0,0);return c;
}
