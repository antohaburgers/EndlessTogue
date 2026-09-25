export class Particles {
  constructor() { this.smoke=[]; this.trails=[]; }
  update(dt, car, state) {
    const s=Math.min(1,state.slip*2.2)*(state.drift?1:0); const a=state.angle;
    if(s>.1) { for(let i=0;i<Math.ceil(s*3);i++){ const side=i%2?1:-1; const x=state.x-Math.sin(a)*1.0+Math.cos(a)*side*.42, y=state.y+Math.cos(a)*1.0+Math.sin(a)*side*.42; this.smoke.push({x,y,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,r:.12+Math.random()*.2,life:.55+Math.random()*.5}); } }
    if(s>.28) { const side=Math.random()>.5?1:-1; this.trails.push({x:state.x-Math.sin(a)*1.0+Math.cos(a)*side*.38,y:state.y+Math.cos(a)*1.0+Math.sin(a)*side*.38,a,life:5}); }
    for(const p of this.smoke){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=dt*.35;} this.smoke=this.smoke.filter(p=>p.life>0).slice(-180);
    for(const p of this.trails)p.life-=dt; this.trails=this.trails.filter(p=>p.life>0).slice(-300);
  }
  draw(ctx, camera, scale) { ctx.save(); for(const p of this.trails){ctx.globalAlpha=Math.min(.22,p.life/5);ctx.fillStyle='#13191b';ctx.fillRect((p.x-camera.x)*scale-2,(p.y-camera.y)*scale-2,4,4);} for(const p of this.smoke){ctx.globalAlpha=Math.max(0,p.life)*.34;ctx.fillStyle='#d5d7d5';ctx.beginPath();ctx.arc((p.x-camera.x)*scale,(p.y-camera.y)*scale,p.r*scale,0,Math.PI*2);ctx.fill();}ctx.restore(); }
}
