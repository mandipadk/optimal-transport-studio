import React, { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

export function Exporter({
  renderFrame,
}: {
  renderFrame: (t: number, cvs: HTMLCanvasElement) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [duration, setDuration] = useState(3); // seconds
  const [fps, setFps] = useState(24);
  const [format, setFormat] = useState<"mp4" | "gif">("mp4");
  // ffmpeg state
  const [loaded, setLoaded] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  const load = async () => {
    const baseURL =
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm";
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on("log", ({ message }) => {
      if (messageRef.current) messageRef.current.innerHTML = message;
    });
    // toBlobURL is used to bypass CORS issue, urls with the same
    // domain can be used directly.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
      workerURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.worker.js`,
        "text/javascript"
      ),
    });
    setLoaded(true);
  };

  const exportVideo = async () => {
    setBusy(true);
    setStatus("Loading FFmpeg core...");
    if (!loaded) await load();
    setStatus("FFmpeg core loaded.");
    const ffmpeg = ffmpegRef.current;
    try {
      const frames = Math.max(1, Math.floor(duration * fps));
      const off = document.createElement("canvas");
      off.width = 640;
      off.height = 400;
      // render frames 0..frames-1
      for (let i = 0; i < frames; i++) {
        const t = i / (frames - 1);
        renderFrame(t, off);
        const blob = await new Promise<Blob>((res) =>
          off.toBlob((b) => res(b!), "image/png")
        );
        const buf = new Uint8Array(await blob.arrayBuffer());
        const name = `frame_${String(i).padStart(4, "0")}.png`;
        await ffmpeg.writeFile(name, buf);
        setStatus(`Prepared ${i + 1}/${frames} frames...`);
      }
      // encode
      const out = format === "mp4" ? "out.mp4" : "out.gif";
      setStatus("Encoding...");
      if (format === "mp4") {
        await ffmpeg.exec([
          "-r",
          String(fps),
          "-i",
          "frame_%04d.png",
          "-vcodec",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          out,
        ]);
      } else {
        await ffmpeg.exec([
          "-r",
          String(fps),
          "-i",
          "frame_%04d.png",
          "-vf",
          "palettegen=stats_mode=full[pal],[0:v][pal]paletteuse=new=1",
          out,
        ]);
      }
      const fileData = await ffmpeg.readFile(out);
      const data = new Uint8Array(fileData as unknown as ArrayBuffer);
      const url = URL.createObjectURL(
        new Blob([data.buffer], {
          type: format === "mp4" ? "video/mp4" : "image/gif",
        })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = out;
      a.click();
      setStatus("Done. File downloaded.");
    } catch (e: any) {
      console.error(e);
      setStatus("Export failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h4>Export animation</h4>
      <div className="row">
        <label>Duration (s)</label>
        <input
          className="input"
          type="number"
          value={duration}
          min={1}
          max={20}
          step={1}
          onChange={(e) => setDuration(parseInt(e.target.value))}
        />
        <label>FPS</label>
        <input
          className="input"
          type="number"
          value={fps}
          min={5}
          max={60}
          step={1}
          onChange={(e) => setFps(parseInt(e.target.value))}
        />
        <label>Format</label>
        <select
          className="input"
          value={format}
          onChange={(e) => setFormat(e.target.value as any)}
        >
          <option value="mp4">MP4</option>
          <option value="gif">GIF</option>
        </select>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={exportVideo}>
          Export
        </button>
        <span className="small">{status}</span>
      </div>
      <div className="small">
        Note: first run will download the FFmpeg core in-browser.
      </div>
    </div>
  );
}
