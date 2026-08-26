import { getProfileRuntime, setProfileRuntime } from "../state.js";

const VERSION_LIMIT = 5;
function emit(){ document.dispatchEvent(new CustomEvent("para-savedatachange")); }
function normalize(value={}){ return { ...(value||{}), saveData: Array.isArray(value?.saveData) ? value.saveData : [] }; }
export function listSaveData(){ return normalize(getProfileRuntime()).saveData.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)); }
export function writeSaveData(gameId, title, payload, meta={}){
  if(!gameId) throw new Error("gameId is required");
  const runtime=normalize(getProfileRuntime()); const now=Date.now();
  const previous=runtime.saveData.find(x=>x.gameId===gameId);
  const versions=[...(previous?.versions||[])];
  if(previous?.payload!==undefined) versions.unshift({ payload: previous.payload, updatedAt: previous.updatedAt, device:"Local" });
  const entry={ gameId, title:title||previous?.title||gameId, payload, updatedAt:now, sizeBytes:meta.sizeBytes||JSON.stringify(payload??null).length, syncState:navigator.onLine?"Pending cloud sync":"Local only", versions:versions.slice(0,VERSION_LIMIT) };
  setProfileRuntime({ saveData:[entry,...runtime.saveData.filter(x=>x.gameId!==gameId)] }); emit(); return entry;
}
export function deleteSaveData(gameId){ const runtime=normalize(getProfileRuntime()); setProfileRuntime({saveData:runtime.saveData.filter(x=>x.gameId!==gameId)}); emit(); }
export function restoreSaveVersion(gameId,index){ const runtime=normalize(getProfileRuntime()); const current=runtime.saveData.find(x=>x.gameId===gameId); const version=current?.versions?.[index]; if(!current||!version) return false; writeSaveData(gameId,current.title,version.payload,{sizeBytes:current.sizeBytes}); return true; }
