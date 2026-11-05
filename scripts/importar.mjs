// Gera os dados e os arquivos de um cliente no Hub a partir do kit em DESIGN/clientes/<slug>.
// Uso: npm run importar -- <slug>   (DESIGN_DIR muda a pasta da central, se precisar)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import sharp from 'sharp';
import { zipSync } from 'fflate';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];
if (!slug) throw new Error('Informe o slug: npm run importar -- winq');
const design = process.env.DESIGN_DIR || path.resolve(raiz, '..', 'DESIGN');
const dirCliente = path.join(design, 'clientes', slug);
const pub = path.join(raiz, 'public', 'clientes', slug);
const url = `/clientes/${slug}`;

const ler = (f) => fs.readFileSync(path.join(dirCliente, f), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const tokens = JSON.parse(ler('tokens.json'));
const kit = ler('brand-kit.md');
const cur = JSON.parse(fs.readFileSync(path.join(raiz, 'curadoria', `${slug}.json`), 'utf8'));

fs.rmSync(pub, { recursive: true, force: true });
for (const d of ['logo', 'img', 'arquivos']) fs.mkdirSync(path.join(pub, d), { recursive: true });

const trocar = (t) => Object.entries(cur.substituir || {}).reduce((s, [a, b]) => s.replaceAll(a, b), t);
const pill = (t) => `<span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-800">${t}</span>`;

// Tira do texto o que só interessa à central: marcas de origem e caminhos internos.
function limpar(md) {
  return trocar(md)
    .replace(/[^.\n]*`[^`\n]*(clientes\/|tokens\.json|jobs\/|cliente\.md|MARCA\\)[^`\n]*`[^.\n]*\.?/g, '')
    .replace(/,? (por definição|decisão) do usuário/g, '')
    .replace(/\s*\(usuário, [\d/]+\)/g, '')
    .replace(/\s*\*{0,2}\[(cliente|referência)[^\]]*\]\*{0,2}/g, '')
    .replace(/\[sugerido[^\]]*\]/g, () => pill('sugerido'))
    .replace(/\[inferido[^\]]*\]/g, () => pill('inferido'))
    .replace(/`?\[a definir\]`?/g, () => pill('a definir'))
    .replace(/\[confirmar\]/g, () => pill('confirmar'));
}
const html = (md) => marked.parse(limpar(md).replace(/^\s*-\s*$/gm, '').trim());

