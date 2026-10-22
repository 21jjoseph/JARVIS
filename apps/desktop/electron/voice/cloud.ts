import { decodeWave } from './system-speech';

export class CloudCapture {
  private socket:WebSocket;
  private completed=false;
  private failure='';
  private readyResolve!:()=>void;
  private readyReject!:(error:Error)=>void;
  private finalResolve!:(text:string)=>void;
  private finalReject!:(error:Error)=>void;
  readonly ready:Promise<void>;
  private result:Promise<string>;
  constructor(url:string,token:string,config:Record<string,unknown>,partial:(text:string)=>void) {
    this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
    this.result=new Promise((resolve,reject)=>{this.finalResolve=resolve;this.finalReject=reject;});
    void this.result.catch(()=>{});
    this.socket=new WebSocket(url,['21-audio',token]);
    this.socket.addEventListener('open',()=>{this.socket.send(JSON.stringify(config));});
    this.socket.addEventListener('message',event=>{
      try {
        if(typeof event.data!=='string'||event.data.length>20_000)throw new Error('Invalid speech message.');
        const message=JSON.parse(event.data) as {kind:string;text?:unknown;message?:unknown};
        if(message.kind==='ready')this.readyResolve();
        else if(message.kind==='partial'&&typeof message.text==='string'&&message.text.length<=4000)partial(message.text);
        else if(message.kind==='final'&&typeof message.text==='string'&&message.text.length<=4000){this.completed=true;this.finalResolve(message.text);}
        else if(message.kind==='error')this.fail();
      }catch{this.fail();}
    });
    this.socket.addEventListener('error',()=>this.fail());
    this.socket.addEventListener('close',()=>{if(!this.completed)this.fail();});
  }
  get available(){return !this.failure&&!this.completed&&this.socket.readyState===WebSocket.OPEN;}
  private fail(){
    this.failure='Cloud speech is unavailable. Local transcription will be used.';
    this.readyReject(new Error(this.failure));this.finalReject(new Error(this.failure));
  }
  feed(samples:Float32Array){
    if(this.failure||this.completed)return;
    if(this.socket.readyState!==WebSocket.OPEN||this.socket.bufferedAmount>128_000){this.fail();this.stop();return;}
    const pcm=Buffer.alloc(samples.length*2);
    for(let i=0;i<samples.length;i++)pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]!))*32767),i*2);
    this.socket.send(pcm);
  }
  async finish(){
    if(this.failure)throw new Error(this.failure);
    this.socket.send(JSON.stringify({type:'finish'}));
    const abort=new AbortController();
    const timeout=new Promise<string>((_resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Cloud transcription timed out.')),18_000);abort.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});});
    try{return await Promise.race([this.result,timeout]);}
    finally{abort.abort();this.stop();}
  }
  stop(){this.socket.close();}
}

export function decodeCloudAudio(value:unknown):{samples:Float32Array;sampleRate:number} {
  const data=value as {audio?:unknown;mime?:unknown;sample_rate?:unknown};
  if(typeof data.audio!=='string'||!data.audio||data.audio.length>6_000_000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.audio)||typeof data.mime!=='string')throw new Error('Invalid cloud audio.');
  const bytes=Buffer.from(data.audio,'base64');
  if(data.mime.startsWith('audio/wav'))return decodeWave(bytes);
  if(!data.mime.startsWith('audio/L16')&&!data.mime.startsWith('audio/pcm'))throw new Error('Unsupported cloud audio.');
  const rate=data.sample_rate;
  if(typeof rate!=='number'||![16000,22050,24000,44100,48000].includes(rate)||bytes.length%2||bytes.length>rate*2*90)throw new Error('Cloud audio exceeded its bound.');
  const samples=new Float32Array(bytes.length/2);for(let i=0;i<samples.length;i++)samples[i]=bytes.readInt16LE(i*2)/32768;
  return {samples,sampleRate:rate};
}
