"""Opt-in, real Gemma E2B/E4B measurements. Never fetches model files."""
import argparse
import asyncio
import json
from pathlib import Path
import platform
import sys
import time
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'services/backend'))
import httpx
from jarvis_backend.local_engine import LocalEngine
from jarvis_backend.model_setup import inspect_gguf
from jarvis_backend.intelligence import ChatProvider
from jarvis_backend.identity import instruction

PROMPTS=[
 ('romanian-greeting','Salut Twenty One! Cum mă poți ajuta astăzi?'),
 ('mixed-language','Twenty One, explică pe scurt cum a stepper motor works.'),
 ('robotics','Compară avantajele și dezavantajele unui reductor cicloidal pentru un braț robotic.'),
 ('structured-intent','Return only JSON with intent and app: Twenty One, deschide CoppeliaSim.'),
 ('summarization','Rezumă: Un motor pas cu pas transformă impulsurile electrice în poziții unghiulare discrete. Controlerul reglează curentul și viteza. Sarcina mecanică poate provoca pierderea pașilor.'),
]


async def benchmark(args):
    engine=LocalEngine(args.binary)
    results=[]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180,connect=5),trust_env=False) as client:
            for model in args.model:
                metadata=inspect_gguf(Path(model))
                load=await engine.start(model,args.endpoint,args.threads,3600)
                provider=ChatProvider('llama',client,'gemma-4-local',args.endpoint,headers=engine.headers(args.endpoint))
                rows=[]
                for name,prompt in PROMPTS:
                    started=time.perf_counter();first=None;reply='';usage={};samples=[]
                    async def sample():
                        while True:
                            samples.append(await engine.status());await asyncio.sleep(0.5)
                    task=asyncio.create_task(sample());engine.active_requests+=1
                    try:
                        async for event in provider.stream([{'role':'system','content':instruction('ro','professional')},{'role':'user','content':prompt}],tools=False):
                            if event['kind']=='token':
                                if first is None:first=time.perf_counter()-started
                                reply+=event['text']
                            if event['kind']=='final':usage=event['usage']
                    finally:
                        engine.active_requests-=1;task.cancel()
                        try:await task
                        except asyncio.CancelledError:pass
                    duration=time.perf_counter()-started
                    tokens=usage.get('output_tokens',0)
                    rows.append({'case':name,'prompt':prompt,'response':reply,'first_token_ms':first*1000 if first is not None else None,
                        'total_ms':duration*1000,'output_tokens':tokens,
                        'tokens_per_second_after_first':tokens/(duration-first) if tokens and first is not None and duration>first else None,
                        'peak_rss_bytes':max((s['rss_bytes'] or 0 for s in samples),default=0) or None,
                        'peak_cpu_percent':max((s['cpu_percent'] or 0 for s in samples),default=0) or None,
                        'quality_review':None,'romanian_quality_review':None,'temperature_celsius':None})
                    print(name,'total_ms',round(duration*1000),'ttft_ms',round(first*1000) if first else None,flush=True)
                results.append({'model_path':str(Path(model).resolve()),'metadata':metadata,'load_ms':load['load_ms'],
                    'threads':args.threads,'context':4096,'parallel':1,'gpu_layers':0,'cases':rows})
                await engine.stop()
    finally:await engine.stop()
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps({'platform':platform.platform(),'processor':platform.processor(),
        'thermal_measurement':'Not collected; no temperature is inferred','models':results,
        'recommendation':'Review the recorded throughput, memory and language quality before recommending E4B.'},ensure_ascii=False,indent=2)+'\n')
    print('Measured results:',out)


parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model',action='append',required=True,help='Existing Gemma 4 GGUF; repeat to compare E2B and E4B')
parser.add_argument('--binary',default=str(ROOT/'.cache/local-engine/build/bin/llama-server'))
parser.add_argument('--endpoint',default='http://127.0.0.1:8080')
parser.add_argument('--threads',type=int,default=2)
parser.add_argument('--output',default=str(ROOT/'.cache/benchmarks/gemma4.json'))
if __name__=='__main__':asyncio.run(benchmark(parser.parse_args()))
