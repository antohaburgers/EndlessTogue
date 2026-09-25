export class Input {
  constructor() { this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = 0; this.stick = document.querySelector('#stick'); this.knob = this.stick.querySelector('span'); this.bind(); }
  bind() {
    let stickId = null;
    const updateStick = e => { const r = this.stick.getBoundingClientRect(), dx = e.clientX - (r.left+r.width/2), max=r.width*.34; this.steer=Math.max(-1,Math.min(1,dx/max)); this.knob.style.transform=`translateX(${this.steer*max}px)`; };
    this.stick.addEventListener('pointerdown', e => { stickId=e.pointerId; this.stick.setPointerCapture(stickId); updateStick(e); });
    this.stick.addEventListener('pointermove', e => { if(e.pointerId===stickId) updateStick(e); });
    const reset=()=>{ stickId=null; this.steer=0; this.knob.style.transform='translateX(0)'; };
    this.stick.addEventListener('pointerup', reset); this.stick.addEventListener('pointercancel', reset);
    this.button('#throttle', 'throttle'); this.button('#brake', 'brake'); this.button('#handbrake', 'handbrake');
  }
  button(sel, prop) { const el=document.querySelector(sel); const on=e=>{e.preventDefault(); el.classList.add('active'); this[prop]=1; el.setPointerCapture?.(e.pointerId);}; const off=()=>{el.classList.remove('active');this[prop]=0;}; el.addEventListener('pointerdown',on); el.addEventListener('pointerup',off); el.addEventListener('pointercancel',off); el.addEventListener('pointerleave', e=>{if(e.buttons===0)off();}); }
  get() { return { steer:this.steer, throttle:this.throttle, brake:this.brake, handbrake:this.handbrake }; }
}
