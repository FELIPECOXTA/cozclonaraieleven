import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base=process.env.PREVIEW_URL||"http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true,args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
const viewports=[
  {name:"android-360",width:360,height:800,isMobile:true,hasTouch:true},
  {name:"android-412",width:412,height:915,isMobile:true,hasTouch:true},
  {name:"iphone-390",width:390,height:844,isMobile:true,hasTouch:true},
  {name:"web-1280",width:1280,height:800,isMobile:false,hasTouch:false}
];
await mkdir("artifacts",{recursive:true});
const errors=[];
try{
  for(const viewport of viewports){
    const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch});
    page.on("pageerror",e=>errors.push(viewport.name+": "+e.message));
    await page.goto(base,{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Fale. Nós transcrevemos."}).waitFor({timeout:15000});
    const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.ok(overflow.scroll<=overflow.viewport+1,viewport.name+" scroll "+JSON.stringify(overflow));
    const btn=page.getByRole("button",{name:"Gravar áudio"});
    const rect=await btn.boundingBox();
    assert.ok(rect&&rect.height>=44,viewport.name+" microfone deve ser tocável");
    const upload=await page.getByRole("button",{name:"Iniciar gravação"}).count();
    assert.equal(upload,1,viewport.name+" tem botão de microfone visível");
    await page.screenshot({path:"artifacts/transcription-"+viewport.name+".png",fullPage:true});
    await page.close();
  }
  assert.deepEqual(errors,[],"sem erros JS em Android/iPhone simulado e desktop");
  console.log("Interface mobile e desktop: largura, controle de voz e ausência de erro JS OK");
}finally{await browser.close()}
