import type { TemplatePreviewDefinition } from '../templates/template-preview-data.js';

interface PreviewPageTemplate extends TemplatePreviewDefinition { name: string; }

export function previewPage(templates: readonly PreviewPageTemplate[]): string {
  const templateOptions = templates.map((template) => `<option value="${template.name}">${template.group} · ${template.label}</option>`).join('');
  const templateDefaults = Object.fromEntries(templates.map((template) => [template.name, template.data]));
  const serializedDefaults = JSON.stringify(templateDefaults).replace(/</g, '\\u003c');
  const templateDescriptions = Object.fromEntries(templates.map((template) => [template.name, template.description]));
  const serializedDescriptions = JSON.stringify(templateDescriptions).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Email Gateway · Preview</title>
<style>
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: #eef1f5; color: #172033; padding-bottom: 104px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 16px; background: #172033; color: #fff; padding: 22px 28px; }
header h1 { margin: 0 0 5px; font-size: 20px; }
header p { margin: 0; color: #b9c3d4; font-size: 13px; }
header button { background: transparent; border: 1px solid #71809a; padding: 7px 10px; font-size: 12px; }
main { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 20px; padding: 22px; min-height: calc(100vh - 91px); }
.panel, .preview { background: #fff; border: 1px solid #dce2eb; border-radius: 12px; box-shadow: 0 6px 24px #1720330d; }
.panel { padding: 18px; }
label { display: block; margin: 0 0 7px; color: #526078; font-size: 12px; font-weight: 700; }
input, select, textarea { width: 100%; border: 1px solid #cbd3df; border-radius: 7px; background: #fff; color: #172033; font: inherit; padding: 10px; }
input:focus, select:focus, textarea:focus { outline: 2px solid #8db5ff; border-color: #447df2; }
.field { margin-bottom: 16px; }
textarea { min-height: 310px; resize: vertical; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
button { border: 0; border-radius: 7px; background: #356ee8; color: #fff; cursor: pointer; font-weight: 700; padding: 10px 14px; }
button:hover { background: #285bc9; }
button:disabled { cursor: wait; opacity: .65; }
.hint { color: #68758a; font-size: 12px; line-height: 1.5; }
#projectStatus { min-height: 18px; margin-top: -7px; margin-bottom: 14px; font-size: 12px; }
.preview { display: flex; flex-direction: column; min-height: 620px; overflow: hidden; }
.preview-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #e6eaf0; padding: 14px 18px; }
.preview-head strong { font-size: 14px; }
#subject { color: #68758a; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
iframe { width: 100%; flex: 1; min-height: 560px; border: 0; background: #f6f7f9; }
.preview-actions, .viewport-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.preview-actions button, .viewport-actions button { font-size: 12px; padding: 8px 10px; }
#status { min-height: 18px; margin: 10px 0 0; font-size: 12px; }
.error { color: #b42318; }
.success { color: #16794c; }
.send-bar { position: fixed; z-index: 2; right: 0; bottom: 0; left: 0; display: flex; align-items: center; gap: 10px; border-top: 1px solid #cbd3df; background: #fffffff2; box-shadow: 0 -6px 20px #17203314; padding: 14px 22px; backdrop-filter: blur(8px); }
.send-bar span { color: #526078; font-size: 13px; font-weight: 700; white-space: nowrap; }
.send-bar input { max-width: 390px; }
.recent { grid-column: 1 / -1; background: #fff; border: 1px solid #dce2eb; border-radius: 12px; box-shadow: 0 6px 24px #1720330d; padding: 18px; }
.recent-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.recent h2 { margin: 0; font-size: 15px; }
.recent table { width: 100%; border-collapse: collapse; font-size: 12px; }
.recent th, .recent td { border-top: 1px solid #e6eaf0; text-align: left; padding: 9px 6px; vertical-align: top; }
.recent th { color: #68758a; font-size: 11px; text-transform: uppercase; }
.recent td { color: #36445d; }
.recent .empty { color: #68758a; }
@media (max-width: 780px) { main { grid-template-columns: 1fr; } .send-bar span { display: none; } .send-bar input { max-width: none; } .send-bar button { white-space: nowrap; } }
</style>
</head>
<body>
<header><div><h1>Email Gateway · Template Preview</h1><p>Renderize um template e envie um teste pelo mesmo gateway, sem servidor adicional.</p></div><button id="logout" type="button">Sign out</button></header>
<main>
<section class="panel">
<div class="field"><label for="apiKey">API key do projeto</label><input id="apiKey" type="password" autocomplete="off" placeholder="Bearer token" /><div id="projectStatus" class="hint">Informe uma API key para identificar o projeto.</div></div>
<div class="field"><label for="template">Template</label><select id="template">${templateOptions}</select><div id="templateDescription" class="hint"></div></div>
<div class="field"><label for="data">Dados (JSON)</label><textarea id="data" spellcheck="false"></textarea></div>
<div class="preview-actions"><button id="render" type="button">Atualizar preview</button><button id="resetData" type="button">Restaurar exemplo</button><button id="copyData" type="button">Copiar JSON</button></div>
<p id="status" class="hint">O preview não envia e-mail.</p>
</section>
<section class="preview">
<div class="preview-head"><strong>Resultado renderizado</strong><span id="subject">Sem preview</span></div>
<div class="viewport-actions" aria-label="Tamanho do preview"><button id="desktopView" type="button">Desktop</button><button id="mobileView" type="button">Mobile</button></div>
<iframe id="frame" title="Preview do e-mail"></iframe>
</section>
<section class="recent"><div class="recent-head"><h2>Envios recentes</h2><button id="refreshRecent" type="button">Atualizar</button></div><table><thead><tr><th>ID</th><th>Template</th><th>Destinatário</th><th>Status</th><th>Data</th></tr></thead><tbody id="recentRows"><tr><td class="empty" colspan="5">Nenhum envio registrado.</td></tr></tbody></table></section>
</main>
<form id="sendBar" class="send-bar"><span>Enviar e-mail de teste</span><input id="recipient" type="email" required placeholder="destinatario@example.com" aria-label="Destinatário" /><button id="send" type="submit">Enviar teste</button></form>
<script>
const apiKey=document.getElementById('apiKey'),template=document.getElementById('template'),data=document.getElementById('data'),render=document.getElementById('render'),resetData=document.getElementById('resetData'),copyData=document.getElementById('copyData'),sendBar=document.getElementById('sendBar'),send=document.getElementById('send'),frame=document.getElementById('frame'),desktopView=document.getElementById('desktopView'),mobileView=document.getElementById('mobileView'),subject=document.getElementById('subject'),status=document.getElementById('status'),projectStatus=document.getElementById('projectStatus'),logout=document.getElementById('logout'),recentRows=document.getElementById('recentRows'),refreshRecent=document.getElementById('refreshRecent'),templateDescription=document.getElementById('templateDescription');
const templateDefaults=${serializedDefaults}; const templateDescriptions=${serializedDescriptions};
function setStatus(message,kind){status.textContent=message;status.className=kind||'hint';}
function requestOptions(body){return {method:'POST',headers:{'Authorization':'Bearer '+apiKey.value.trim(),'Content-Type':'application/json'},body:JSON.stringify(body)};}
function readData(){try{return JSON.parse(data.value);}catch{throw new Error('Os dados precisam ser um JSON válido.');}}
async function errorMessage(response){try{const body=await response.json();return body.message||body.error||'Pedido rejeitado ('+response.status+').';}catch{return 'Pedido rejeitado ('+response.status+').';}}
async function identifyProject(){if(!apiKey.value.trim()){projectStatus.textContent='Informe uma API key para identificar o projeto.';projectStatus.className='hint';return;}const response=await fetch('/v1/projects/me',{headers:{'Authorization':'Bearer '+apiKey.value.trim()}});if(!response.ok){projectStatus.textContent='API key inválida ou projeto não encontrado.';projectStatus.className='error';return;}const project=await response.json();projectStatus.textContent=project.projectId+' · from '+project.fromEmail;projectStatus.className='success';}
async function renderPreview(){setStatus('A renderizar...','hint');render.disabled=true;try{const response=await fetch('/v1/emails/preview',requestOptions({template:template.value,data:readData()}));if(!response.ok)throw new Error(await errorMessage(response));frame.srcdoc=await response.text();subject.textContent=response.headers.get('X-Email-Subject')||'';setStatus('Preview atualizado. Nenhum e-mail foi enviado.','success');}catch(error){setStatus(error instanceof Error?error.message:String(error),'error');}finally{render.disabled=false;}}
async function loadRecentSends(){const response=await fetch('/admin/emails?limit=20');if(!response.ok)return;const result=await response.json();recentRows.replaceChildren();if(!result.data.length){const row=document.createElement('tr');row.innerHTML='<td class="empty" colspan="5">Nenhum envio registrado.</td>';recentRows.appendChild(row);return;}for(const delivery of result.data){const row=document.createElement('tr');const values=[delivery.id,delivery.template,delivery.to.join(', '),delivery.status,new Date(delivery.createdAt).toLocaleString()];for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}recentRows.appendChild(row);}}
function selectTemplate(){data.value=JSON.stringify(templateDefaults[template.value],null,2);templateDescription.textContent=templateDescriptions[template.value]||'';}
function setViewport(width){frame.style.maxWidth=width;frame.style.margin=width==='100%'?'0':'0 auto';}
render.addEventListener('click',renderPreview);refreshRecent.addEventListener('click',()=>void loadRecentSends());apiKey.addEventListener('change',()=>void identifyProject());logout.addEventListener('click',async()=>{await fetch('/admin/logout',{method:'POST'});window.location.href='/preview';});template.addEventListener('change',selectTemplate);resetData.addEventListener('click',selectTemplate);copyData.addEventListener('click',async()=>{await navigator.clipboard.writeText(data.value);setStatus('JSON copiado para a área de transferência.','success');});desktopView.addEventListener('click',()=>setViewport('100%'));mobileView.addEventListener('click',()=>setViewport('390px'));
sendBar.addEventListener('submit',async(event)=>{event.preventDefault();setStatus('A enviar...','hint');send.disabled=true;try{const response=await fetch('/v1/emails',requestOptions({template:template.value,to:document.getElementById('recipient').value.trim(),data:readData()}));if(!response.ok)throw new Error(await errorMessage(response));const result=await response.json();setStatus('E-mail aceite. ID: '+result.id+' · Message ID: '+result.messageId,'success');void loadRecentSends();}catch(error){setStatus(error instanceof Error?error.message:String(error),'error');}finally{send.disabled=false;}});
setViewport('100%');selectTemplate();void loadRecentSends();
</script>
</body></html>`;
}
