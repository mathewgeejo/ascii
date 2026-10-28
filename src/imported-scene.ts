import { Mesh, MeshGeometry, Shader, GlProgram, Texture, type Application } from 'pixi.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import dracoWasm from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoWrapper from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import dracoJS from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?url';
import { ShaderScene } from './shader-scene';
import { backgroundFragment } from './background';
import type { Quality, Settings } from './config';

const vertex=`in vec2 aPosition; in vec2 aUV; out vec2 vUV;
void main(){vUV=aUV;gl_Position=vec4(aPosition,0.,1.);}`;
const fragment=`in vec2 vUV;out vec4 finalColor;uniform sampler2D uAsset;
void main(){finalColor=texture(uAsset,vUV);}`;

export class ImportedScene extends ShaderScene {
  files: File[] = [];
  name = '';
  kind: 'image'|'video'|'model' = 'image';
  private canvas=document.createElement('canvas');
  private ctx=this.canvas.getContext('2d')!;
  private image?: HTMLImageElement;
  private video?: HTMLVideoElement;
  private urls: string[]=[];
  private assetTexture: Texture;
  private assetShader:Shader;
  private renderer?: THREE.WebGLRenderer;
  private world=new THREE.Scene();
  private root=new THREE.Group();
  private camera=new THREE.PerspectiveCamera(35,1,.01,100);
  private key=new THREE.DirectionalLight(0xfff4e7,3);
  private mixer?: THREE.AnimationMixer;
  private lastWidth=1200;
  private lastHeight=1000;
  private generation=0;
  playing=false;
  pauseMedia(){this.playing=false;this.video?.pause();}
  dispose(){this.release();this.assetShader.resources.uAsset=Texture.WHITE.source;this.assetTexture.destroy(true);this.renderer?.dispose();this.renderer?.forceContextLoss();super.destroy();}

  constructor() {
    super(backgroundFragment,'imported-artwork');
    this.canvas.width=1200;this.canvas.height=1000;
    this.assetTexture=Texture.from(this.canvas);
    const geometry=new MeshGeometry({positions:new Float32Array([-1,1,1,1,-1,-1,1,-1]),uvs:new Float32Array([0,0,1,0,0,1,1,1]),indices:new Uint32Array([0,1,2,1,3,2])});
    geometry.batchMode='no-batch';
    const shader=new Shader({glProgram:GlProgram.from({vertex,fragment,name:'imported-media'}),resources:{uAsset:this.assetTexture.source}});
    this.assetShader=shader;
    const mesh=new Mesh({geometry,shader});mesh.eventMode='none';this.source.addChild(mesh);
    this.world.add(this.root,this.key,new THREE.HemisphereLight(0xdde9ff,0x3c354d,1.8));
    const fill=new THREE.DirectionalLight(0x829dd9,1.3);fill.position.set(-3,1,-2);this.world.add(fill);
    this.camera.position.z=5.4;
  }

