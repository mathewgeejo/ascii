import { CONFIG, type Settings, type Scene } from './config';
import type { StudioAPI } from './studio-types';
import { deleteProject, listProjects, projectFile, readProject, saveProject, type Project } from './projects';
import { download, exportPNG, exportVideo, safeName, videoType } from './export';

const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const presetNames:Record<Scene,string>={skull:'Space skull',stingray:'Stingray',lilies:'Lilies',custom:'Imported artwork'};
const presetSettings=(scene:Scene):Settings=>({...CONFIG,background:scene==='skull'?'space':scene==='stingray'?'ocean':'black',motion:scene==='lilies'?'still':scene==='stingray'?'float':'float-spin'});

export async function mountStudio(api:StudioAPI) {
  let projectId:string|undefined,dirty=true,busy=false,toastTimer=0,importing=false,touched=false;
  let format='png',abort:AbortController|undefined;
  const name=$<HTMLInputElement>('#project-name'),dialog=$<HTMLDialogElement>('#export-dialog');
  const toast=(message:string,error=false)=>{clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').dataset.error=String(error);$('#toast').hidden=false;toastTimer=window.setTimeout(()=>$('#toast').hidden=true,error?8500:4200);};
  const markDirty=()=>{dirty=true;touched=true;$('#save-state').textContent='Unsaved changes';};
  const snapshot=():Project=>{const state=api.getState();return{version:1,id:projectId??crypto.randomUUID(),name:name.value.trim()||'Untitled scene',scene:state.scene,settings:state.settings,quality:state.quality,aspect:state.aspect,time:state.time,files:state.files,updated:Date.now()};};
  const lock=(value:boolean)=>{busy=value;$('#library').inert=value;$('#dev').inert=value;$('.app-header').inert=value;$('#transport').inert=value;};

  function sync() {
    const state=api.getState(),settings=state.settings;
    for(const input of document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setting]')){
      const key=input.dataset.setting as keyof Settings;if(document.activeElement===input)continue;
      if(input instanceof HTMLInputElement&&input.type==='checkbox')input.checked=Boolean(settings[key]);else input.value=String(settings[key]);
    }
    for(const output of document.querySelectorAll<HTMLOutputElement>('[data-value]')){const key=output.dataset.value as keyof Settings,value=Number(settings[key]);output.value=['density','positionX','positionY'].includes(key)?`${Math.round(value*100)}%`:key==='lightAngle'?`${Math.round(value)}°`:value.toFixed(key==='rotation'?2:1)+'×';}
    document.querySelectorAll<HTMLElement>('[data-preset]').forEach(button=>button.classList.toggle('active',button.dataset.preset===state.scene));
    $('#custom-characters').hidden=settings.charset!=='custom';$('#colour-controls').hidden=settings.palette==='original';$('#shadow-colour').hidden=settings.palette!=='duotone';
    $('#effect-control').hidden=state.scene==='custom'||state.scene==='lilies';$('#detail-control').hidden=state.scene==='custom'||state.scene==='lilies';
    for(const id of ['motion','rotation','fin-amplitude'])$('#'+id).parentElement!.hidden=state.scene==='lilies';
    $('#lighting-controls').hidden=!(state.scene==='skull'||state.scene==='custom'&&state.assetKind==='model');
    $('#fit-control').hidden=state.scene!=='custom'||state.assetKind==='model';
    $('#effect-label').textContent=state.scene==='skull'?'Red laser intensity':'Bioluminescence';
    $('#motion-hint').textContent=state.scene==='skull'?'True 3D rotation. Red lasers fire briefly, once per turn.':state.scene==='stingray'?'A living ray, with independently moving fins and tail.':state.scene==='lilies'?'The bouquet blooms once. Restart to watch it grow.':state.assetKind==='model'?'True 3D rotation. Included model animation plays automatically.':state.assetKind==='video'?'Your video loops inside the ASCII scene.':'Photos float and rotate in the canvas plane.';
    $('#imported-card').hidden=!state.assetName;$('#imported-name').textContent=state.assetName;$('#imported-kind').textContent=state.assetKind.toUpperCase();
    $('#scene-caption').textContent=state.scene==='custom'?state.assetName.toUpperCase():presetNames[state.scene].toUpperCase();
    $('#duration-label').textContent=state.scene==='lilies'?'4.2 s':'24 s';
    $<HTMLSelectElement>('#canvas-aspect').value=state.aspect;
    const viewer=$<HTMLSelectElement>('#viewer-scene');
    if(state.assetName&&!viewer.querySelector('option[value="custom"]')){const option=document.createElement('option');option.value='custom';option.textContent='Imported artwork';viewer.append(option);}
    viewer.value=state.scene;$<HTMLSelectElement>('#viewer-quality').value=state.quality;
  }

  async function refreshProjects() {
    try {
      const projects=(await listProjects()).sort((a,b)=>b.updated-a.updated);$('#project-count').textContent=String(projects.length).padStart(2,'0');
      for(const container of [$('#project-list'),$('#project-dialog-list')]){container.replaceChildren();
      if(!projects.length){const empty=document.createElement('p');empty.className='empty-projects';empty.textContent='Your next favourite starts here. Save a scene to keep it.';container.append(empty);}
      for(const project of projects){const row=document.createElement('div');row.className='saved-project';const button=document.createElement('button');button.textContent=project.name;const small=document.createElement('small');small.textContent=`${presetNames[project.scene]} · ${new Date(project.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;button.append(small);button.addEventListener('click',()=>void openProject(project));
        const remove=document.createElement('button');remove.className='delete-project';remove.textContent='×';remove.setAttribute('aria-label',`Delete ${project.name}`);remove.addEventListener('click',async()=>{await deleteProject(project.id);if(projectId===project.id){projectId=undefined;localStorage.removeItem('ascii-last-project');markDirty();}await refreshProjects();toast('Saved scene deleted.');});row.append(button,remove);container.append(row);}}
    }catch(error){toast(error instanceof Error?error.message:'Saved scenes are unavailable.',true);}
  }

  async function openProject(project:Project,fromImport=false) {
    if(busy||importing&&!fromImport)return;lock(true);
    try{if(project.scene==='custom')await api.importFiles(project.files);else api.setScene(project.scene);api.setSettings(project.settings);api.setQuality(project.quality);api.setAspect(project.aspect);api.seek(project.time);name.value=project.name;
      if(fromImport){projectId=undefined;markDirty();localStorage.removeItem('ascii-last-project');}
      else{projectId=project.id;dirty=false;$('#save-state').textContent='Saved on this device';localStorage.setItem('ascii-last-project',project.id);}
      sync();$<HTMLDialogElement>('#projects-dialog').close();toast(`Opened “${project.name}”.`);}
    catch(error){toast(error instanceof Error?error.message:'Could not open that scene.',true);}finally{lock(false);}
  }

  async function importFiles(files:File[]) {
    if(!files.length||busy||importing)return;importing=true;$('#import-trigger').setAttribute('disabled','');toast('Opening your artwork…');
    try{const project=files.find(file=>file.name.endsWith('.ascii.json'));if(project){await openProject(await readProject(project),true);return;}
      lock(true);await api.importFiles(files);projectId=undefined;name.value=api.getState().assetName.replace(/\.[^.]+$/,'').slice(0,80);markDirty();sync();toast(`Ready. Your ${api.getState().assetKind} is now ASCII.`);
    }catch(error){toast(error instanceof Error?error.message:'Could not open those files.',true);}finally{importing=false;lock(false);$('#import-trigger').removeAttribute('disabled');api.resize();}
  }

  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-preset]'))button.addEventListener('click',()=>{
    const scene=button.dataset.preset as Scene;api.setSettings(presetSettings(scene));api.setScene(scene);api.replay();projectId=undefined;name.value=presetNames[scene];markDirty();localStorage.removeItem('ascii-last-project');sync();
  });
  for(const input of document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setting]'))input.addEventListener('input',()=>{
    const key=input.dataset.setting as keyof Settings;
    const value=input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:typeof CONFIG[key]==='number'?Number(input.value):input.value;
    api.setSettings({[key]:value});markDirty();document.querySelectorAll('[data-style]').forEach(button=>button.classList.remove('selected'));sync();
  });
  const styles:Record<string,Partial<Settings>>={original:{charset:'classic',palette:'original',brightness:1,contrast:1.12,gamma:.86,glyphSize:1,density:1,spacing:1},terminal:{charset:'binary',palette:'mono',inkColor:'#a5e9b2',brightness:1.2,contrast:1.2,glyphSize:1.2},paper:{charset:'classic',palette:'mono',inkColor:'#f1e4c8',brightness:1.15,contrast:1.18,glyphSize:1},neon:{charset:'classic',palette:'duotone',inkColor:'#ecbcff',shadowColor:'#315d9b',brightness:1.3,contrast:1.35,glyphSize:1.05}};
  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(button=>button.addEventListener('click',()=>{api.setSettings(styles[button.dataset.style!]);document.querySelectorAll('[data-style]').forEach(b=>b.classList.toggle('selected',b===button));markDirty();sync();}));
  $('#reset-look').addEventListener('click',()=>{api.setSettings(presetSettings(api.getState().scene));sync();markDirty();toast('Adjustments reset.');});
  $('#canvas-aspect').addEventListener('change',event=>{api.setAspect((event.target as HTMLSelectElement).value);markDirty();});
  name.addEventListener('input',markDirty);
  for(const tab of ['look','motion'])$('#'+tab+'-tab').addEventListener('click',()=>{for(const item of ['look','motion']){$('#'+item+'-tab').setAttribute('aria-selected',String(item===tab));$('#'+item+'-panel').hidden=item!==tab;}});
  for(const tab of ['look','motion'])$('#'+tab+'-tab').addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=$<HTMLButtonElement>('#'+(tab==='look'?'motion':'look')+'-tab');next.click();next.focus();}});
  window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&!dialog.open){event.preventDefault();$('#save-project').click();}});
  for(const id of ['quality','quick-quality'])$('#'+id).addEventListener('change',markDirty);
  const focus=()=>{const open=document.body.dataset.editor==='false';document.body.dataset.editor=open?'true':'false';const url=new URL(location.href);if(open){url.searchParams.set('studio','1');url.searchParams.delete('view');}else{url.searchParams.delete('studio');url.searchParams.delete('debug');}history.replaceState(null,'',url);api.resize();sync();};
  $('#focus-view').addEventListener('click',focus);$('#return-studio').addEventListener('click',focus);
  $('#viewer-scene').addEventListener('change',event=>{const selected=(event.target as HTMLSelectElement).value as Scene;if(selected==='custom')api.setScene(selected);else $<HTMLButtonElement>(`[data-preset="${selected}"]`).click();sync();});
  $('#viewer-quality').addEventListener('change',event=>{api.setQuality((event.target as HTMLSelectElement).value==='light'?'light':'fine');markDirty();sync();});
  $('#open-projects').addEventListener('click',()=>{$<HTMLDialogElement>('#projects-dialog').showModal();});
  $('#import-trigger').addEventListener('click',()=>$<HTMLInputElement>('#file-input').click());
  $('#file-input').addEventListener('change',event=>{const input=event.target as HTMLInputElement;void importFiles(Array.from(input.files??[]));input.value='';});
  $('#imported-card').addEventListener('click',()=>{api.setScene('custom');sync();markDirty();});
  let dragDepth=0;
  document.addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;$('#drop-overlay').hidden=false;}});
  document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('#drop-overlay').hidden=true;}});
  document.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('#drop-overlay').hidden=true;if(event.dataTransfer?.files.length)void importFiles(Array.from(event.dataTransfer.files));});
  $('#save-project').addEventListener('click',async()=>{if(busy)return;const button=$<HTMLButtonElement>('#save-project');button.disabled=true;try{const project=snapshot();await saveProject(project);projectId=project.id;dirty=false;name.value=project.name;$('#save-state').textContent='Saved on this device';localStorage.setItem('ascii-last-project',project.id);await refreshProjects();toast('Scene saved, including your imported files.');}catch(error){toast(error instanceof Error?error.message:'Could not save the scene.',true);}finally{button.disabled=false;}});

  function syncExport(){document.querySelectorAll<HTMLElement>('[data-format]').forEach(button=>button.classList.toggle('selected',button.dataset.format===format));$('#export-options').hidden=format==='project';$('#video-duration-control').hidden=format!=='video';$('#start-export').textContent=format==='png'?'Download PNG ↗':format==='project'?'Download scene ↗':'Record & download ↗';$('#export-note').textContent=format==='png'?'A clean PNG of the current frame, without the editor.':format==='project'?'An editable .ascii.json file with settings and imported artwork.':`A ${videoType().includes('mp4')?'MP4':'WebM'} video, recorded in real time. Keep this tab open until it finishes.`;}
  $('#open-export').addEventListener('click',()=>{syncExport();dialog.showModal();});
  document.querySelectorAll<HTMLElement>('[data-format]').forEach(button=>button.addEventListener('click',()=>{format=button.dataset.format!;syncExport();}));
  const cancel=()=>{if(busy)abort?.abort();else dialog.close();};$('#cancel-export').addEventListener('click',cancel);dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();abort?.abort();}});
  dialog.addEventListener('close',()=>{if(busy)abort?.abort();});
  $('#start-export').addEventListener('click',async()=>{
    if(busy)return;lock(true);const button=$<HTMLButtonElement>('#start-export');button.disabled=true;dialog.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(b=>b.disabled=true);abort=new AbortController();const filename=safeName(name.value);
    try{if(format==='png')download(await exportPNG(api,Number($<HTMLSelectElement>('#export-size').value)),filename+'.png');
      else if(format==='project')download(await projectFile(snapshot()),filename+'.ascii.json');
      else{$('#export-progress').hidden=false;const result=await exportVideo(api,Number($<HTMLSelectElement>('#export-size').value),Number($<HTMLSelectElement>('#export-duration').value),abort.signal,percent=>{$<HTMLProgressElement>('#export-progress progress').value=percent;$('#export-progress-text').textContent=`Recording your scene… ${Math.floor(percent)}%`;});download(result.blob,filename+'.'+result.extension);}
      toast('Your artwork is ready. Download started.');dialog.close();
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError')toast('Video export cancelled.');else toast(error instanceof Error?error.message:'Export failed.',true);}
    finally{lock(false);button.disabled=false;dialog.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(b=>b.disabled=false);$('#export-progress').hidden=true;abort=undefined;}
  });
  window.addEventListener('studiochange',sync);
  if(api.getState().scene==='stingray')api.setSettings({background:'ocean',motion:'float'});else if(api.getState().scene==='lilies')api.setSettings({background:'black',motion:'still'});
  Object.assign(window,{asciiStudio:{getState:api.getState,importFiles,save:()=>$('#save-project').click(),getProjects:listProjects}});
  sync();await refreshProjects();
  try{const last=localStorage.getItem('ascii-last-project'),params=new URLSearchParams(location.search);if(!touched&&last&&(!params.has('scene')||params.get('scene')==='custom')&&!params.has('t')){const project=(await listProjects()).find(item=>item.id===last);if(project)await openProject(project);}}catch{/* Local storage may be unavailable. */}
}
