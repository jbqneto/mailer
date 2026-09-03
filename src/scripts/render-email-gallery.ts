import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileTemplate } from '../templates/template-registry.js';
import { listTemplatePreviews } from '../templates/template-preview-data.js';

const outputDirectory = process.env.EMAIL_GALLERY_DIR ?? 'tmp/email-gallery';
const entries = [] as Array<{ name: string; group: string; label: string; description: string; subject: string; htmlFile: string; textFile: string }>;

await mkdir(outputDirectory, { recursive: true });
for (const preview of listTemplatePreviews()) {
  const result = await compileTemplate(preview.name, preview.data);
  const htmlFile = `${preview.name}.html`;
  const textFile = `${preview.name}.txt`;
  await writeFile(join(outputDirectory, htmlFile), result.html, 'utf8');
  await writeFile(join(outputDirectory, textFile), result.text, 'utf8');
  entries.push({ name: preview.name, group: preview.group, label: preview.label, description: preview.description, subject: result.subject, htmlFile, textFile });
}

const manifest = { generatedAt: new Date().toISOString(), entries };
await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const cards = entries.map((entry) => `
<article><header><span>${entry.group}</span><h2>${entry.label}</h2><p>${entry.description}</p><small>Subject: ${entry.subject}</small></header><iframe title="${entry.label}" src="${entry.htmlFile}"></iframe><details><summary>Plain text</summary><iframe title="${entry.label} plain text" src="${entry.textFile}"></iframe></details></article>`).join('\n');
const index = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Email Gateway · Template Gallery</title><style>body{margin:0;padding:24px;background:#eef1f5;color:#172033;font-family:system-ui,sans-serif}main{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}article{overflow:hidden;border:1px solid #dce2eb;border-radius:12px;background:white;box-shadow:0 6px 24px #1720330d}header{padding:16px}header span{color:#356ee8;font-size:12px;font-weight:700;text-transform:uppercase}h2{margin:6px 0;font-size:18px}p{margin:0 0 8px;color:#526078;font-size:13px}small{color:#68758a;font-size:12px}iframe{display:block;width:100%;height:620px;border:0;background:#f6f7f9}details{border-top:1px solid #e6eaf0;padding:12px 16px}details iframe{height:160px;margin-top:12px;border:1px solid #e6eaf0}</style></head><body><h1>Email Gateway · Template Gallery</h1><p>Generated from the preview catalog.</p><main>${cards}</main></body></html>\n`;
await writeFile(join(outputDirectory, 'index.html'), index, 'utf8');
console.log(`Generated ${entries.length} templates in ${outputDirectory}`);
