import { _electron as electron,test,expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('21: llama SSE reaches UI, private mode stays local, settings persist and keys stay outside renderer',async()=>{
  const prompts:Array<{messages:Array<{role:string;content:string}>;model:string}>=[];
  const server=createServer(async(req,res)=>{
    if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'gemma-4-local'}]}));return;}
    let body='';for await(const chunk of req)body+=String(chunk);
    prompts.push(JSON.parse(body));res.setHeader('Content-Type','text/event-stream');
    res.write('data: '+JSON.stringify({choices:[{delta:{content:'Salut, sunt '}}]})+'\n\n');
    setTimeout(()=>res.end('data: '+JSON.stringify({choices:[{delta:{content:'Twenty One.'}}]})+'\n\ndata: [DONE]\n\n'),700);
  });
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const port=(server.address() as {port:number}).port;
  const data=await mkdtemp(resolve('.cache/intelligence-e2e-'));
  const app=await electron.launch({executablePath:process.env.JARVIS_TEST_EXECUTABLE,args:[...(process.env.JARVIS_TEST_EXECUTABLE?[]:['.']),...(process.env.JARVIS_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[]),'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,JARVIS_USER_DATA_DIR:data}});
  try{
    const overlay=await app.firstWindow();await overlay.evaluate(()=>window.jarvis!.openDashboard());
    await expect.poll(()=>app.windows().length).toBe(2);
    const page=app.windows().find(w=>w!==overlay)!;
    expect(await app.evaluate(()=>typeof WebSocket)).toBe('function');
    await page.evaluate((port)=>window.jarvis!.updateSettings({locale:'en',voiceLanguage:'ro',personality:'professional',localEndpoint:`http://127.0.0.1:${port}`,quality:'low'}),port);
    await page.getByRole('button',{name:/AI conversation/}).click();
    const panel=page.getByTestId('conversation-panel');
    await expect.poll(()=>page.evaluate(async()=>(await window.jarvis!.ai.status()).ready)).toBe(true);
    await expect(panel.getByLabel('AI mode')).toHaveValue('local');
    await expect(panel.getByLabel('Personality')).toHaveValue('professional');
    await expect(page.evaluate(()=>window.jarvis!.ai.setKey('never-in-renderer','gemini'))).rejects.toThrow('native secure');
    await expect(page.evaluate(()=>window.jarvis!.updateSettings({modelPath:'/tmp/injected.gguf'}))).rejects.toThrow('managed');
    await panel.getByLabel('Private request — local only').check();
    await panel.getByLabel('Message Twenty One').fill('An engineering question in Romanian');
    await panel.getByRole('button',{name:'Send',exact:true}).click();
    await expect(panel.getByTestId('streaming-reply')).toContainText('Salut, sunt');
    await expect(panel).toContainText('Twenty One.');
    await expect(panel).toContainText('llama');
    expect(prompts[0]!.model).toBe('gemma-4-local');
    expect(prompts[0]!.messages[0]!.content).toContain('professional');
    await panel.getByLabel('Message Twenty One').fill('Follow up about the same task');
    await panel.getByRole('button',{name:'Send',exact:true}).click();
    await expect.poll(()=>prompts.length).toBe(2);expect(prompts[1]!.messages).toHaveLength(4);
    await expect(panel.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
    const stored=JSON.parse(await readFile(resolve(data,'settings.json'),'utf8'));
    expect(stored.personality).toBe('professional');expect(stored.cloudEnabled).toBe(false);expect(stored.wakeWord).toBe('Twenty One');
    expect(JSON.stringify(stored)).not.toContain('never-in-renderer');
    await expect(overlay.getByTestId('ferrofluid')).toHaveAttribute('data-rendered','true');
    await page.screenshot({path:'test-results/intelligence-panel.png',fullPage:true});
  }finally{await app.close();await new Promise<void>(done=>server.close(()=>done()));}
});