const secoes = {};
const regrasGerais = /^## Regras que valem para tudo\n([\s\S]*?)(?=^## )/m.exec(kit)?.[1] || '';
for (const m of kit.matchAll(/^## (\d+)\. .*\n([\s\S]*?)(?=^## \d+\. |(?![\s\S]))/gm)) secoes[+m[1]] = m[2];

const tabela = (md) => md.split('\n').filter((l) => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l))
  .slice(1).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const semTabela = (md) => md.split('\n').filter((l) => !l.startsWith('|') && !/^(- )?\*\*(Fontes e famílias|Combinações de texto|Aprovadas|Proibidas)/.test(l)).join('\n');

// Cores, na ordem e com a proporção da tabela do kit
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
const linhasCor = Object.fromEntries(tabela(secoes[5]).map((c) => [c[0], c]));
const nomesCor = [...Object.keys(linhasCor), ...Object.keys(tokens.cores).filter((n) => !linhasCor[n])];
const cores = nomesCor.filter((n) => tokens.cores[n]).map((nome) => {
  const t = tokens.cores[nome];
  const prop = linhasCor[nome]?.[4] || '';
  const pct = /^(\d+)%/.exec(prop);
  return { nome, hex: t.hex.toUpperCase(), rgb: rgb(t.hex), papel: linhasCor[nome]?.[3] || t.papel, proporcao: prop, pct: pct ? +pct[1] : 0, cmyk: t.cmyk?.join(' ') || null, pantone: t.pantone || null };
});
const hexDe = (n) => tokens.cores[n]?.hex;

const direcaoCss = (d = '') => (d.startsWith('canto superior esquerdo') ? '135deg' : d.startsWith('topo') ? '180deg' : '90deg');
const cssGrad = (g) => {
  const paradas = g.paradas.map(([c, p]) => `${c} ${Math.round(p * 100)}%`).join(', ');
  return g.tipo === 'radial' ? `radial-gradient(circle at center, ${paradas})` : `linear-gradient(${direcaoCss(g.direcao)}, ${paradas})`;
};
const gradientes = Object.entries(tokens.gradientes || {}).map(([nome, g]) => ({ nome, css: cssGrad(g), direcao: g.direcao }));

function combinacao(t) {
  const m = /^(.+?) sobre (.+?)(?: em texto|, só .*?)?(?: \(([\d,]+)\))?$/.exec(t);
  if (!m) return { texto: t };
  const fg = m[1].split(' ')[0];
  const bg = m[2].split(' ou ')[0];
  return { texto: t.replace(/ \([\d,]+\)$/, ''), razao: m[3] || null, fg: hexDe(fg), bg: hexDe(bg) };
}

// Tipografia
const PESO = { thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const NOME_ESTILO = { 'numero-oferta': 'Número de oferta', 'titulo-1': 'Título 1', 'titulo-2': 'Título 2', subtitulo: 'Subtítulo', 'selo-pill': 'Selo e pílula', cta: 'CTA', corpo: 'Corpo', 'apoio-preco': 'Apoio de preço', legal: 'Legal' };
const familias = tokens.tipografia.familias.map((f) => {
  const g = /https:\/\/fonts\.google\.com\/[^\s),]+/.exec(f.onde)?.[0] || null;
  return { nome: f.nome, uso: f.uso, pesos: f.pesos, onde: g ? 'Google Fonts' : limpar(f.onde).replace(/;.*$/, ''), link: g };
});
const principal = familias.find((f) => f.nome === tokens.tipografia.familia) || familias[0];
const estilos = Object.entries(tokens.tipografia.estilos).map(([k, e]) => ({
  papel: NOME_ESTILO[k] || k,
  peso: e.peso,
  wght: PESO[e.peso.toLowerCase().replace(/\s*italic$/, '')] || 400,
  italico: /italic$/i.test(e.peso),
  px: e.px,
  entrelinha: e.entrelinha,
}));
const pesosFonte = [...new Set([400, ...estilos.map((e) => e.wght)])].sort((a, b) => a - b);

// Imagens leves para o site
async function imagem(origem, largura) {
  const src = origem.startsWith('curadoria/') ? path.join(raiz, origem) : path.join(dirCliente, origem);
  const nome = path.basename(origem).replace(/\.\w+$/, '.webp');
  await sharp(src).resize({ width: largura, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(pub, 'img', nome));
  return `${url}/img/${nome}`;
}
const lista = (itens, l) => Promise.all((itens || []).map(async ({ origem, ...resto }) => ({ ...resto, src: await imagem(origem, l) })));

// Logos
const zip = {};
const copiarLogo = (rel) => {
  const dados = fs.readFileSync(path.join(dirCliente, rel));
  const nome = path.basename(rel);
  fs.writeFileSync(path.join(pub, 'logo', nome), dados);
  zip[nome] = new Uint8Array(dados);
  return `${url}/logo/${nome}`;
};
const logos = cur.logos.map((l) => ({ titulo: l.titulo, quando: l.quando, fundo: l.fundo, src: copiarLogo(l.arquivo) }));
fs.writeFileSync(path.join(pub, 'arquivos', `${slug}-logos.zip`), zipSync(zip));

// Layouts
const layouts = [];
for (const [codigo, estrutura, quando] of tabela(secoes[9])) {
  if (!/^[A-Z]+\d+$/.test(codigo)) continue;
  layouts.push({ codigo, estrutura, quando, src: cur.layouts?.[codigo] ? await imagem(cur.layouts[codigo], 520) : null });
}

// Arquivos para baixar
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const copiarArquivo = (a) => {
  const nome = path.basename(a.origem);
  const destino = path.join(pub, 'arquivos', nome);
  fs.copyFileSync(path.join(dirCliente, a.origem), destino);
  return { titulo: a.titulo, descricao: a.descricao, href: `${url}/arquivos/${nome}`, tamanho: kb(fs.statSync(destino).size), ext: path.extname(nome).slice(1) };
};
const arquivos = [
  { titulo: 'Todos os logos', descricao: 'SVGs oficiais em um ZIP', href: `${url}/arquivos/${slug}-logos.zip`, tamanho: kb(fs.statSync(path.join(pub, 'arquivos', `${slug}-logos.zip`)).size), ext: 'zip' },
  ...(cur.arquivos || []).map(copiarArquivo),
];

// O que o cliente gosta vem só da curadoria: o guia mostra padrão da marca, não pedido pontual de um job.
const gosta = cur.gosta || '';
const naoGosta = cur.naoGosta || '';
const licoes = cur.licoes || [];

const saida = {
  slug,
  nome: tokens.nome,
  sigla: tokens.sigla,
  status: tokens.status,
  atualizado: tokens.atualizado_em,
  fundo: gradientes.find((g) => g.nome === cur.capa?.gradiente)?.css || '#111111',
  capa: { logo: `${url}/logo/${path.basename(cur.capa.logo)}`, slogan: cur.capa.slogan ? `${url}/logo/${path.basename(cur.capa.slogan)}` : null },
  faca: cur.faca,
  evite: cur.evite,
  logos,
  cores,
  gradientes,
  contraste: { ok: tokens.contraste_aprovado.map(combinacao), nao: tokens.contraste_proibido.map(combinacao) },
  familias,
  familiaPrincipal: principal.nome,
  familiaGoogle: Boolean(principal.link),
  pesosFonte,
  estilos,
  layouts,
  arquivos,
  elementos: await lista(cur.elementos, 1100),
  planos: await lista(cur.planos, 1100),
  gosta,
  naoGosta,
  licoes,
  html: {
    regras: regrasGerais ? html(regrasGerais) : '',
    essencia: html(secoes[1]),
    publico: html(secoes[2]),
    voz: html(secoes[3]),
    logo: html(secoes[4]),
    cores: html(semTabela(secoes[5])),
    tipografia: html(semTabela(secoes[6])),
    elementos: html(secoes[7]),
    imagem: html(secoes[8]),
    layouts: html(semTabela(secoes[9])),
    ofertas: html(secoes[10]),
    svas: html(secoes[11]),
  },
};
fs.writeFileSync(path.join(raiz, 'src', 'data', 'clientes', `${slug}.json`), JSON.stringify(saida, null, 2));
console.log(`OK ${slug}: ${logos.length} logos, ${cores.length} cores, ${layouts.length} layouts, ${arquivos.length} arquivos`);
