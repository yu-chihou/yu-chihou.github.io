(() => {
  'use strict';

  function initializeTorus() {
  const root = document.getElementById('torus-flow-visual');
  if (!root || root.dataset.torusInitialized === 'true') return;
  const canvas = root.querySelector('#torus-canvas');
  const criticalSelect = root.querySelector('#torus-critical');
  const viewSelect = root.querySelector('#torus-view');
  const stableCheck = root.querySelector('#torus-stable');
  const unstableCheck = root.querySelector('#torus-unstable');
  const play = root.querySelector('#torus-play');
  const probe = root.querySelector('.torus-probe');
  const stableLabel = root.querySelector('#torus-stable-label');
  const unstableLabel = root.querySelector('#torus-unstable-label');
  const cutKey = root.querySelector('#torus-cut-key');
  const viewKey = root.querySelector('#torus-view-key');
  const detail = root.querySelector('#torus-detail');
  const turnLeft = root.querySelector('#torus-turn-left');
  const turnRight = root.querySelector('#torus-turn-right');
  const frontView = root.querySelector('#torus-front-view');
  if (![canvas, criticalSelect, viewSelect, stableCheck, unstableCheck, play,
        probe, stableLabel, unstableLabel, cutKey, viewKey, detail].every(Boolean)) return;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch { /* Keep the page text available. */ }
  if (!ctx) {
    detail.textContent = 'The interactive view is unavailable in this browser.';
    for (const control of [criticalSelect, viewSelect, stableCheck, unstableCheck,
                           play, turnLeft, turnRight, frontView]) {
      if (control) control.disabled = true;
    }
    return;
  }
  const sceneCanvas = document.createElement('canvas');
  const sceneContext = sceneCanvas.getContext('2d');
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d');
  if (!colorContext) return;
  root.dataset.torusInitialized = 'true';
  canvas.style.touchAction = 'pan-y';

  // X(u,v) = ((R+r cos v) sin u, r sin v, (R+r cos v) cos u).
  // With the induced metric and f=z, this is exactly the negative gradient.
  // All angles are periodic modulo 2π; the critical endpoints are excluded
  // from the other critical points' stable and unstable manifolds.
  const PI = Math.PI, TAU = 2*PI, R = 2.05, r = 0.76;
  const criticals = [
    {id:'M', u:0, v:0, name:'maximum', index:2},
    {id:'p', u:0, v:PI, name:'upper saddle', index:1},
    {id:'q', u:PI, v:PI, name:'lower saddle', index:1},
    {id:'m', u:PI, v:0, name:'minimum', index:0}
  ];
  // The shared surface controller explicitly activates one renderer at a time.
  let active=false, prepared=false;
  const isActive=()=>active&&!root.hidden&&root.isConnected;
  let width=0, height=0, yaw=0.48, pitch=0.12;
  let colors, mesh=[], grid=[], trajectories=[], trajectories3D=[], particles=[];
  let animation=null, animationStart=0, dirty=true, frameQueued=false;
  let projectedCriticals=[], drag=null;
  let squareProjection=null;
  let cameraCosYaw=1, cameraSinYaw=0, cameraCosPitch=1, cameraSinPitch=0, projectionScale=1;
  let labelFont='', selectedLabelFont='';
  const worldCurves = new WeakMap();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const point = (u,v) => [(R+r*Math.cos(v))*Math.sin(u), r*Math.sin(v), (R+r*Math.cos(v))*Math.cos(u)];
  const normal = (u,v) => [Math.cos(v)*Math.sin(u), Math.sin(v), Math.cos(v)*Math.cos(u)];
  const velocity = (u,v) => [Math.sin(u)/(R+r*Math.cos(v)), Math.cos(u)*Math.sin(v)/r];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const mix = (a,b,t) => a.map((x,i)=>Math.round(x*(1-t)+b[i]*t));
  const rgb = a => 'rgb('+a.map(x=>Math.round(x)).join(',')+')';
  function readColor(token,background) {
    probe.style.color='var('+token+')';
    const value=getComputedStyle(probe).color;
    colorContext.clearRect(0,0,1,1);
    colorContext.fillStyle=value; colorContext.fillRect(0,0,1,1);
    const bytes=Array.from(colorContext.getImageData(0,0,1,1).data);
    return background?mix(background,bytes.slice(0,3),bytes[3]/255):bytes.slice(0,3);
  }
  function palette() {
    if(!isActive()||document.hidden){dirty=true;return;}
    const bg=readColor('--background');
    colors={bg,fg:readColor('--foreground',bg),muted:readColor('--muted-foreground',bg),border:readColor('--border',bg),s:readColor('--viz-series-1',bg),u:readColor('--viz-series-2',bg)};
    readTypography();
    requestDraw();
  }
  function readTypography() {
    const style=getComputedStyle(root);
    labelFont='400 '+style.fontSize+' '+style.fontFamily;
    selectedLabelFont='500 '+style.fontSize+' '+style.fontFamily;
  }
  function prepareProjection() {
    cameraCosYaw=Math.cos(yaw); cameraSinYaw=Math.sin(yaw);
    cameraCosPitch=Math.cos(pitch); cameraSinPitch=Math.sin(pitch);
    projectionScale=Math.min((width-68)/(2*(R+r)),(height-72)/(2*(R+r)));
  }
  function project(p) {
    const ca=cameraCosYaw,sa=cameraSinYaw,ce=cameraCosPitch,se=cameraSinPitch;
    const sideways=p[0]*ca-p[1]*sa;
    const forward=p[0]*sa+p[1]*ca;
    const up=p[2]*ce-forward*se;
    const scale=projectionScale;
    return {x:width*.5+sideways*scale,y:height*.5-up*scale,d:forward*ce+p[2]*se};
  }
  function buildMesh() {
    const nu=88,nv=40;
    for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
      const u=i*TAU/nu,v=j*TAU/nv,du=TAU/nu,dv=TAU/nv;
      const pts=[point(u,v),point(u+du,v),point(u+du,v+dv),point(u,v+dv)];
      mesh.push({pts,n:normal(u+du/2,v+dv/2)});
    }
    for(let i=0;i<12;i++)grid.push(makeCurve('meridian',i*TAU/12,0,TAU,100));
    for(let j=0;j<8;j++)grid.push(makeCurve('parallel',j*TAU/8,0,TAU,140));
  }
  function makeCurve(kind,fixed,a,b,count=180) {
    return Array.from({length:count+1},(_,i)=>{
      const t=a+(b-a)*i/count;
      return kind==='meridian'?[fixed,t]:[t,fixed];
    });
  }
  const saddleCurves={
    pStable:makeCurve('meridian',0,.035,TAU-.035),
    pUnstable:makeCurve('parallel',PI,-PI+.025,PI-.025),
    qStable:makeCurve('parallel',PI,.025,TAU-.025),
    qUnstable:makeCurve('meridian',PI,.035,TAU-.035)
  };
  const closedCurves={
    upper:makeCurve('meridian',0,0,TAU),
    lower:makeCurve('meridian',PI,0,TAU),
    rim:makeCurve('parallel',PI,0,TAU),
    squareUpper:makeCurve('meridian',0,-PI/2,3*PI/2),
    squareLower:makeCurve('meridian',PI,-PI/2,3*PI/2),
    squareRim:makeCurve('parallel',PI,-PI/2,3*PI/2)
  };
  function selectedSets() {
    const id=criticalSelect.value,sets=[];
    if(id==='p') {
      if(stableCheck.checked)sets.push({kind:'s',curve:saddleCurves.pStable});
      if(unstableCheck.checked)sets.push({kind:'u',curve:saddleCurves.pUnstable});
    } else if(id==='q') {
      if(stableCheck.checked)sets.push({kind:'s',curve:saddleCurves.qStable});
      if(unstableCheck.checked)sets.push({kind:'u',curve:saddleCurves.qUnstable});
    }
    return sets;
  }
  function areaKind() {
    return criticalSelect.value==='M'&&unstableCheck.checked?'u':criticalSelect.value==='m'&&stableCheck.checked?'s':null;
  }
  function rk4(uv,h) {
    const a=velocity(...uv),b=velocity(uv[0]+h*a[0]/2,uv[1]+h*a[1]/2),c=velocity(uv[0]+h*b[0]/2,uv[1]+h*b[1]/2),d=velocity(uv[0]+h*c[0],uv[1]+h*c[1]);
    return uv.map((x,i)=>x+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
  }
  function orbit(seed) {
    const backward=[],forward=[];
    let uv=seed.slice();
    for(let k=0;k<470;k++){backward.push(uv);uv=rk4(uv,-.035);}
    uv=seed.slice();
    for(let k=0;k<470;k++){forward.push(uv);uv=rk4(uv,.035);}
    return backward.reverse().concat(forward.slice(1));
  }
  function prepareOrbits() {
    trajectories=[];
    for(const sign of [-1,1])for(const v of [.45,1.15,2.1,3.85,5.1])trajectories.push(orbit([sign*PI/2,v]));
    trajectories3D=trajectories.map(uvs=>uvs.filter((_,i)=>i%4===0));
  }
  function path2D(points,color,lineWidth=2,dashed=false,alpha=1) {
    if(points.length<2)return;
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';
    if(dashed)ctx.setLineDash([8,5]);
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.stroke();ctx.restore();
  }
  function arrow(p,q,color,size=6,alpha=1) {
    const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);if(len<.1)return;
    const ux=dx/len,uy=dy/len;
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;
    ctx.beginPath();ctx.moveTo(p.x+ux*size,p.y+uy*size);ctx.lineTo(p.x-ux*size*.65-uy*size*.65,p.y-uy*size*.65+ux*size*.65);ctx.lineTo(p.x-ux*size*.65+uy*size*.65,p.y-uy*size*.65-ux*size*.65);ctx.closePath();ctx.fill();ctx.restore();
  }
  function haloText(text,x,y,align='left',weight='400') {
    ctx.save();ctx.textAlign=align;ctx.textBaseline='middle';
    ctx.font=weight==='500'?selectedLabelFont:labelFont;
    ctx.lineWidth=4;ctx.strokeStyle=rgb(colors.bg);ctx.lineJoin='round';ctx.strokeText(text,x,y);ctx.fillStyle=rgb(colors.fg);ctx.fillText(text,x,y);ctx.restore();
  }
  function drawMarker(cp,p,label=true) {
    const active=cp.id===criticalSelect.value;
    ctx.save();
    if(active&&(stableCheck.checked||unstableCheck.checked)){
      if(stableCheck.checked){ctx.strokeStyle=rgb(colors.s);ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,10,0,TAU);ctx.stroke();}
      if(unstableCheck.checked){ctx.strokeStyle=rgb(colors.u);ctx.lineWidth=3;ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(p.x,p.y,stableCheck.checked?14:10,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    }
    ctx.fillStyle=active?rgb(colors.fg):rgb(colors.bg);ctx.strokeStyle=rgb(colors.fg);ctx.lineWidth=1.7;
    ctx.beginPath();ctx.arc(p.x,p.y,active?4.5:4,0,TAU);ctx.fill();ctx.stroke();ctx.restore();
    if(label){
      let x=p.x+20,y=p.y,align='left';
      if(viewSelect.value==='torus'){
        if(cp.id==='M'){x=p.x+20;y=p.y-9;}
        if(cp.id==='m'){x=p.x+20;y=p.y+9;}
        if(width<450){x=p.x+20;}
      }
      let text=width<450?cp.id:cp.id+' · '+cp.name;
      ctx.save();ctx.font=labelFont;
      const tw=ctx.measureText(text).width;ctx.restore();
      if(x+tw>width-10){x=p.x-20;align='right';}
      if(x-tw<0&&align==='right'){text=cp.id;x=p.x+20;align='left';}
      haloText(text,x,y,align,active?'500':'400');
    }
  }
  function torusDraw() {
    prepareProjection();
    const records=[];const area=areaKind();
    const light=[-.35,.5,.79];
    mesh.forEach(face=>{
      const pts=face.pts.map(project),depth=pts.reduce((s,p)=>s+p.d,0)/4;
      const shade=.09+.13*(1-Math.max(-.5,dot(face.n,light)));
      let color=mix(colors.bg,colors.fg,shade);
      if(area)color=mix(color,colors[area],.26);
      records.push({type:'face',pts,d:depth,color:rgb(color)});
    });
    function segments(uvs,color,lw,alpha=1,dashed=false,bias=.015,cut=false){
      let points=worldCurves.get(uvs);
      if(!points){points=uvs.map(uv=>point(...uv));worldCurves.set(uvs,points);}
      for(let i=0;i<points.length-1;i++){
        if(dashed&&i%8>=5)continue;
        const a=project(points[i]),b=project(points[i+1]);
        records.push({type:'line',a,b,d:(a.d+b.d)/2+bias,color,lw,alpha,cut});
      }
    }
    grid.forEach(uvs=>segments(uvs,rgb(colors.fg),.55,.12));
    if(area){
      trajectories3D.forEach(uvs=>segments(uvs,rgb(colors[area]),1.7,.48,area==='u'));
      const cut=criticalSelect.value==='M'?closedCurves.lower:closedCurves.upper;
      segments(cut,rgb(colors.fg),1.5,.9,false,.035,true);
      segments(closedCurves.rim,rgb(colors.fg),1.5,.9,false,.035,true);
    }
    selectedSets().forEach(set=>segments(set.curve,rgb(colors[set.kind]),3.5,1,set.kind==='u',.065));
    records.sort((a,b)=>a.d-b.d);
    for(const item of records){
      if(item.type==='face'){
        ctx.globalAlpha=.87;ctx.fillStyle=item.color;ctx.beginPath();ctx.moveTo(item.pts[0].x,item.pts[0].y);for(let i=1;i<item.pts.length;i++)ctx.lineTo(item.pts[i].x,item.pts[i].y);ctx.closePath();ctx.fill();
      }else{
        ctx.globalAlpha=item.alpha;
        if(item.cut){ctx.strokeStyle=rgb(colors.bg);ctx.lineWidth=5.5;ctx.beginPath();ctx.moveTo(item.a.x,item.a.y);ctx.lineTo(item.b.x,item.b.y);ctx.stroke();}
        ctx.strokeStyle=item.color;ctx.lineWidth=item.lw;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(item.a.x,item.a.y);ctx.lineTo(item.b.x,item.b.y);ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
    drawFlowArrows(uv=>project(point(...uv)));
    projectedCriticals=criticals.map(cp=>({cp,p:project(point(cp.u,cp.v))}));
    const ax=width-23,ay=height-70;
    path2D([{x:ax,y:ay+35},{x:ax,y:ay-8}],rgb(colors.muted),1.1);
    arrow({x:ax,y:ay-8},{x:ax,y:ay-18},rgb(colors.muted),4);
    haloText('z',ax,ay-22,'center');
  }
  function arrowSeeds() {
    const id=criticalSelect.value,seeds=[];
    const meridianSeeds=viewSelect.value==='square'?[PI/2,5*PI/4]:[PI/2,3*PI/2];
    const rimSeeds=viewSelect.value==='square'?[PI/2,5*PI/4]:[PI/2,-PI/2];
    if(id==='p'){
      if(stableCheck.checked)for(const v of meridianSeeds)seeds.push({uv:[0,v],kind:'s'});
      if(unstableCheck.checked)for(const u of rimSeeds)seeds.push({uv:[u,PI],kind:'u'});
    }else if(id==='q'){
      if(stableCheck.checked)for(const u of rimSeeds)seeds.push({uv:[u,PI],kind:'s'});
      if(unstableCheck.checked)for(const v of meridianSeeds)seeds.push({uv:[PI,v],kind:'u'});
    }else if(areaKind()){
      trajectories.forEach((path,i)=>seeds.push({uv:path[435+(i%3)*50],kind:areaKind()}));
    }
    return seeds;
  }
  function drawFlowArrows(projectUV) {
    for(const {uv,kind} of arrowSeeds()){
      const vel=velocity(...uv),p=projectUV(uv),q=projectUV([uv[0]+vel[0]*.035,uv[1]+vel[1]*.035]);
      if(Math.abs(p.x-q.x)<width*.4&&Math.abs(p.y-q.y)<height*.4)arrow(p,q,rgb(colors[kind]),6.5);
    }
  }
  function squareDraw() {
    const left=65,top=24,right=width-24,bottom=height-53;
    const lo=-PI/2;
    const wrap=a=>((a-lo)%TAU+TAU)%TAU+lo;
    const pUV=uv=>({x:left+(wrap(uv[0])-lo)/TAU*(right-left),y:bottom-(wrap(uv[1])-lo)/TAU*(bottom-top)});
    squareProjection=pUV;
    const raw=(u,v)=>({x:left+(u-lo)/TAU*(right-left),y:bottom-(v-lo)/TAU*(bottom-top)});
    const area=areaKind();
    if(area){ctx.fillStyle=rgb(mix(colors.bg,colors[area],.15));ctx.fillRect(left,top,right-left,bottom-top);}
    ctx.strokeStyle=rgb(colors.border);ctx.lineWidth=1;ctx.strokeRect(left,top,right-left,bottom-top);
    const ticks=[[-PI/2,'−π/2'],[0,'0'],[PI,'π'],[3*PI/2,'3π/2']];
    for(const [t,label] of ticks){
      const p=raw(t,t);
      path2D([{x:p.x,y:top},{x:p.x,y:bottom}],rgb(colors.border),.7,false,.6);
      path2D([{x:left,y:p.y},{x:right,y:p.y}],rgb(colors.border),.7,false,.6);
      haloText(label,p.x,bottom+18,'center');haloText(label,left-12,p.y,'right');
    }
    haloText('u (radians)',(left+right)/2,height-12,'center');
    ctx.save();ctx.translate(15,(top+bottom)/2);ctx.rotate(-PI/2);haloText('v (radians)',0,0,'center');ctx.restore();
    function drawUVCurve(uvs,color,lw,dashed=false,alpha=1){
      let segment=[];
      for(const uv of uvs){
        const p=pUV(uv);
        if(segment.length&&(Math.abs(p.x-segment[segment.length-1].x)>(right-left)/2||Math.abs(p.y-segment[segment.length-1].y)>(bottom-top)/2)){path2D(segment,color,lw,dashed,alpha);segment=[];}
        segment.push(p);
      }
      path2D(segment,color,lw,dashed,alpha);
    }
    ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
    if(area){
      trajectories.forEach(uvs=>drawUVCurve(uvs,rgb(colors[area]),1.5,area==='u',.42));
      const cut=criticalSelect.value==='M'?closedCurves.squareLower:closedCurves.squareUpper;
      for(const path of [cut,closedCurves.squareRim]){
        drawUVCurve(path,rgb(colors.bg),7);drawUVCurve(path,rgb(colors.fg),1.4);
      }
    }
    selectedSets().forEach(set=>drawUVCurve(set.curve,rgb(colors[set.kind]),3.5,set.kind==='u'));
    drawFlowArrows(pUV);ctx.restore();
    projectedCriticals=criticals.map(cp=>({cp,p:pUV([cp.u,cp.v])}));
  }
  function drawParticles(projectUV){
    for(const particle of particles){
      const p=projectUV(particle.uv);ctx.save();ctx.fillStyle=rgb(colors[particle.kind]);ctx.strokeStyle=rgb(colors.bg);ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,5,0,TAU);ctx.fill();ctx.stroke();ctx.restore();
    }
  }
  function draw() {
    if(!isActive()||!colors||document.hidden||width<=0||height<=0)return;
    ctx.clearRect(0,0,width,height);
    if(dirty||!sceneContext){
      if(viewSelect.value==='torus')torusDraw();else squareDraw();
      if(sceneContext){
        sceneContext.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);
        sceneContext.drawImage(canvas,0,0);
      }
    }else{
      ctx.drawImage(sceneCanvas,0,0,sceneCanvas.width,sceneCanvas.height,0,0,width,height);
    }
    if(viewSelect.value==='torus')drawParticles(uv=>project(point(...uv)));
    else{
      ctx.save();ctx.beginPath();ctx.rect(65,24,width-89,height-77);ctx.clip();
      drawParticles(squareProjection);ctx.restore();
    }
    projectedCriticals.forEach(({cp,p})=>drawMarker(cp,p));
    dirty=false;
  }
  function requestDraw(){
    dirty=true;
    if(isActive()&&!document.hidden&&!frameQueued){
      frameQueued=true;
      requestAnimationFrame(()=>{frameQueued=false;if(dirty)draw();});
    }
  }
  function resize(){
    if(!isActive()||document.hidden){dirty=true;return;}
    const bounds=canvas.getBoundingClientRect();width=bounds.width;height=bounds.height;
    if(width<=0||height<=0)return;
    const ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    sceneCanvas.width=canvas.width;sceneCanvas.height=canvas.height;
    ctx.setTransform(ratio,0,0,ratio,0,0);readTypography();requestDraw();
  }
  function flowLabel(){return reduced.matches?'Show flow positions':'Follow flow';}
  function stopAnimation(clearParticles=true){
    if(animation!==null)cancelAnimationFrame(animation);
    animation=null;play.textContent=flowLabel();
    if(clearParticles)particles=[];
  }
  function update(){
    stopAnimation();endDrag();
    const cp=criticals.find(x=>x.id===criticalSelect.value);
    if(!cp)return;
    stableLabel.textContent='Stable · '+(2-cp.index)+'D';
    unstableLabel.textContent='Unstable · '+cp.index+'D';
    cutKey.hidden=!areaKind();
    viewKey.textContent=viewSelect.value==='torus'?'Drag horizontally to rotate · arrows point downhill':'Opposite edges identified · arrows follow the flow';
    const descriptions={M:'M · Morse index 2 · stable point; unstable open region',p:'p · Morse index 1 · two incoming branches, two outgoing branches',q:'q · Morse index 1 · two incoming branches, two outgoing branches',m:'m · Morse index 0 · stable open region; unstable point'};
    detail.textContent=descriptions[cp.id];
    canvas.setAttribute('aria-label',(viewSelect.value==='torus'?'Rotatable upright torus. ':'Unwrapped torus with opposite edges identified. ')+cp.name+' selected. Stable manifold dimension '+(2-cp.index)+', unstable manifold dimension '+cp.index+'. Solid curves are stable; dashed curves are unstable. Hollow critical points are excluded.');
    canvas.style.cursor=viewSelect.value==='torus'?'grab':'default';
    for(const button of [turnLeft,turnRight,frontView])if(button)button.disabled=viewSelect.value!=='torus';
    play.disabled=!areaKind()&&!(cp.index===1&&(stableCheck.checked||unstableCheck.checked));
    requestDraw();
  }
  function startAnimation(){
    if(!isActive()||document.hidden||width<=0||height<=0)return;
    if(animation!==null){stopAnimation();requestDraw();return;}
    const id=criticalSelect.value;particles=[];
    const add=(uv,kind)=>particles.push({uv,kind});
    if(id==='p'){
      if(stableCheck.checked){add([0,.15],'s');add([0,-.15],'s');}
      if(unstableCheck.checked){add([.15,PI],'u');add([-.15,PI],'u');}
    }else if(id==='q'){
      if(stableCheck.checked){add([.15,PI],'s');add([-.15,PI],'s');}
      if(unstableCheck.checked){add([PI,PI-.15],'u');add([PI,PI+.15],'u');}
    }else if(areaKind()){
      for(const u of [-.25,.25])for(const v of [-.15,.15,.5])add([u,v],areaKind());
    }
    if(!particles.length)return;
    if(reduced.matches){for(let i=0;i<130;i++)particles.forEach(p=>p.uv=rk4(p.uv,.035));requestDraw();return;}
    play.textContent='Stop flow';animationStart=performance.now();let previous=animationStart;
    function step(now){
      if(!isActive()||document.hidden||width<=0||height<=0){stopAnimation(false);return;}
      const elapsed=(now-animationStart)/1000,delta=Math.min((now-previous)/1000,.08)*1.5;previous=now;
      const n=Math.max(1,Math.ceil(delta/.025));
      for(let k=0;k<n;k++)particles.forEach(p=>p.uv=rk4(p.uv,delta/n));
      draw();
      if(elapsed<9)animation=requestAnimationFrame(step);else{animation=null;play.textContent=flowLabel();}
    }
    animation=requestAnimationFrame(step);
  }
  function endDrag(){
    const current=drag;drag=null;canvas.classList.remove('dragging');
    if(current&&canvas.hasPointerCapture(current.id))canvas.releasePointerCapture(current.id);
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!isActive()||viewSelect.value!=='torus'||event.isPrimary===false||event.button!==0)return;
    endDrag();
    const isTouch=event.pointerType==='touch';
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw,pitch,isTouch,active:!isTouch};
    // Keep vertical touch gestures available for scrolling. Mouse and pen
    // dragging can start immediately; touch rotation starts only horizontally.
    if(!isTouch){canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');}
  });
  canvas.addEventListener('pointermove',event=>{
    if(!isActive()||!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.active){
      if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
      if(Math.abs(dy)>=Math.abs(dx)){endDrag();return;}
      drag.active=true;canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');
    }
    if(event.cancelable)event.preventDefault();
    yaw=drag.yaw+dx*.009;
    pitch=Math.max(-.85,Math.min(.85,drag.pitch+dy*.006));requestDraw();
  },{passive:false});
  const finishPointer=event=>{if(drag&&event.pointerId===drag.id)endDrag();};
  canvas.addEventListener('pointerup',finishPointer);
  canvas.addEventListener('pointercancel',finishPointer);
  canvas.addEventListener('lostpointercapture',finishPointer);
  function turn(delta){
    if(!isActive()||viewSelect.value!=='torus')return;
    endDrag();yaw+=delta;requestDraw();
  }
  if(turnLeft)turnLeft.addEventListener('click',()=>turn(-PI/8));
  if(turnRight)turnRight.addEventListener('click',()=>turn(PI/8));
  if(frontView)frontView.addEventListener('click',()=>{
    if(!isActive()||viewSelect.value!=='torus')return;
    endDrag();yaw=.48;pitch=.12;requestDraw();
  });
  criticalSelect.addEventListener('change',update);viewSelect.addEventListener('change',update);
  stableCheck.addEventListener('change',update);unstableCheck.addEventListener('change',update);play.addEventListener('click',startAnimation);
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize',resize);
  new MutationObserver(palette).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});
  const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
  if(systemTheme.addEventListener)systemTheme.addEventListener('change',palette);
  else if(systemTheme.addListener)systemTheme.addListener(palette);
  const motionChanged=()=>{stopAnimation(false);requestDraw();};
  if(reduced.addEventListener)reduced.addEventListener('change',motionChanged);
  else if(reduced.addListener)reduced.addListener(motionChanged);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){stopAnimation(false);endDrag();}
    else if(isActive()){palette();resize();}
  });
  root.addEventListener('manifold:deactivate',()=>{
    active=false;stopAnimation(false);endDrag();
  });
  root.addEventListener('manifold:activate',()=>{
    active=true;
    if(!prepared){buildMesh();prepareOrbits();prepared=true;update();}
    palette();resize();
  });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initializeTorus,{once:true});
  }else initializeTorus();
})();
