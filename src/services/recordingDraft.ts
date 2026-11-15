/** Gravações ficam neste dispositivo, em IndexedDB, até envio, descarte ou limpeza do navegador.
 * O app NÃO faz upload automático e não salva tokens nem chaves de provedores aqui.
 */
const DB_NAME = "oraculo-recording-draft";
const STORE = "draft";
const CHUNKS = "chunks";
const RESULTS = "results";
const KEY = "current";
export type DraftMeta = { startedAt: number; elapsedMs: number; mimeType: string; status: "recording" | "stopped" };
export type RecoveredDraft = { blob: Blob; durationMs: number; type: string; partial: boolean };

const requestResult = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error("IndexedDB indisponível"));
});
async function openDb(ownerId:string): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis)) throw Error("IndexedDB unavailable");
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME+"-"+ownerId.replace(/[^a-zA-Z0-9_-]/g,""),2);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if(!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS,{autoIncrement:true});
      if(!db.objectStoreNames.contains(RESULTS)) db.createObjectStore(RESULTS);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Database unavailable"));
  });
}
async function withStore<T>(ownerId:string,storeName:string,mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb(ownerId);
  try {
    const trx=db.transaction(storeName,mode);
    const answer=await requestResult(fn(trx.objectStore(storeName)));
    await new Promise<void>((resolve,reject)=>{trx.oncomplete=()=>resolve();trx.onerror=()=>reject(trx.error);trx.onabort=()=>reject(trx.error)});
    return answer;
  }finally{db.close()}
}
export async function clearDraft(ownerId:string):Promise<void>{
  const db=await openDb(ownerId);
  try{
    const trx=db.transaction([STORE,CHUNKS],"readwrite");
    trx.objectStore(STORE).clear();
    trx.objectStore(CHUNKS).clear();
    await new Promise<void>((resolve,reject)=>{trx.oncomplete=()=>resolve();trx.onerror=()=>reject(trx.error)});
  }finally{db.close()}
}
export function saveDraftMeta(ownerId:string,meta:DraftMeta):Promise<IDBValidKey>{
  return withStore(ownerId,STORE,"readwrite",s=>s.put(meta,KEY));
}
export function appendAudioChunk(ownerId:string,chunk:Blob):Promise<IDBValidKey>{
  return withStore(ownerId,CHUNKS,"readwrite",s=>s.add(chunk));
}
export async function recoverDraft(ownerId:string):Promise<RecoveredDraft|null>{
  const db=await openDb(ownerId);
  try {
    const trx=db.transaction([STORE,CHUNKS],"readonly");
    const meta=await requestResult(trx.objectStore(STORE).get(KEY)) as DraftMeta|undefined;
    const chunks=await requestResult(trx.objectStore(CHUNKS).getAll()) as Blob[];
    if(!meta||chunks.length===0) return null;
    const blob=new Blob(chunks,{type:meta.mimeType});
    return blob.size ? {blob,durationMs:meta.elapsedMs,type:meta.mimeType,partial:meta.status==="recording"} : null;
  }finally{db.close()}
}

/** Somente a transcrição fica disponível no cache local (24h), sempre separada por conta. */
export async function saveTranscript(ownerId:string,text:string):Promise<void>{
  await withStore(ownerId,RESULTS,"readwrite",store=>
    store.put({text,expires:Date.now()+86400000},"latest"));
}
export async function recoverTranscript(ownerId:string):Promise<string|null>{
  const value=await withStore(ownerId,RESULTS,"readonly",store=>store.get("latest"));
  if(!value||typeof value.text!=="string"||value.expires<Date.now())return null;
  return value.text;
}

/** Após login, migra o rascunho anônimo deste dispositivo para a conta, caso não exista
 * outro rascunho. Sem upload e sem misturar duas contas autenticadas.
 */
export async function adoptGuestDraft(ownerId:string):Promise<void> {
  if(!ownerId||ownerId==="guest")return;
  if(await recoverDraft(ownerId))return;
  const guest=await recoverDraft("guest");
  if(!guest)return;
  const now=Date.now();
  await saveDraftMeta(ownerId,{
    startedAt:now-guest.durationMs,elapsedMs:guest.durationMs,mimeType:guest.type,status:"stopped"
  });
  await appendAudioChunk(ownerId,guest.blob);
  await clearDraft("guest");
}
