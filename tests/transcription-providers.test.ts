import test from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDER_BUDGETS, createTranscriptionProviders, transcribeWithFallback, ProvidersUnavailable,
  type Provider
} from "../src/server/transcriptionProviders";

const audio=Buffer.from("fake audio test data");
test("ordem fixa ElevenLabs (7s), Gemini (7s), OpenAI (12s)",()=>{
  assert.deepEqual(PROVIDER_BUDGETS,{elevenlabs:7000,gemini:7000,openai:12000});
  const names=createTranscriptionProviders({
    ELEVENLABS_API_KEY:"test",GEMINI_API_KEY:"test",OPENAI_API_KEY:"test"
  }).map(p=>p.name);
  assert.deepEqual(names,["elevenlabs","gemini","openai"]);
});
test("provedores não configurados não são chamados",()=>{
  assert.deepEqual(createTranscriptionProviders({}).map(p=>p.name),[]);
  assert.deepEqual(createTranscriptionProviders({GEMINI_API_KEY:"test"}).map(p=>p.name),["gemini"]);
});
test("quando ElevenLabs falha, recorre ao Gemini sem repetir o primeiro",async()=>{
  const called:string[]=[];
  const providers:Provider[]=[
    {name:"elevenlabs",budgetMs:20,transcribe:async()=>{called.push("elevenlabs");throw Error("private provider key error")}},
    {name:"gemini",budgetMs:20,transcribe:async()=>{called.push("gemini");return "  Texto transcrito.  "}},
    {name:"openai",budgetMs:20,transcribe:async()=>{called.push("openai");return "never"}}
  ];
  const result=await transcribeWithFallback(providers,{audio,mime:"audio/webm"});
  assert.deepEqual(result,{text:"Texto transcrito.",provider:"gemini"});
  assert.deepEqual(called,["elevenlabs","gemini"]);
});
test("provedor pendurado passa ao seguinte após deadline, mesmo ignorando AbortSignal",async()=>{
  const visited:string[]=[];
  let firstSignal:AbortSignal|undefined;
  const providers:Provider[]=[
    {name:"elevenlabs",budgetMs:15,transcribe:async({signal})=>{firstSignal=signal;visited.push("elevenlabs");return new Promise<string>(()=>{});}},
    {name:"gemini",budgetMs:15,transcribe:async()=>{visited.push("gemini");return "Resultado rápido";}}
  ];
  const started=Date.now();
  const result=await transcribeWithFallback(providers,{audio,mime:"audio/webm"});
  assert.equal(result.provider,"gemini");
  assert.equal(firstSignal?.aborted,true);
  assert.deepEqual(visited,["elevenlabs","gemini"]);
  assert.ok(Date.now()-started<2000);
});
test("três falhas não retornam falso sucesso",async()=>{
  const providers:Provider[]=[
    {name:"elevenlabs",budgetMs:10,transcribe:async()=>{throw Error("secret");}},
    {name:"gemini",budgetMs:10,transcribe:async()=>""},
    {name:"openai",budgetMs:10,transcribe:async()=>{throw Error("secret");}},
  ];
  await assert.rejects(
    ()=>transcribeWithFallback(providers,{audio,mime:"audio/webm"}),
    ProvidersUnavailable
  );
});
