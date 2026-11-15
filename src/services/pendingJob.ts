/** Only an opaque job ID (never audio, text or API credentials) is kept across reloads. */
const PREFIX = "voice:pending-job:";
export function rememberPendingJob(accountId:string,jobId:string) {
  if(!accountId || !/^[0-9a-f-]{36}$/i.test(jobId))return;
  try { localStorage.setItem(PREFIX+accountId,jobId); }catch{}
}
export function recoverPendingJob(accountId:string):string|null{
  if(!accountId)return null;
  try {
    const id=localStorage.getItem(PREFIX+accountId);
    return id&&/^[0-9a-f-]{36}$/i.test(id)?id:null;
  }catch{return null}
}
export function forgetPendingJob(accountId:string){
  try { localStorage.removeItem(PREFIX+accountId); }catch{}
}
