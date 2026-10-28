import type { StudioAPI } from './studio-types';

export function download(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export const safeName=(name:string)=>name.replace(/[^\p{L}\p{N}\-_ ]/gu,'').trim().replace(/\s+/g,'-').slice(0,70)||'ascii-scene';
export function exportDimensions(api:StudioAPI,longEdge:number) {
  const {width,height}=api.getState(),ratio=width/height;
  return ratio>=1?{width:Math.round(longEdge/2)*2,height:Math.max(2,Math.round(longEdge/ratio/2)*2)}:{width:Math.max(2,Math.round(longEdge*ratio/2)*2),height:Math.round(longEdge/2)*2};
}
export async function exportPNG(api:StudioAPI,longEdge:number) {
  const size=exportDimensions(api,longEdge);
  try {api.setOutputSize(size);return await new Promise<Blob>((resolve,reject)=>api.getCanvas().toBlob(blob=>blob?resolve(blob):reject(new Error('The image could not be exported.')),'image/png'));}
  finally{api.setOutputSize(null);}
}
export const videoType=()=>typeof MediaRecorder==='undefined'?'':['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type))??'';

export async function exportVideo(api:StudioAPI,longEdge:number,seconds:number,signal:AbortSignal,onProgress:(percent:number)=>void):Promise<{blob:Blob;extension:string}> {
  const mime=videoType();if(!mime||!HTMLCanvasElement.prototype.captureStream)throw new Error('Video recording is unavailable in this browser. Try Chrome or Edge, or export a PNG.');
  const previous=api.getState(),size=exportDimensions(api,longEdge);
  const chunks:Blob[]=[];
  let stream:MediaStream|undefined;
  let recorder:MediaRecorder|undefined,animation=0;
  try {
    api.seek(0);api.setOutputSize(size);
    stream=api.getCanvas().captureStream(0);
    const track=stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000});
    const recording=recorder;
    await new Promise<void>((resolve,reject)=>{
      recording.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recording.onerror=()=>reject(new Error('Video recording failed. Try a smaller output size.'));
      recording.onstop=()=>signal.aborted?reject(new DOMException('Export cancelled.','AbortError')):resolve();
      const abort=()=>{if(recording.state!=='inactive')recording.stop();};signal.addEventListener('abort',abort,{once:true});
      const start=performance.now();let last=-1;
      function tick(now:number){if(signal.aborted)return;const elapsed=(now-start)/1000;
        if(elapsed>=seconds){recording.stop();signal.removeEventListener('abort',abort);return;}
        const frame=Math.floor(elapsed*30);if(frame!==last){last=frame;api.seek(elapsed);track.requestFrame();onProgress(elapsed/seconds*100);}
        animation=requestAnimationFrame(tick);
      }
      recording.start(250);track.requestFrame();animation=requestAnimationFrame(tick);
    });
    if(chunks.reduce((sum,chunk)=>sum+chunk.size,0)<256)throw new Error('No video frames were recorded. Try a smaller output size or another browser.');onProgress(100);
    return{blob:new Blob(chunks,{type:mime}),extension:mime.includes('mp4')?'mp4':'webm'};
  }finally{cancelAnimationFrame(animation);if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(track=>track.stop());api.setOutputSize(null);api.seek(previous.time);if(!previous.paused&&!(previous.scene==='lilies'&&previous.time>=4.2))api.togglePause();}
}
