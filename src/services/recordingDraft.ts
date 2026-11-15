/** Gravações ficam neste dispositivo, em IndexedDB, até envio, descarte ou limpeza do navegador.
 * O app NÃO faz upload automático e não salva tokens nem chaves de provedores aqui.
 */
const DB_NAME = "oraculo-recording-draft";
const STORE = "draft";
const CHUNKS = "chunks";
const KEY = "current";
export type DraftMeta = { startedAt: number; elapsedMs: number; mimeType: string; status: "recording" | "stopped" };
export type RecoveredDraft = { blob: Blob; durationMs: number; type: string; partial: boolean };

const requestResult = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error("IndexedDB indisponível"));
});
async function openDb(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis)) throw Error("IndexedDB unavailable");
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if(!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS,{autoIncrement:true});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Database unavailable"));
  });
}
async function withStore<T>(storeName:string,mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb();
  try {
    const trx=db.transaction(storeName,mode);
    const answer=await requestResult(fn(trx.objectStore(storeName)));
    await new Promise<void>((resolve,reject)=>{trx.oncomplete=()=>resolve();trx.onerror=()=>reject(trx.error);trx.onabort=()=>reject(trx.error)});
    return answer;
  }finally{db.close()}
}
export async function clearDraft():Promise<void>{
  const db=await openDb();
  try{
    const trx=db.transaction([STORE,CHUNKS],"readwrite");
    trx.objectStore(STORE).clear();
    trx.objectStore(CHUNKS).clear();
    await new Promise<void>((resolve,reject)=>{trx.oncomplete=()=>resolve();trx.onerror=()=>reject(trx.error)});
  }finally{db.close()}
}
export function saveDraftMeta(meta:DraftMeta):Promise<IDBValidKey>{
  return withStore(STORE,"readwrite",s=>s.put(meta,KEY));
}
export function appendAudioChunk(chunk:Blob):Promise<IDBValidKey>{
  return withStore(CHUNKS,"readwrite",s=>s.add(chunk));
}
export async function recoverDraft():Promise<RecoveredDraft|null>{
  const db=await openDb();
  try {
    const trx=db.transaction([STORE,CHUNKS],"readonly");
    const meta=await requestResult(trx.objectStore(STORE).get(KEY)) as DraftMeta|undefined;
    const chunks=await requestResult(trx.objectStore(CHUNKS).getAll()) as Blob[];
    if(!meta||chunks.length===0) return null;
    const blob=new Blob(chunks,{type:meta.mimeType});
    return blob.size ? {blob,durationMs:meta.elapsedMs,type:meta.mimeType,partial:meta.status==="recording"} : null;
  }finally{db.close()}
}
