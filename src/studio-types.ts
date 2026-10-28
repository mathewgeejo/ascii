import type { Quality, Scene, Settings } from './config';
export interface StudioState { scene:Scene;time:number;paused:boolean;quality:Quality;settings:Settings;aspect:string;assetName:string;assetKind:string;files:File[];width:number;height:number }
export interface StudioAPI {
  getState():StudioState;
  setSettings(patch:Partial<Settings>):void;
  setScene(scene:Scene,remember?:boolean):void;
  setQuality(quality:Quality):void;
  setAspect(aspect:string):void;
  importFiles(files:File[]):Promise<void>;
  seek(time:number):void;togglePause():void;replay():void;resize():void;
  getCanvas():HTMLCanvasElement;
  setOutputSize(size:{width:number;height:number}|null):void;
}
