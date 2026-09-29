import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const label=process.argv[2] || 'candidate';
if(!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple profile label');
const output=`output/performance/${label}`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:process.env.PROFILE_HEADED!=='1'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
if(process.env.PROFILE_BASELINE){
  const ref=process.env.PROFILE_BASELINE;
  if(ref!=='407a0961ada8ced4b56d95c4c8d32f5b9191b4fb')throw new Error('Baseline must be the reviewed PR head');
  let source=execFileSync('git',['show',`${ref}:naval-art.js`],{encoding:'utf8'});
  const old=source.slice(source.indexOf('    function ocean('),source.indexOf('    function shorelineRadius('));
  const timed=`    function ocean(context,x,y,width,height,time=0){
    const p=window.RenderProfile;context.save();p?.begin('water.base');
    context.fillStyle='#123f4c';context.fillRect(x,y,width,height);p?.end('water.base');
    if(stats.ready){p?.begin('water.pattern');context.fillStyle=context.createPattern(waterTile,'repeat');context.fillRect(x,y,width,height);p?.end('water.pattern');
    p?.begin('water.animated');context.globalAlpha=.07;context.translate(Math.sin(time/7000)*12,Math.cos(time/9000)*12);context.fillRect(x-16,y-16,width+32,height+32);p?.end('water.animated');
    p?.begin('water.tint');context.globalAlpha=.2;context.fillStyle='#123b46';context.fillRect(x-16,y-16,width+32,height+32);p?.end('water.tint');}context.restore();}
`;
  source=source.replace(old,timed).replace('function hull(context, nation, length, width, color, trace) {',"function hull(context, nation, length, width, color, trace) { if(window.RenderProfile && !window.RenderProfile.enabled('hulls'))return;")
    .replace('context.drawImage(foam, x - size / 2, y - size / 2, size, size);','context.drawImage(foam, x - size / 2, y - size / 2, size, size); stats.wakeDraws=(stats.wakeDraws||0)+1;');
  await page.route('**/naval-art.js',route=>route.fulfill({contentType:'text/javascript',body:source}));
}
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const renderer = process.env.PROFILE_RENDERER || 'Canvas2D';
if (!['Canvas2D','PixiJS/WebGL'].includes(renderer)) throw new Error('PROFILE_RENDERER must be Canvas2D or PixiJS/WebGL');
await page.goto(`${process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4186'}/?profile-render&renderer-lab`);
await page.waitForFunction(()=>!!window.RenderProfile);
await page.getByRole('button',{name:'Click to Engage',exact:true}).click();
await page.getByRole('button',{name:'Skirmish',exact:true}).click();
await page.getByRole('button',{name:/US NAVY/}).click();
await page.evaluate(async renderer => {
  await window.RendererExperiment.ready;
  if (renderer !== 'Canvas2D') await window.RendererExperiment.switchTo(renderer);
}, renderer);
const scenarios=[];
for(const wave of [1,5])for(const zoom of [.45,.1])for(const moving of [false,true]){
  if(process.env.PROFILE_CASE && process.env.PROFILE_CASE!==`${wave},${zoom},${moving}`)continue;
  const fixture=await page.evaluate(([w,m,z])=>RenderProfile.fixture(w,m,z),[wave,moving,zoom]);
  const runs=[];
  for(const mode of (process.env.PROFILE_MODES?.split(',') || ['full','no-water','no-wakes','no-islands','no-hulls','no-tracers','no-water-wakes'])){
    const result=await page.evaluate(async mode=>{
      RenderProfile.mode(mode);
      const intervals=[];let last;
      // 30 warm-up + 180 measured frames; modes only suppress rendering.
      for(let i=0;i<210;i++){
        const now=await new Promise(requestAnimationFrame);
        if(i===29)RenderProfile.reset();
        if(i>=30)intervals.push(now-last);last=now;
      }
      const distribution=values=>{values.sort((a,b)=>a-b);return {median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],max:values.at(-1)};};
      const samples=RenderProfile.samples(),phases={};
      for(const name of Object.keys(samples[0]).filter(name=>name!=='wakeDrawCalls'))phases[name]=distribution(samples.map(s=>s[name]));
      return {mode,frames:intervals.length,frame:distribution(intervals),phases,wakeDrawCalls:distribution(samples.map(s=>s.wakeDrawCalls||0))};
    },mode);
    runs.push(result);
    if(mode==='full')await page.screenshot({path:`${output}/${renderer.replaceAll('/','-')}-wave${wave}-zoom${zoom}-${moving?'moving':'stationary'}.png`});
    console.log(JSON.stringify({renderer,wave,zoom,moving,mode,frame:result.frame,render:result.phases.total}));
  }
  scenarios.push({fixture,runs});
  await writeFile(`${output}/results.json`,JSON.stringify({label,renderer,viewport:[1440,900],scenarios,errors},null,2));
}
// Readback can force Canvas acceleration changes: perform it only AFTER all
// ordinary measurements, so it cannot contaminate later A/B frame samples.
const completion=renderer==='Canvas2D' ? await page.evaluate(()=>{
  RenderProfile.fixture(5,true,.45);RenderProfile.mode('full');
  const values=[];
  for(let i=0;i<12;i++){const t=performance.now();renderGameFrame(12345);ctx.getImageData(0,0,1,1);values.push(performance.now()-t);}
  values.sort((a,b)=>a-b);return {median:values[6],p95:values[11],note:'Render plus forced readback; not normal FPS or GPU stage timing'};
}) : { note: 'Skipped forced Canvas2D readback for WebGL; use ordinary frame distributions for comparison.' };
const diagnostics = await page.evaluate(() => window.RendererExperiment.diagnostics());
await writeFile(`${output}/results.json`,JSON.stringify({label,renderer,viewport:[1440,900],scenarios,completion,diagnostics,errors},null,2));
await browser.close();
if(errors.length)throw new Error(errors.join('; '));