  async load(files: File[]) {
    const primary=files.find(f=>/\.(glb|gltf|obj|stl)$/i.test(f.name))??files.find(f=>f.type.startsWith('image/')||f.type.startsWith('video/'));
    if(!primary)throw new Error('Choose a photo, video, GLB, glTF, OBJ or STL file.');
    if(files.reduce((sum,f)=>sum+f.size,0)>200*1024*1024)throw new Error('Choose files smaller than 200 MB in total.');
    const generation=++this.generation;
    this.release();
    this.files=files;this.name=primary.name;
    const objectURL=(file:File)=>{const url=URL.createObjectURL(file);this.urls.push(url);return url;};
    if(primary.type.startsWith('image/')) {
      this.kind='image';const image=new Image();image.src=objectURL(primary);await image.decode();
      if(generation===this.generation)this.image=image;
    } else if(primary.type.startsWith('video/')) {
      this.kind='video';const video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';
      this.video=video;
      await new Promise<void>((resolve,reject)=>{
        video.onloadeddata=()=>resolve();video.onerror=()=>reject(new Error('This video format cannot play in this browser. Try MP4 or WebM.'));
        video.src=objectURL(primary);video.load();
      });
      // Browser-recorded WebM files often omit their duration. Probe the end once
      // so timeline seeking and looping work for those local files as well.
      if(video.duration===Infinity){
        const seekTo=(value:number)=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('This video could not be indexed. Try an MP4 file.')),10000);video.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});video.currentTime=value;});
        await seekTo(1e10);await seekTo(0);
      }
      video.addEventListener('seeked',()=>window.dispatchEvent(new Event('mediaframe')));
    } else {
      this.kind='model';
      this.renderer??=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
      this.renderer.setClearColor(0x000000,0);this.renderer.setSize(this.lastWidth,this.lastHeight,false);
      const manager=new THREE.LoadingManager();
      const resources=new Map(files.map(f=>[f.name.toLowerCase(),objectURL(f)]));
      manager.setURLModifier(url=>{
        if(url.startsWith('data:')||url.startsWith('blob:'))return url;
        const base=decodeURIComponent(url.split('/').pop()!.split('?')[0]).toLowerCase();
        const decoder:Record<string,string>={'draco_decoder.wasm':dracoWasm,'draco_wasm_wrapper.js':dracoWrapper,'draco_decoder.js':dracoJS};
        if(url.includes('ascii-decoders/')&&decoder[base])return decoder[base];
        const match=resources.get(base);
        if(match)return match;
        throw new Error(`Include the companion file “${base}” with this model, or use a self-contained GLB.`);
      });
      let object: THREE.Object3D;
      const extension=primary.name.split('.').pop()!.toLowerCase();
      if(extension==='glb'||extension==='gltf') {
        const decoder=new DRACOLoader(manager).setDecoderPath('ascii-decoders/');
        const loader=new GLTFLoader(manager).setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder);
        const data=extension==='glb'?await primary.arrayBuffer():await primary.text();
        let gltf;try{gltf=await loader.parseAsync(data,'');}finally{decoder.dispose();}object=gltf.scene;
        if(gltf.animations.length){this.mixer=new THREE.AnimationMixer(object);this.mixer.clipAction(gltf.animations[0]).play();}
      } else if(extension==='obj') {
        const loader=new OBJLoader(manager),material=files.find(f=>/\.mtl$/i.test(f.name));
        if(material){const materials=new MTLLoader(manager).parse(await material.text(),'');materials.preload();loader.setMaterials(materials);}
        object=loader.parse(await primary.text());
      } else {
        const geometry=new STLLoader().parse(await primary.arrayBuffer());geometry.computeVertexNormals();
        object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xcac3af,roughness:.7}));
      }
      if(generation!==this.generation)return;
      object.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      if(!Number.isFinite(size.length())||size.length()===0)throw new Error('The model contains no visible geometry.');
      const wrapper=new THREE.Group();wrapper.add(object);object.position.sub(center);
      wrapper.scale.setScalar(2.7/Math.max(size.x,size.y,size.z));this.root.add(wrapper);
      this.root.traverse(child=>{if(child instanceof THREE.Mesh){if(!child.geometry.attributes.normal)child.geometry.computeVertexNormals();}});
    }
  }

  override resize(width:number,height:number,quality:Quality) {
    super.resize(width,height,quality);
    const resolution=quality==='fine'?.8:.55;
    this.lastWidth=Math.max(1,Math.round(width*resolution));this.lastHeight=Math.max(1,Math.round(height*resolution));
    this.canvas.width=this.lastWidth;this.canvas.height=this.lastHeight;
    this.assetTexture.source.resize(this.lastWidth,this.lastHeight);this.assetTexture.update();
    this.renderer?.setSize(this.lastWidth,this.lastHeight,false);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
  }

  override render(app:Application,time:number,settings:Settings) {
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,t=time*settings.swimSpeed;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
    const floating=settings.motion.includes('float'),spinning=settings.motion.includes('spin');
    const x=settings.positionX*w*.35+(floating?Math.sin(t*.55)*w*.012:0);
    const y=settings.positionY*h*.35+(floating?Math.sin(t*.73)*h*.018:0);
    if(this.kind==='model'&&this.renderer) {
      this.root.rotation.set(0,spinning?t*settings.rotation:0,floating?Math.sin(t*.4)*.025:0);
      this.root.position.set(x/w*3,-y/h*3,0);this.root.scale.setScalar(settings.scale);
      this.camera.position.z=Math.max(5.4,3.8/this.camera.aspect);
      const angle=settings.lightAngle*Math.PI/180;this.key.position.set(Math.sin(angle)*4,4,Math.cos(angle)*4);this.key.intensity=settings.lightIntensity*3;
      this.mixer?.setTime(t);this.renderer.render(this.world,this.camera);ctx.drawImage(this.renderer.domElement,0,0,w,h);
    } else {
      const media=this.video??this.image;
      if(media) {
        if(this.video) {
          const duration=this.video.duration;
          if(Number.isFinite(duration)&&duration>0) {
            const target=t%duration;
            if(!this.video.seeking&&Math.abs(this.video.currentTime-target)>.13)this.video.currentTime=target;
          }
          if(this.playing&&this.video.paused)void this.video.play().catch(()=>{});
          else if(!this.playing&&!this.video.paused)this.video.pause();
        }
        const mw=this.video?.videoWidth??this.image!.naturalWidth,mh=this.video?.videoHeight??this.image!.naturalHeight;
        if(mw&&mh) {
          const factor=(settings.fit==='cover'?Math.max(w/mw,h/mh):Math.min(w/mw,h/mh)*.9)*settings.scale;
          ctx.save();ctx.translate(w*.5+x,h*.5+y);if(spinning)ctx.rotate(t*settings.rotation);
          ctx.drawImage(media,-mw*factor/2,-mh*factor/2,mw*factor,mh*factor);ctx.restore();
        }
      }
    }
    this.assetTexture.source.update();super.render(app,time,settings);
  }

  private release() {
    this.video?.pause();if(this.video){this.video.removeAttribute('src');this.video.load();}
    this.image=undefined;this.video=undefined;this.mixer?.stopAllAction();this.mixer=undefined;
    this.root.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material]){for(const value of Object.values(material))if(value instanceof THREE.Texture)value.dispose();material.dispose();}}});
    this.root.clear();for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
  }
}
