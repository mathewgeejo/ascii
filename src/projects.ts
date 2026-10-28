import { CONFIG, type Settings, type Scene, type Quality } from './config';

export interface Project { version:1;id:string;name:string;scene:Scene;settings:Settings;quality:Quality;aspect:string;time:number;files:File[];updated:number }
let connection:Promise<IDBDatabase>|undefined;
function database(){return connection??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('ascii-studio',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Browser storage is unavailable. You can still download your scene file.'));});}
async function transact<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode),request=work(tx.objectStore('projects'));let result:T;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('Unable to save the scene. Your browser storage may be full.'));tx.onabort=()=>reject(new Error('Scene storage was interrupted.'));});}
export const listProjects=()=>transact('readonly',store=>store.getAll()) as Promise<Project[]>;
export const saveProject=(project:Project)=>transact('readwrite',store=>store.put(project));
export const deleteProject=(id:string)=>transact('readwrite',store=>store.delete(id));
export function cleanSettings(input:unknown):Settings {
  const output={...CONFIG};if(!input||typeof input!=='object')return output;
  const source=input as Record<string,unknown>;
  for(const key of Object.keys(CONFIG) as (keyof Settings)[]){const value=source[key],expected=CONFIG[key];
    if(typeof expected==='number'&&typeof value==='number'&&Number.isFinite(value))(output as Record<string,unknown>)[key]=Math.max(-180,Math.min(180,value));
    else if(typeof expected==='boolean'&&typeof value==='boolean')(output as Record<string,unknown>)[key]=value;
    else if(typeof expected==='string'&&typeof value==='string'&&value.length<=80)(output as Record<string,unknown>)[key]=value;
  }
  for(const [key,min,max] of [['scale',.2,3],['glyphSize',.5,4],['spacing',.5,2],['density',.1,1],['contrast',.1,3],['gamma',.1,3],['swimSpeed',0,3],['water',0,2],['glow',0,2],['brightness',.1,3],['lightIntensity',0,3],['finAmplitude',0,2],['rotation',0,2],['tailAmplitude',0,2],['positionX',-1,1],['positionY',-1,1]] as const)output[key]=Math.max(min,Math.min(max,output[key]));
  const choices:Record<string,string[]>={background:['space','ocean','black','gradient'],motion:['float-spin','float','spin','still'],charset:['classic','dots','blocks','binary','custom'],palette:['original','mono','duotone'],fit:['contain','cover']};
  for(const [key,options]of Object.entries(choices))if(!options.includes(String(output[key as keyof Settings])))(output as Record<string,unknown>)[key]=CONFIG[key as keyof Settings];
  for(const key of ['inkColor','shadowColor']as const)if(!/^#[\da-f]{6}$/i.test(output[key]))output[key]=CONFIG[key];return output;
}
export async function projectFile(project:Project){const files=await Promise.all(project.files.map(async file=>({name:file.name,type:file.type,data:await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);})})));return new Blob([JSON.stringify({...project,files})],{type:'application/json'});}
export async function readProject(file:File):Promise<Project>{const raw=JSON.parse(await file.text());if(raw.version!==1||!['skull','stingray','lilies','custom'].includes(raw.scene)||!Array.isArray(raw.files))throw new Error('This is not a valid ASCII Studio scene file.');const files:File[]=[];for(const item of raw.files){if(typeof item.data!=='string'||!item.data.startsWith('data:')||typeof item.name!=='string')throw new Error('A scene asset is missing.');const blob=await(await fetch(item.data)).blob();files.push(new File([blob],item.name,{type:typeof item.type==='string'?item.type:''}));}if(raw.scene==='custom'&&!files.length)throw new Error('This scene is missing its imported artwork.');return{version:1,id:crypto.randomUUID(),name:String(raw.name||'Imported scene').slice(0,80),scene:raw.scene,settings:cleanSettings(raw.settings),quality:raw.quality==='light'?'light':'fine',aspect:['free','square','portrait','landscape'].includes(raw.aspect)?raw.aspect:'free',time:Number.isFinite(raw.time)?Math.max(0,raw.time):0,files,updated:Date.now()};}
