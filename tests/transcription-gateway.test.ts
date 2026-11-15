import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decodeAudio, isPermittedMime, scopedCacheKey, MAX_AUDIO_SECONDS } from "../src/server/transcriptionGateway";

test("limite do gravador é exatamente 180 segundos",()=>{
  assert.equal(MAX_AUDIO_SECONDS,180);
});
test("tipos de áudio permitidos, mas nenhum executável",()=>{
  assert.equal(isPermittedMime("audio/mp4"),true);
  assert.equal(isPermittedMime("audio/webm;codecs=opus"),true);
  assert.equal(isPermittedMime("audio/ogg"),true);
  assert.equal(isPermittedMime("application/x-msdownload"),false);
  assert.equal(isPermittedMime("text/html"),false);
});
test("base64 só aceita formato válido e áudio não vazio",()=>{
  assert.deepEqual(decodeAudio(Buffer.from("sound").toString("base64")),Buffer.from("sound"));
  assert.equal(decodeAudio(""),null);
  assert.equal(decodeAudio("!!!"),null);
  assert.equal(decodeAudio("invalid..."),null);
  assert.equal(decodeAudio("A".repeat(22*1024*1024)),null);
});
test("cache não se mistura entre duas contas",()=>{
  const input=Buffer.from("same recording");
  const key1=scopedCacheKey("test-secret","user-felipe",input);
  const key2=scopedCacheKey("test-secret","user-outro",input);
  assert.notEqual(key1,key2);
  assert.equal(key1,scopedCacheKey("test-secret","user-felipe",input));
  assert.notEqual(key1,scopedCacheKey("test-secret","user-felipe",Buffer.from("different recording")));
  assert.equal(key1.length,64);
});
