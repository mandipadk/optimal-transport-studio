import React, { useEffect, useRef, useState } from 'react'
import { samplePointsFromImage } from '../core/sampling'

export function DrawCanvas({ onUse }: { onUse: (url: string)=>void }){
  const ref = useRef<HTMLCanvasElement>(null)
  const [brush, setBrush] = useState(14)
  const [down, setDown] = useState(false)

  useEffect(()=>{
    const c=ref.current!; const W=360,H=240; const dpr=Math.min(2,window.devicePixelRatio||1)
    c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px'
    const ctx=c.getContext('2d')!; ctx.setTransform(dpr,0,0,dpr,0,0)
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H)
    const draw=(x:number,y:number)=>{ ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,brush,0,Math.PI*2); ctx.fill() }
    const onmove=(e:MouseEvent)=>{ if(!down) return; const r=c.getBoundingClientRect(); draw(e.clientX-r.left, e.clientY-r.top) }
    const ondown=(e:MouseEvent)=>{ setDown(true); const r=c.getBoundingClientRect(); draw(e.clientX-r.left, e.clientY-r.top) }
    const onup=()=> setDown(false)
    c.addEventListener('mousemove', onmove); c.addEventListener('mousedown', ondown); window.addEventListener('mouseup', onup)
    return ()=>{ c.removeEventListener('mousemove', onmove); c.removeEventListener('mousedown', ondown); window.removeEventListener('mouseup', onup) }
  },[brush])

  const clear = ()=>{ const c=ref.current!; const ctx=c.getContext('2d')!; ctx.fillStyle='#000'; ctx.fillRect(0,0,c.width,c.height) }
  const useAs = ()=>{ const url = ref.current!.toDataURL('image/png'); onUse(url) }

  return (
    <div className="card">
      <h4>Sketch (mass brush)</h4>
      <div className="row"><span>Brush</span><input className="range" type="range" min="4" max="40" step="1" value={brush} onChange={e=>setBrush(parseInt(e.target.value))}/><span className="badge">{brush}</span></div>
      <canvas ref={ref} style={{border:'1px solid #232530', background:'#000', borderRadius:8}}/>
      <div className="row">
        <button className="btn" onClick={clear}>Clear</button>
        <button className="btn primary" onClick={useAs}>Use Drawing</button>
        <span className="small">White = mass, Black = empty.</span>
      </div>
    </div>
  )
}
