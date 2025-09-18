import React, { useEffect, useRef, useState } from 'react'
import { samplePointsFromImage } from '../core/sampling'

export function DrawCanvas({ onUse }: { onUse: (url: string)=>void }){
  const ref = useRef<HTMLCanvasElement>(null)
  const [brush, setBrush] = useState(14)
  const [down, setDown] = useState(false)

  useEffect(()=>{
    const c=ref.current!; const W=240,H=160; const dpr=Math.min(2,window.devicePixelRatio||1)
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

  const clear = ()=>{ const c=ref.current!; const W=240,H=160; const ctx=c.getContext('2d')!; ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H) }
  const useAs = ()=>{ const url = ref.current!.toDataURL('image/png'); onUse(url) }

  return (
    <div>
      <div className="studio-form-group">
        <label className="studio-form-label">Brush Size</label>
        <input
          className="studio-range w-full"
          type="range"
          min="4"
          max="40"
          step="1"
          value={brush}
          onChange={e=>setBrush(parseInt(e.target.value))}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>4</span>
          <span className="studio-text-mono">{brush}</span>
          <span>40</span>
        </div>
      </div>
      <canvas
        ref={ref}
        style={{
          border:'1px solid oklch(0.2000 0.0160 240)',
          background:'#000',
          borderRadius:'0.5rem',
          display: 'block',
          width: '100%',
          height: 'auto'
        }}
      />
      <div className="flex gap-2 mt-2">
        <button className="studio-button studio-button--secondary flex-1" onClick={clear}>
          <i data-lucide="eraser" className="w-3 h-3"></i>
          Clear
        </button>
        <button className="studio-button studio-button--primary flex-1" onClick={useAs}>
          <i data-lucide="check" className="w-3 h-3"></i>
          Use
        </button>
      </div>
      <div className="studio-text-caption mt-1">
        White = mass, Black = empty
      </div>
    </div>
  )
}
