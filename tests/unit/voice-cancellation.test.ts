import {describe,it,expect,vi} from 'vitest';
import {DEFAULT_SETTINGS} from '../../shared/contracts';
import type {CloudCapture} from '../../apps/desktop/electron/voice/cloud';
vi.mock('../../apps/desktop/electron/voice/models',()=>({modelsReady:async()=>true,verifyModels:async()=>true,installModels:vi.fn()}));
vi.mock('../../apps/desktop/electron/voice/client',()=>({SpeechWorker:class{call=async(method:string)=>method==='keyword'?true:undefined;stop=async()=>{};}}));
import {VoiceController} from '../../apps/desktop/electron/voice/controller';

describe('cloud speech cancellation',()=>{
  it('does not acknowledge a wake or restart playback after stopping during cloud setup',async()=>{
    let complete!:(capture:CloudCapture)=>void;
    let started!:()=>void;const pending=new Promise<void>(r=>{started=r;});
    const stop=vi.fn();const phases:string[]=[];const audio=vi.fn();
    const controller=new VoiceController({root:'fixture',workerPath:'fixture',settings:()=>({...DEFAULT_SETTINGS,cloudEnabled:true,aiMode:'hybrid',sttProvider:'gemini',cloudAudioConsent:true}),claim:()=>{},release:()=>{},changed:()=>{},phase:p=>phases.push(p),audio,openDashboard:()=>{},cloudCapture:async()=>{started();return await new Promise(r=>{complete=r;});}});
    await controller.initialize();await controller.start(1,'wake');
    const feed=controller.feed(1,new Float32Array(2048));await pending;
    controller.stop();complete({stop} as unknown as CloudCapture);await feed;
    expect(stop).toHaveBeenCalledOnce();expect(audio).not.toHaveBeenCalled();
    expect(controller.snapshot.phase).toBe('OFF');expect(phases.at(-1)).toBe('OFF');
  });
});
