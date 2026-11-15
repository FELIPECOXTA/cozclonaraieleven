# Transcrição com gravador de mensagem de voz

## Experiência aprovada

Tela principal mostra apenas gravador estilo mensagem de voz. Toque no microfone, pause, retome ou conclua. Limite de gravação **180 segundos**, com interrupção automática. Revisão com player antes do botão **Enviar áudio**. Não há upload de arquivo, clonagem ou compra obrigatórios.

O navegador guarda os chunks em IndexedDB, identificados pelo usuário logado (ou rascunho guest temporário quando não há conta). A cada 5 segundos salva o tempo decorrido. Depois de recarregar, tenta juntar os chunks e disponibilizar o rascunho. A recuperação exata de áudios interrompidos depende do codec do navegador e não é garantida. Depois da transcrição, o texto fica no cache local da mesma conta por 24 horas.

## Gateway e tempo de resposta

- `POST /api/transcription/jobs` valida o JWT Supabase e o conteúdo; não pode aceitar um UID informado pelo cliente.
- `ffprobe` valida a duração real do áudio no servidor (<=180,75 s, tolerância para o contêiner); nunca confie no timer da tela.
- O gateway deve responder em até **14.000 ms** com transcrição já existente ou HTTP 202 + `jobId`. O processamento do modelo ocorre depois, assincronamente. A resposta de 14s **não é promessa de transcrever 3 minutos de áudio em 14s**.
- `GET /api/transcription/jobs/:jobId` devolve o estado apenas se o JWT for do mesmo dono. A interface faz polling, sem reenviar o áudio nem reexecutar o Scribe.
- Mesmos bytes e mesma conta: chave HMAC por usuário, reutilização do texto dentro de 24h sem outra chamada à ElevenLabs. O texto guardado no Redis usa AES-256-GCM com nonce aleatório e chave derivada do secret do servidor.
- Uma **sessão gratuita** por conta na janela inicial de 90 dias, controlada por Redis. Em caso de erro da ElevenLabs, a cota é devolvida. Regras de renovação e plano premium ainda pendentes.
- O serviço ElevenLabs Scribe v2/v3, Gemini e OpenAI são invocados apenas no servidor, cada um quando sua chave está configurada. As chaves não são enviadas ao navegador.

O middleware de timeout começa após o Express receber e analisar o corpo da requisição. Para um SLA end-to-end incluindo upload, CDN/reverse proxy devem impor limite de 14s com logs p95/p99 próprios. Não alegar SLA medido antes de testar.

## Três opções de reconhecimento de fala

1. **ElevenLabs Scribe** (`scribe_v2` por padrão, opcional `scribe_v3`): limite máximo de **7.000 ms** por tentativa.
2. **Gemini Transcribe** (`gemini-3.5-transcribe`): segunda opção com **7.000 ms**, se houver `GEMINI_API_KEY` configurada no servidor.
3. **OpenAI Transcribe** (`gpt-transcribe`): terceira opção com **12.000 ms**, apenas se houver `OPENAI_API_KEY` configurada no servidor.

Um provedor que não responde dentro do seu orçamento é cancelado e o próximo disponível é acionado. Abort de requisição **não garante** cancelamento de cobrança no provedor. A ordem evita tentativas simultâneas e custos desnecessários. A UI não recebe nomes, códigos de falha ou chaves dos provedores. Se todos falharem, preserva-se a gravação local e libera-se a tentativa gratuita.

Os limites de 7 s e 12 s são **prazos de espera por provedor**, não garantias de conclusão. O gateway envia 202 + jobId para o usuário sem esperar pelos provedores.

## Fila durável e continuidade

O processamento agora usa **BullMQ + Redis persistente**, com payload de áudio criptografado em AES-256-GCM no Redis, sem texto ou áudio em claro. O worker consome a fila e, após reinícios da instância, pode retomar jobs aguardando na fila. O status fica vinculado à conta autenticada, o ID pode ser recuperado depois de atualizar a página, e o cliente consulta o mesmo processamento sem upload repetido.

A API usa conexão Redis que falha rapidamente. O worker usa conexão própria. A sessão gratuita só é descontada quando um job novo é aceito; se os provedores falharem, a cota é devolvida.

**Limites conhecidos:** infraestrutura ainda depende de Redis persistente e Supabase realmente configurados; jobs interrompidos em chamada remota podem ser repetidos após recuperação de stall. Requer idempotência persistente e métricas de cobrança para produção de alto volume. O serviço não garante disponibilidade de 100% nem elimina falhas da rede.

## Variáveis e infraestrutura para habilitar

```
ELEVENLABS_API_KEY=(secret do host)
ELEVENLABS_STT_MODEL=scribe_v2
GEMINI_API_KEY=(secret opcional para fallback 2)
GEMINI_STT_MODEL=gemini-3.5-transcribe
OPENAI_API_KEY=(secret opcional para fallback 3)
SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=(chave publicável do projeto)
REDIS_URL=rediss://servidor-redis-privado
TRANSCRIPTION_CACHE_SECRET=(secret aleatório longo no servidor)
```

O projeto Supabase precisa usar JWT assimétrico RS256/ES256 com JWKS público verificado pelo backend, e permitir autenticação por link de e-mail. Configurar URL de redirecionamento e SMTP. Sem autenticação e Redis reais, o envio falha fechado (HTTP 503) para não gastar a conta da ElevenLabs publicamente. O gravador local pode ser testado. O host deve ter `ffprobe` instalado e HTTPS para liberar microfone, inclusive no iPhone.

## O que ainda bloqueia a publicação comercial

1. **Fila e garantias de produção:** BullMQ já foi incorporado, mas é preciso configurar Redis persistente, provar a recuperação de tarefas interrompidas e controlar duplicidade de cobrança após falha abrupta do worker.
2. **Segurança dos recursos antigos:** endpoints de clonagem, biblioteca de vozes e geração estão **desativados por padrão**. Nunca habilitar `ENABLE_LEGACY_VOICE_TOOLS=true` em produção sem autenticação, isolamento, revisão de dados em Base64 e autorização expressa.
3. **Teste real com credenciais e aparelhos:** validar Scribe, Gemini e OpenAI com contas reais, gravação Safari iOS, Chrome Android, Samsung Internet e permissões; comparar duração, codecs, retomada em rede instável e latência p95/p99 do gateway com 3 minutos de áudio. Os testes automatizados são simulações Chromium e não substituem aparelhos físicos.
4. **Conformidade e privacidade:** política de retenção, exportação/exclusão de dados, consentimento e segurança LGPD, limites de custo, observabilidade sem registrar áudio ou chaves, cobrança desativada.
5. **Escopo de cache e privacidade:** IndexedDB local não é armazenamento criptografado pelo app. Evitar gravação em aparelhos compartilhados e permitir descartar; definir exclusão automática e segurança do armazenamento do navegador antes de disponibilizar para todos.

## Comandos

```bash
npm install
npm run lint
npm run test:gateway
npm run build
npm run dev
```

Não adicionar tokens, chaves ou gravações ao GitHub. A branch `feat/gravador-whatsapp-cache-gateway` é uma proposta isolada; sem merge na main nem publicação automática.
