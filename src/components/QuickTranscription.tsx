import { useEffect, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { Mic, Send, Pause, Play, Trash2, Copy, Loader2 } from "lucide-react";
import { clearDraft, saveDraftMeta, appendAudioChunk, recoverDraft, saveTranscript, recoverTranscript, adoptGuestDraft } from "../services/recordingDraft";
import { rememberPendingJob, recoverPendingJob, forgetPendingJob } from "../services/pendingJob";

const MAX_MS=180000;
const url=import.meta.env.VITE_SUPABASE_URL;
const anon=import.meta.env.VITE_SUPABASE_ANON_KEY;
const auth=url&&anon?createClient(url,anon):null;
const formats=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
type Phase="idle"|"recording"|"paused"|"ready"|"sending"|"processing"|"done";
type JobResponse={status?:string;jobId?:string;transcription?:string;error?:string;cached?:boolean};
const formatTime=(ms:number)=>{const s=Math.floor(Math.max(0,Math.min(MAX_MS,ms))/1000);return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
function asBase64(blob:Blob):Promise<string>{
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(Error("Falha ao ler áudio"));
    r.onload=()=>resolve(String(r.result).split(",")[1]||"");
    r.readAsDataURL(blob);
  });
}
export default function QuickTranscription(){
  const [phase,setPhase]=useState<Phase>("idle");
  const [elapsed,setElapsed]=useState(0);
  const [audio,setAudio]=useState<Blob|null>(null);
  const [playerSrc,setPlayerSrc]=useState("");
  const [mime,setMime]=useState("audio/webm");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [transcript,setTranscript]=useState("");
  const [cached,setCached]=useState(false);
  const [session,setSession]=useState<Session|null>(null);
  const [email,setEmail]=useState("");
  const [loginSent,setLoginSent]=useState(false);
  const media=useRef<MediaRecorder|null>(null);
  const tracks=useRef<MediaStream|null>(null);
  const timer=useRef<number|undefined>(undefined);
  const currentStart=useRef(0);
  const spent=useRef(0);
  const mimeRef=useRef("audio/webm");
  const recordScope=useRef("guest");
  const lastSavedAt=useRef(0);
  const writes=useRef<Promise<unknown>>(Promise.resolve());
  const blobUrl=useRef("");
  const mounted=useRef(true);
  const canceled=useRef(false);
  const polling=useRef<AbortController|null>(null);
  const pollSequence=useRef(0);
  const release=()=>{tracks.current?.getTracks().forEach(t=>t.stop());tracks.current=null};
  const stopClock=()=>{if(timer.current!==undefined)clearInterval(timer.current);timer.current=undefined};
  function setBlob(blob:Blob){
    if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);
    blobUrl.current=URL.createObjectURL(blob);setAudio(blob);setPlayerSrc(blobUrl.current);
  }
  useEffect(()=>{
    mounted.current=true;
    let subscription:{unsubscribe:()=>void}|undefined;
    if(auth){
      auth.auth.getSession().then(({data})=>{if(mounted.current)setSession(data.session);});
      subscription=auth.auth.onAuthStateChange((_evt,s)=>setSession(s)).data.subscription;
    }
    return ()=>{mounted.current=false;pollSequence.current++;subscription?.unsubscribe();stopClock();release();polling.current?.abort();if(blobUrl.current)URL.revokeObjectURL(blobUrl.current)};
  },[]);
  const ownerId=session?.user.id||"guest";
  useEffect(()=>{
    let active=true;
    const loggedIn=session?.user.id;
    const pending=loggedIn?recoverPendingJob(loggedIn):null;
    if(["recording","paused","sending"].includes(phase))return;
    if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);
    blobUrl.current="";setAudio(null);setPlayerSrc("");setTranscript("");
    setPhase(pending?"processing":"idle");setElapsed(0);
    // Recover the local recording before asking for another provider request.
    Promise.resolve(loggedIn?adoptGuestDraft(loggedIn):undefined).then(()=>recoverDraft(ownerId)).then(d=>{
      if(!mounted.current||!active||!d)return;
      setBlob(d.blob);setElapsed(d.durationMs);setMime(d.type);
      if(!pending)setPhase("ready");
      setNotice(d.partial?"Recuperamos a gravação interrompida. Ouça antes de enviar.":"Sua gravação ficou salva neste aparelho.");
    }).catch(()=>setNotice("A gravação local não pôde ser recuperada neste navegador."));
    recoverTranscript(ownerId).then(saved=>{
      if(!mounted.current||!active||!saved||pending)return;
      setCached(true);setTranscript(saved);
      setPhase(prev=>prev==="idle"?"done":prev);
    }).catch(()=>{});
    if(pending&&session&&loggedIn)void watchJob(pending,session.access_token,loggedIn);
    return ()=>{active=false;pollSequence.current++;polling.current?.abort();};
  },[ownerId]);
  function saveMeta(ms:number,status:"recording"|"stopped"){
    writes.current=writes.current.then(()=>saveDraftMeta(recordScope.current,{startedAt:Date.now()-ms,elapsedMs:ms,mimeType:mimeRef.current,status})).catch(()=>setNotice("O navegador não conseguiu salvar o rascunho."));
  }
  function finish(){
    const m=media.current;
    if(!m||m.state==="inactive")return;
    if(m.state==="recording")spent.current+=Date.now()-currentStart.current;
    m.stop();stopClock();release();
    const ms=Math.min(MAX_MS,spent.current);setElapsed(ms);
    saveMeta(ms,"stopped");setPhase("ready");
  }
  function tick(){
    stopClock();
    timer.current=window.setInterval(()=>{
      const ms=Math.min(MAX_MS,spent.current+Date.now()-currentStart.current);
      setElapsed(ms);
      if(ms-lastSavedAt.current>=5000){lastSavedAt.current=ms;saveMeta(ms,"recording");}
      if(ms>=MAX_MS)finish();
    },200);
  }
  async function begin(){
    if(phase==="recording"||phase==="paused")return;
    setError("");setNotice("");setTranscript("");setCached(false);
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
      setError("Microfone indisponível. Abra em HTTPS e atualize Safari ou Chrome.");return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      tracks.current=stream;
      recordScope.current=session?.user.id||"guest";
      await clearDraft(recordScope.current);
      if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);
      blobUrl.current="";setAudio(null);setPlayerSrc("");setElapsed(0);
      const preferred=formats.find(x=>MediaRecorder.isTypeSupported(x));
      const rec=preferred?new MediaRecorder(stream,{mimeType:preferred,audioBitsPerSecond:64000}):new MediaRecorder(stream,{audioBitsPerSecond:64000});
      mimeRef.current=rec.mimeType.split(";")[0]||"audio/webm";setMime(mimeRef.current);lastSavedAt.current=0;
      media.current=rec;spent.current=0;canceled.current=false;writes.current=Promise.resolve();
      const recordingOwner=recordScope.current;
      rec.ondataavailable=event=>{
        if(event.data.size===0)return;
        // Persistir as fatias diretamente no IndexedDB, sem manter uma cópia extra em RAM.
        writes.current=writes.current.then(()=>appendAudioChunk(recordingOwner,event.data))
          .catch(()=>setNotice("Não foi possível guardar o áudio. Evite fechar esta página."));
      };
      rec.onstop=()=>{
        stopClock();release();
        if(canceled.current)return;
        void (async()=>{
          try{
            await writes.current;
            const saved=await recoverDraft(recordingOwner);
            if(!mounted.current||canceled.current||media.current!==rec)return;
            if(!saved?.blob.size){setError("Não foi possível gravar áudio.");setPhase("idle");return;}
            setBlob(saved.blob);setPhase("ready");
            setNotice("Gravação pronta. Ouça e envie quando quiser.");
          }catch{
            if(mounted.current){setError("Erro ao recuperar o áudio gravado.");setPhase("idle");}
          }
        })();
      };
      rec.onerror=()=>setError("Erro do microfone. Tente gravar novamente.");
      rec.start(1000);currentStart.current=Date.now();setPhase("recording");saveMeta(0,"recording");tick();
    }catch{
      release();setError("Não consegui acessar o microfone. Verifique a permissão.");setPhase("idle");
    }
  }
  function togglePause(){
    const rec=media.current;if(!rec)return;
    if(rec.state==="recording"){
      spent.current+=Date.now()-currentStart.current;rec.pause();stopClock();
      setElapsed(spent.current);saveMeta(spent.current,"recording");setPhase("paused");
    }else if(rec.state==="paused"){
      rec.resume();currentStart.current=Date.now();setPhase("recording");tick();
    }
  }
  async function discard(){
    canceled.current=true;pollSequence.current++;polling.current?.abort();
    if(media.current&&media.current.state!=="inactive")media.current.stop();
    stopClock();release();await writes.current.catch(()=>{});await clearDraft(recordScope.current).catch(()=>{});
    if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);
    blobUrl.current="";setAudio(null);setPlayerSrc("");setElapsed(0);setTranscript("");setNotice("");setError("");setPhase("idle");spent.current=0;
  }
  async function login(){
    if(!auth||!email.includes("@")){setError("Digite um e-mail válido.");return;}
    const {error:err}=await auth.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});
    if(err)setError("Não foi possível enviar seu link de acesso.");else{setError("");setLoginSent(true);}
  }
  async function watchJob(jobId:string,accessToken:string,accountId:string){
    const seq=++pollSequence.current;
    let failures=0;
    const start=Date.now();
    setPhase("processing");
    setNotice("Sua mensagem foi recebida. Estamos preparando o texto, você não precisa reenviar.");
    while(mounted.current&&seq===pollSequence.current){
      // Poll the existing task only. The AI providers are never called by this GET.
      const elapsed=Date.now()-start;
      const delay=elapsed<20_000?1800:elapsed<60_000?3000:5000;
      await new Promise(resolve=>setTimeout(resolve,delay));
      if(!mounted.current||seq!==pollSequence.current)return;
      const controller=new AbortController();polling.current=controller;
      const deadline=setTimeout(()=>controller.abort(),12000);
      try{
        const res=await fetch("/api/transcription/jobs/"+encodeURIComponent(jobId),{
          headers:{Authorization:"Bearer "+accessToken},signal:controller.signal
        });
        if(res.status===401){
          setNotice("Sua sessão expirou. Entre novamente para consultar o resultado.");
          return;
        }
        if(res.status===404){
          forgetPendingJob(accountId);
          setPhase("ready");setNotice("Não encontramos o processamento anterior. Sua gravação está salva para tentar novamente.");
          return;
        }
        if(!res.ok)throw Error("Temporary connection issue");
        const result=await res.json() as JobResponse;
        failures=0;
        if(result.status==="ready"){
          const text=String(result.transcription||"").trim();
          if(!text)throw Error("No text");
          forgetPendingJob(accountId);
          setTranscript(text);setPhase("done");setNotice("");
          await saveTranscript(accountId,text).catch(()=>{});
          await clearDraft(accountId).catch(()=>{});
          return;
        }
        if(result.status==="failed"){
          forgetPendingJob(accountId);
          setPhase("ready");
          setNotice("Não conseguimos terminar desta vez. Sua gravação foi preservada. Você pode tentar novamente.");
          return;
        }
        if(elapsed>60_000)setNotice("Estamos levando um pouco mais de tempo. Pode voltar a esta página quando quiser.");
      }catch{
        if(controller.signal.aborted&&(!mounted.current||seq!==pollSequence.current))return;
        failures++;
        if(failures>2)setNotice("A conexão oscilou, mas sua gravação continua salva. Vamos consultar novamente.");
      }finally{clearTimeout(deadline);}
      // Keep the job ID for later visits and stop frequent polls after 5 minutes.
      if(Date.now()-start>300_000){
        setNotice("Ainda estamos processando. Você pode sair e voltar depois para consultar a mesma tarefa.");
        return;
      }
    }
  }
  async function send(){
    if(!auth||!session){setNotice("Entre na sua conta para transcrever.");return;}
    if(!audio||audio.size>15*1024*1024){setNotice("Não foi possível ler a gravação. Confira o áudio.");return;}
    if(elapsed>MAX_MS){setNotice("A gravação pode ter até três minutos.");return;}
    const accountId=session.user.id;
    if(recordScope.current==="guest")await adoptGuestDraft(accountId).catch(()=>{});
    recordScope.current=accountId;
    const alreadyPending=recoverPendingJob(accountId);
    if(alreadyPending){void watchJob(alreadyPending,session.access_token,accountId);return;}
    setError("");setNotice("");setPhase("sending");
    let payload:string;
    try {
      payload=JSON.stringify({audioBase64:await asBase64(audio),mimeType:mime});
    } catch {
      setPhase("ready");setNotice("Não foi possível preparar o áudio. Ele continua salvo para tentar novamente.");return;
    }
    for(let attempt=0;attempt<2;attempt++){
      const controller=new AbortController();
      const deadline=setTimeout(()=>controller.abort(),13000);
      try{
        const response=await fetch("/api/transcription/jobs",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
          body:payload,signal:controller.signal
        });
        const data=await response.json() as JobResponse;
        if(!response.ok){
          if(response.status===429){setNotice("Você já usou sua sessão gratuita. Sua gravação continua disponível.");setPhase("ready");return;}
          if(response.status===401){setNotice("Entre na sua conta novamente para continuar.");setPhase("ready");return;}
          if(response.status===400||response.status===413){setNotice("Não conseguimos processar essa gravação. Confira o áudio.");setPhase("ready");return;}
          throw Error("Unavailable");
        }
        if(data.status==="ready"&&data.transcription){
          setCached(Boolean(data.cached));setTranscript(data.transcription);setPhase("done");
          await saveTranscript(accountId,data.transcription).catch(()=>{});
          await clearDraft(accountId).catch(()=>{});
          return;
        }
        if(!data.jobId)throw Error("Job missing");
        rememberPendingJob(accountId,data.jobId);
        void watchJob(data.jobId,session.access_token,accountId);
        return;
      }catch{
        if(!mounted.current)return;
        setNotice("Estamos conectando sua gravação com segurança. Aguarde um instante.");
        if(attempt===0)await new Promise(resolve=>setTimeout(resolve,1200));
      }finally{clearTimeout(deadline);}
    }
    setPhase("ready");
    setNotice("Ainda não conseguimos enviar. Sua gravação ficou salva para você tentar novamente.");
  }
  return <div className="max-w-2xl mx-auto text-slate-50 space-y-5">
    <div className="text-center space-y-1"><h2 className="text-2xl sm:text-3xl font-bold">Fale. Nós transcrevemos.</h2><p className="text-sm text-slate-300">Uma mensagem de voz de até 3 minutos, como no WhatsApp.</p></div>
    <section className="bg-[#111e2b] border border-slate-700 rounded-3xl p-4 sm:p-6 space-y-4 shadow-xl max-w-full min-w-0">
      <div className="bg-[#202c33] rounded-2xl flex items-center gap-3 px-3 py-4">
        <button onClick={begin} type="button" disabled={["recording","paused","sending","processing"].includes(phase)} aria-label="Iniciar gravação" className={"rounded-full w-14 h-14 shrink-0 grid place-items-center text-white "+(phase==="recording"?"bg-red-600 animate-pulse":"bg-emerald-700")}><Mic size={27}/></button>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between gap-3 items-center"><strong className="tabular-nums font-mono text-xl">{formatTime(elapsed)}</strong><span className="text-xs text-slate-300">Limite 03:00</span></div>
          <div className="flex items-center gap-[3px] h-7 mt-1 overflow-hidden" aria-hidden="true">{Array.from({length:35},(_,i)=><span key={i} className="grow rounded-full bg-emerald-300" style={{height:String(18+i*29%79)+"%",opacity:phase==="idle"?0.3:0.9}} />)}</div>
        </div>
      </div>
      {["recording","paused"].includes(phase)&&<div className="flex gap-2">
        <button type="button" onClick={togglePause} className="flex-1 min-h-12 rounded-xl bg-slate-700 flex items-center justify-center gap-2">{phase==="recording"?<Pause size={19}/>:<Play size={19}/>} {phase==="recording"?"Pausar":"Continuar"}</button>
        <button type="button" onClick={finish} className="flex-1 min-h-12 rounded-xl bg-emerald-700 font-semibold">Concluir</button>
        <button type="button" aria-label="Excluir gravação" onClick={()=>void discard()} className="min-w-12 min-h-12 rounded-xl bg-rose-900 grid place-items-center"><Trash2 size={19}/></button>
      </div>}
      {playerSrc&&<div className="space-y-2">
        <audio controls preload="metadata" src={playerSrc} className="w-full" aria-label="Ouvir sua gravação"/>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={["sending","processing"].includes(phase)} onClick={()=>void discard()} className="min-h-11 rounded-xl bg-slate-700 px-4 flex items-center gap-2"><Trash2 size={16}/> Descartar</button>
          {phase==="ready"&&<button type="button" onClick={()=>void send()} disabled={!session} className="min-h-11 flex-1 bg-emerald-700 rounded-xl px-5 font-bold flex items-center justify-center gap-2"><Send size={18}/> Enviar áudio</button>}
        </div>
      </div>}
      {phase==="idle"&&<button type="button" onClick={begin} className="w-full min-h-12 bg-emerald-700 rounded-xl font-bold">Gravar áudio</button>}
      {["sending","processing"].includes(phase)&&<div role="status" aria-live="polite" className="rounded-2xl bg-slate-800/80 p-3 text-sm flex items-center gap-3"><Loader2 size={20} className="shrink-0 animate-spin text-emerald-300"/><span>{phase==="sending"?"Enviando sua mensagem com segurança...":"Estamos transformando sua mensagem em texto. Você não precisa fazer mais nada."}</span></div>}
      {phase==="processing"&&session&&<button type="button" onClick={()=>{const id=recoverPendingJob(session.user.id);if(id)void watchJob(id,session.access_token,session.user.id)}} className="w-full min-h-11 rounded-xl bg-slate-700 px-4 text-sm">Verificar resultado novamente</button>}
      {notice&&<p className="text-xs text-slate-300" role="status">{notice}</p>}
      {error&&<p className="text-sm text-red-300" role="alert">{error}</p>}
      <p className="text-xs text-slate-400">O rascunho fica neste dispositivo. Sem upload automático, mesmo se você fechar a aba.</p>
    </section>
    {phase==="done"&&<section className="bg-slate-900 border border-emerald-700 rounded-3xl p-5 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-bold text-lg">Sua transcrição</h3>{cached&&<span className="text-xs text-emerald-300">Recuperada do cache</span>}</div>
      <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p>
      <button type="button" onClick={()=>void navigator.clipboard.writeText(transcript)} className="min-h-11 rounded-xl bg-indigo-700 px-4 flex items-center gap-2"><Copy size={17}/> Copiar texto</button>
    </section>}
    {!session&&<section className="rounded-2xl p-4 border border-indigo-800 bg-slate-900 space-y-2">
      <h3 className="font-semibold">Entre na sua conta para enviar</h3>
      {!auth?<p className="text-sm text-amber-200">Autenticação ainda não configurada neste ambiente. A gravação local funciona, mas o envio está bloqueado para proteger sua cota e a chave da ElevenLabs.</p>:<>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Seu e-mail" aria-label="Seu e-mail" autoComplete="email" className="w-full rounded-xl min-h-12 bg-slate-800 px-3 border border-slate-600"/>
        <button type="button" onClick={()=>void login()} className="w-full min-h-11 rounded-xl bg-indigo-700">Receber link de acesso</button>
        {loginSent&&<p className="text-sm text-emerald-200">Confira seu e-mail para entrar.</p>}
      </>}
    </section>}
  </div>;
}
