import {chromium}from'@playwright/test';
import {mkdir,readFile,writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const base=process.argv[2]||process.env.PREVIEW_URL||'http://127.0.0.1:5173';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-accelerated-video-encode']});
const errors=[],checks=[];
const pass=message=>{checks.push(message);console.log('PASS '+message);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 const state=()=>page.evaluate(()=>window.asciiStudio.getState());
 const seek=time=>page.evaluate(time=>window.artworkStudio.seek(time),time);
 await page.goto(base+'/?scene=skull&t=0');await page.waitForFunction(()=>!!window.asciiStudio);
 assert.equal(await page.evaluate(()=>document.body.dataset.editor),'false');assert(await page.locator('#viewer-scene').isVisible());assert.equal((await state()).width,1440);await page.locator('#return-studio').click();assert.equal(await page.evaluate(()=>document.body.dataset.editor),'true');
 assert.equal((await state()).scene,'skull');assert(await page.locator('#library').isVisible());
 const first=await page.locator('#stage').screenshot();await seek(4.7);assert(!first.equals(await page.locator('#stage').screenshot()));await seek(0);assert(first.equals(await page.locator('#stage').screenshot()));
 await page.screenshot({path:'test-results/studio-desktop.png'});
 await page.locator('[data-style="terminal"]').click();assert.equal((await state()).settings.palette,'mono');assert.equal((await state()).settings.charset,'binary');assert(!first.equals(await page.locator('#stage').screenshot()));
 await page.selectOption('#character-set','custom');await page.locator('#characters').fill(' .oO@');assert.equal((await state()).settings.characters,' .oO@');
 await page.locator('#reset-look').click();await page.selectOption('#background','ocean');assert.equal((await state()).settings.background,'ocean');await page.selectOption('#background','space');
 await page.locator('#motion-tab').click();await page.selectOption('#motion','still');await page.locator('#rotation').fill('0.7');assert.equal((await state()).settings.motion,'still');await page.locator('#light-angle').fill('45');assert.equal((await state()).settings.lightAngle,45);
 await page.locator('#reset-look').click();await page.locator('#look-tab').click();
 await page.selectOption('#canvas-aspect','square');assert(Math.abs((await state()).width-(await state()).height)<=1);
 pass('live 3D preview, deterministic seeking, styles, custom characters, backgrounds, motion, lighting and aspect controls');

 const image=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=320;const ctx=canvas.getContext('2d');ctx.fillStyle='#f24b36';ctx.fillRect(0,0,320,160);ctx.fillStyle='#3286ef';ctx.fillRect(0,160,320,160);ctx.fillStyle='#fff';ctx.font='bold 80px monospace';ctx.fillText('ASCII',30,180);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
 await page.locator('#file-input').setInputFiles({name:'test-artwork.png',mimeType:'image/png',buffer:image});await page.waitForFunction(()=>window.asciiStudio.getState().scene==='custom'&&window.asciiStudio.getState().assetKind==='image');
 await seek(0);assert.equal((await state()).assetName,'test-artwork.png');assert.equal((await state()).settings.motion,'still');
 await page.screenshot({path:'test-results/studio-image.png'});
 await page.locator('#project-name').fill('My imported scene');await page.locator('#save-project').click();await page.waitForFunction(async()=>(await window.asciiStudio.getProjects()).length===1);
 await page.reload();await page.waitForFunction(()=>!!window.asciiStudio);await page.locator('#project-list .saved-project>button').first().click();await page.waitForFunction(()=>window.asciiStudio.getState().scene==='custom');assert.equal((await state()).assetName,'test-artwork.png');assert.equal((await state()).files.length,1);
 pass('photo import, real ASCII conversion, saving and reloading a scene with its original file');

 await page.locator('#open-export').click();await page.selectOption('#export-size','720');
 let waiting=page.waitForEvent('download');await page.locator('#start-export').click();let result=await waiting;await result.saveAs('test-results/studio-export.png');
 const png=await readFile('test-results/studio-export.png');assert.equal(png.readUInt32BE(16),720);assert.equal(png.readUInt32BE(20),720);assert(png.length>4000);
 await page.locator('#open-export').click();await page.locator('[data-format="project"]').click();waiting=page.waitForEvent('download');await page.locator('#start-export').click();result=await waiting;await result.saveAs('test-results/studio-scene.ascii.json');const project=JSON.parse(await readFile('test-results/studio-scene.ascii.json','utf8'));assert.equal(project.version,1);assert.equal(project.files.length,1);assert(project.files[0].data.startsWith('data:image/png;base64,'));
 await page.locator('[data-preset="skull"]').click();await page.locator('#file-input').setInputFiles('test-results/studio-scene.ascii.json');await page.waitForFunction(()=>window.asciiStudio.getState().scene==='custom'&&window.asciiStudio.getState().assetKind==='image');
 pass('clean PNG download at the selected size and portable scene export/import with embedded artwork');

 const obj='v -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nv -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nf 1 2 3 4\nf 6 5 8 7\nf 5 1 4 8\nf 2 6 7 3\nf 4 3 7 8\nf 5 6 2 1\n';
 await page.locator('#file-input').setInputFiles({name:'cube.obj',mimeType:'text/plain',buffer:Buffer.from(obj)});await page.waitForFunction(()=>window.asciiStudio.getState().assetKind==='model');await seek(0);const model=await page.locator('#stage').screenshot();await seek(2);assert(!model.equals(await page.locator('#stage').screenshot()));await page.screenshot({path:'test-results/studio-model.png'});
 await page.locator('#file-input').setInputFiles({name:'bad.obj',mimeType:'text/plain',buffer:Buffer.from('not a model')});await page.waitForFunction(()=>document.querySelector('#toast').dataset.error==='true');assert.equal((await state()).assetName,'cube.obj');
 pass('OBJ model import, actual 3D rotation and recovery from an invalid model without losing the current artwork');

 const binary=Buffer.from(new Float32Array([-1,-1,0,1,-1,0,0,1,0]).buffer);
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:binary.length}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,-1,0],max:[1,1,0]}]};
 const json=Buffer.from(JSON.stringify(gltf)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const glb=Buffer.alloc(12+8+padded.length+8+binary.length);glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(padded.length,12);glb.writeUInt32LE(0x4e4f534a,16);padded.copy(glb,20);const at=20+padded.length;glb.writeUInt32LE(binary.length,at);glb.writeUInt32LE(0x004e4942,at+4);binary.copy(glb,at+8);
 await page.locator('#file-input').setInputFiles({name:'triangle.glb',mimeType:'model/gltf-binary',buffer:glb});await page.waitForFunction(()=>window.asciiStudio.getState().assetName==='triangle.glb');
 gltf.buffers[0].uri='triangle.bin';await page.locator('#file-input').setInputFiles([{name:'triangle.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(gltf))},{name:'triangle.bin',mimeType:'application/octet-stream',buffer:binary}]);await page.waitForFunction(()=>window.asciiStudio.getState().assetName==='triangle.gltf');
 const stl='solid triangle\nfacet normal 0 0 1\nouter loop\nvertex -1 -1 0\nvertex 1 -1 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle';await page.locator('#file-input').setInputFiles({name:'triangle.stl',mimeType:'model/stl',buffer:Buffer.from(stl)});await page.waitForFunction(()=>window.asciiStudio.getState().assetName==='triangle.stl');pass('GLB, multi-file glTF with local companion resolution, and STL import');

 const fixturePage=await browser.newPage();
 const video=Buffer.from(await fixturePage.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=160;document.body.append(canvas);const ctx=canvas.getContext('2d'),stream=canvas.captureStream(30),track=stream.getVideoTracks()[0],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start(500);let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame%20<10?'#ee5544':'#4488ee';ctx.fillRect(0,0,160,160);ctx.fillStyle='#ffffff';ctx.fillRect(frame++%120,40,30,80);track.requestFrame();},50);await new Promise(resolve=>setTimeout(resolve,4000));clearInterval(timer);recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));}));
 await fixturePage.close();await page.bringToFront();
 assert(video.length>500,'The video fixture contains encoded frames');await writeFile('test-results/import-video.webm',video);
 await page.locator('#file-input').setInputFiles({name:'moving.webm',mimeType:'video/webm',buffer:video});await page.waitForFunction(()=>window.asciiStudio.getState().assetKind==='video');await seek(.1);await page.waitForTimeout(200);const videoFrame=await page.locator('#stage').screenshot();await seek(.7);await page.waitForTimeout(200);assert(!videoFrame.equals(await page.locator('#stage').screenshot()));
 await page.locator('#open-export').click();await page.locator('[data-format="video"]').click();await page.selectOption('#export-size','720');await page.selectOption('#export-duration','5');waiting=page.waitForEvent('download',{timeout:30000});await page.locator('#start-export').click();result=await waiting;await result.saveAs('test-results/studio-video.'+result.suggestedFilename().split('.').pop());const recorded=await readFile(await result.path());assert(recorded.length>2000);
 const decoded=await page.evaluate(async bytes=>{const video=document.createElement('video');video.muted=true;const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'video/webm'}));await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('The downloaded video cannot decode.'));video.src=url;});await video.play();await new Promise(resolve=>setTimeout(resolve,350));const result={width:video.videoWidth,height:video.videoHeight,playing:video.currentTime>0};video.pause();URL.revokeObjectURL(url);return result;},Array.from(recorded));assert.equal(decoded.width,720);assert.equal(decoded.height,720);assert(decoded.playing);
 pass('video import, frame seeking and a real five-second video download');

 await page.locator('[data-preset="stingray"]').click();assert.equal((await state()).settings.background,'ocean');await seek(0);const ray=await page.locator('#stage').screenshot();await seek(1.7);assert(!ray.equals(await page.locator('#stage').screenshot()));
 await page.locator('[data-preset="lilies"]').click();await seek(.45);const early=await page.evaluate(()=>window.artworkStudio.getState().visibleGlyphs);await seek(4.2);assert((await page.evaluate(()=>window.artworkStudio.getState().visibleGlyphs))>early);
 await page.locator('[data-preset="skull"]').click();await seek(20.25);await page.selectOption('#quick-quality','light');assert.equal((await state()).quality,'light');await page.selectOption('#quick-quality','fine');
 await page.selectOption('#canvas-aspect','free');await page.locator('#focus-view').click();assert.equal(await page.evaluate(()=>document.body.dataset.editor),'false');assert.equal((await state()).width,1440);await page.locator('#return-studio').click();
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>window.artworkStudio.getState().running),false);await page.emulateMedia({reducedMotion:'no-preference'});
 pass('existing skull, stingray and lily presets, both qualities, focus view and reduced-motion support');

 await page.setViewportSize({width:390,height:844});await seek(0);await page.screenshot({path:'test-results/studio-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert(await page.locator('#open-projects').isVisible());await page.locator('#open-projects').click();assert(await page.locator('#project-dialog-list .saved-project').count()>0);await page.locator('#projects-dialog .dialog-close button').click();
 assert.deepEqual(errors,[]);pass('phone layout without overflow, mobile project access and no browser errors');
 await writeFile('test-results/studio-report.json',JSON.stringify({result:'All studio checks passed',checks,errors},null,2));console.log(JSON.stringify({result:'All studio checks passed',checks,errors},null,2));
}finally{await browser.close();}
