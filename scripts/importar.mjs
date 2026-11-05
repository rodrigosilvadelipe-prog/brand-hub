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
const nomeCliente = tokens.nome || /^cliente:\s*(.+)$/m.exec(kit)?.[1] || slug;
const caminho = (o) => (o.startsWith('curadoria/') ? path.join(raiz, o) : path.join(dirCliente, o));
const arquivoFontes = path.join(raiz, 'curadoria', slug, 'fontes.json');
const amostras = fs.existsSync(arquivoFontes) ? JSON.parse(fs.readFileSync(arquivoFontes, 'utf8')) : {};

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
    .replace(/\s*\(definid[oa] pelo usuário[^)]*\)/g, '')
    .replace(/\s*\*{0,2}\[(cliente|referência)[^\]]*\]\*{0,2}/g, '')
    .replace(/\[sugerido[^\]]*\]/g, () => pill('sugerido'))
    .replace(/\[inferido[^\]]*\]/g, () => pill('inferido'))
    .replace(/`?\[a definir\]`?/g, () => pill('a definir'))
    .replace(/\[confirmar[^\]]*\]/g, () => pill('confirmar'));
}
const html = (md) => marked.parse(limpar(md).replace(/^\s*-\s*$/gm, '').trim());

const secoes = {};
const regrasKit = /^## Regras que valem para tudo\n([\s\S]*?)(?=^## )/m.exec(kit)?.[1] || '';
const regrasGerais = [regrasKit.trim(), ...(cur.regras || []).map((r) => `- ${r}`)].filter(Boolean).join('\n');
for (const m of kit.matchAll(/^## (\d+)\. .*\n([\s\S]*?)(?=^## \d+\. |(?![\s\S]))/gm)) secoes[+m[1]] = m[2];

const tabela = (md) => md.split('\n').filter((l) => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l))
  .slice(1).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const semTabela = (md) => md.split('\n').filter((l) => !l.startsWith('|') && !/^(- )?\*\*(Fontes e famílias|Combinações de texto|Aprovad[oa]s?|Proibid[oa]s?)/.test(l)).join('\n');

// Cores, na ordem e com a proporção da tabela do kit. Colunas pelo cabeçalho;
// a linha casa com tokens.json pelo nome ou pelo HEX, e uma linha pode ter duas cores.
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
const slugCor = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '-');
const cabecalho = secoes[5].split('\n').find((l) => l.startsWith('|')).split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
const coluna = (re) => cabecalho.findIndex((c) => re.test(c));
const [colHex, colPapel, colProp] = [coluna(/^hex/), coluna(/^papel/), coluna(/^propor/)];
const chavesCor = Object.keys(tokens.cores);
const linhasCor = {};
for (const c of tabela(secoes[5])) {
  const hexes = (c[colHex] || '').match(/#[0-9a-f]{6}/gi) || [];
  const nomes = c[0].split(' / ');
  hexes.forEach((h, i) => {
    const rotulo = hexes.length === nomes.length ? nomes[i] : nomes[0];
    const k = chavesCor.find((n) => n === rotulo) || chavesCor.find((n) => n === slugCor(rotulo))
      || chavesCor.find((n) => tokens.cores[n].hex.toLowerCase() === h.toLowerCase());
    if (k && !linhasCor[k]) linhasCor[k] = { rotulo, papel: c[colPapel] || '', prop: c[colProp] || '', pctOk: i === 0 };
  });
}
const nomesCor = [...Object.keys(linhasCor), ...chavesCor.filter((n) => !linhasCor[n])];
const rotuloCor = (n) => linhasCor[n]?.rotulo || n;
const cores = nomesCor.map((nome) => {
  const t = tokens.cores[nome];
  const l = linhasCor[nome];
  const prop = l?.prop || '';
  const pct = l?.pctOk ? /^(\d+)%/.exec(prop) : null;
  return { nome: rotuloCor(nome), hex: t.hex.toUpperCase(), rgb: rgb(t.hex), papel: l?.papel || t.papel, proporcao: prop, pct: pct ? +pct[1] : 0, cmyk: t.cmyk?.join(' ') || null, pantone: t.pantone || null };
});
const hexDe = (n) => tokens.cores[n]?.hex;
const chaveDeHex = (h) => chavesCor.find((n) => tokens.cores[n].hex.toLowerCase() === h.toLowerCase());
// Acha a primeira cor citada numa frase: "azul royal, azul noite" ou "o gradiente, amarelo".
function corNaFrase(t) {
  const p = slugCor(t.replace(/[,.]/g, ' ')).split('-').filter(Boolean);
  for (let i = 0; i < p.length; i++) {
    for (const k of [p.slice(i, i + 2).join('-'), p[i]]) {
      if (hexDe(k)) return hexDe(k);
      const fim = chavesCor.find((n) => n.endsWith(`-${k}`));
      if (fim) return hexDe(fim);
    }
  }
  return undefined;
}

const direcaoCss = (d = '') => {
  const css = /CSS (\d+)deg/.exec(d)?.[1];
  if (css) return `${css}deg`;
  return /^(canto superior esquerdo|diagonal)/.test(d) ? '135deg' : /^(topo|de cima)/.test(d) ? '180deg' : '90deg';
};
const cssGrad = (g) => {
  const paradas = g.paradas.map(([c, p]) => `${c} ${Math.round(p * 100)}%`).join(', ');
  return g.tipo === 'radial' ? `radial-gradient(circle at center, ${paradas})` : `linear-gradient(${direcaoCss(g.direcao)}, ${paradas})`;
};
const gradientes = Object.entries(tokens.gradientes || {}).map(([nome, g]) => ({ nome, css: cssGrad(g), direcao: g.direcao }));

function combinacao(t) {
  if (typeof t === 'object') {
    const nome = (h) => rotuloCor(chaveDeHex(h) || h);
    return { texto: `${nome(t.texto)} sobre ${nome(t.fundo)}`, razao: String(t.razao).replace('.', ','), fg: t.texto, bg: t.fundo };
  }
  const m = /^(.+?) sobre (.+?)(?: em texto|, só .*?)?(?: \(([\d,]+)\))?$/.exec(t);
  if (!m) return { texto: t };
  const fg = m[1].split(' ')[0];
  const bg = m[2].split(' ou ')[0];
  return { texto: t.replace(/ \([\d,]+\)$/, ''), razao: m[3] || null, fg: hexDe(fg) || corNaFrase(m[1]), bg: hexDe(bg) || corNaFrase(m[2]) };
}

// Tipografia
const PESO = { thin: 100, extralight: 200, light: 300, book: 350, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, heavy: 800, black: 900 };
const NOME_ESTILO = { 'numero-oferta': 'Número de oferta', 'titulo-1': 'Título 1', 'titulo-2': 'Título 2', subtitulo: 'Subtítulo', 'selo-pill': 'Selo e pílula', cta: 'CTA', corpo: 'Corpo', 'apoio-preco': 'Apoio de preço', legal: 'Legal' };
const avisos = [];

// Imagens leves para o site
async function imagem(origem, largura) {
  const src = caminho(origem);
  const nome = path.basename(origem).replace(/\.\w+$/, '.webp');
  await sharp(src).resize({ width: largura, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(pub, 'img', nome));
  return `${url}/img/${nome}`;
}
const lista = (itens, l) => Promise.all((itens || []).map(async ({ origem, ...resto }) => ({ ...resto, src: await imagem(origem, l) })));

// Tipografia: fonte do Google carrega no site; as outras só aparecem como imagem gerada por scripts/especime-fontes.py.
const familiaBase = tokens.tipografia.familia;
const familias = await Promise.all(tokens.tipografia.familias.map(async (f) => {
  const g = /(?:https:\/\/)?fonts\.google\.com\/[^\s),;]+/.exec(f.onde)?.[0] || null;
  const link = g && (g.startsWith('http') ? g : `https://${g}`);
  const base = { nome: f.nome, uso: limpar(f.uso), pesos: f.pesos, onde: link ? 'Google Fonts' : limpar(cur.fontes?.[f.nome]?.onde || f.onde).replace(/;.*$/, ''), link };
  if (link) return base;
  const a = amostras[f.nome];
  if (!a?.disponivel) {
    avisos.push(`fonte ${f.nome} fora do Google sem amostra: o guia mostra só o nome e onde encontrar`);
    return { ...base, disponivel: false };
  }
  return { ...base, disponivel: true, nomeImg: await imagem(a.nome, 620), especime: await imagem(a.especime, 1100) };
}));
const principal = familias.find((f) => f.nome === familiaBase) || familias[0];
const estilos = await Promise.all(Object.entries(tokens.tipografia.estilos).map(async ([k, e]) => {
  const familia = e.familia || familiaBase;
  const a = amostras[familia]?.estilos?.[k];
  return {
    papel: NOME_ESTILO[k] || k,
    familia,
    peso: e.peso,
    wght: PESO[e.peso.toLowerCase().replace(/\s*italic$/, '')] || 400,
    italico: /italic$/i.test(e.peso),
    px: e.px,
    entrelinha: e.entrelinha,
    ...(a ? { img: await imagem(a.src, 400), imgAltura: a.altura } : {}),
  };
}));
const fontesGoogle = familias.filter((f) => f.link).map((f) => ({
  nome: f.nome,
  pesos: [...new Set([400, ...estilos.filter((e) => e.familia === f.nome).map((e) => e.wght)])].sort((a, b) => a - b),
}));

// Logos
const zip = {};
const copiarLogo = (rel) => {
  const dados = fs.readFileSync(caminho(rel));
  const nome = path.basename(rel);
  fs.writeFileSync(path.join(pub, 'logo', nome), dados);
  zip[nome] = new Uint8Array(dados);
  return `${url}/logo/${nome}`;
};
const logos = cur.logos.map((l) => ({ titulo: l.titulo, quando: l.quando, fundo: l.fundo, src: copiarLogo(l.arquivo) }));
fs.writeFileSync(path.join(pub, 'arquivos', `${slug}-logos.zip`), zipSync(zip));

// Layouts
const layouts = [];
for (const [coluna1, estrutura, uso] of tabela(secoes[9])) {
  const m = /^([A-Z]+\d+)(?:\s*·\s*(.+))?$/.exec(coluna1);
  if (!m) continue;
  const codigo = m[1];
  layouts.push({ codigo, estrutura, quando: uso || m[2] || '', src: cur.layouts?.[codigo] ? await imagem(cur.layouts[codigo], 520) : null });
}

// Arquivos para baixar
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const copiarArquivo = (a) => {
  const nome = path.basename(a.origem);
  const destino = path.join(pub, 'arquivos', nome);
  fs.copyFileSync(caminho(a.origem), destino);
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
  nome: nomeCliente,
  sigla: tokens.sigla,
  status: tokens.status,
  atualizado: tokens.atualizado_em,
  fundo: gradientes.find((g) => g.nome === cur.capa?.gradiente)?.css || cur.capa?.fundo || '#111111',
  capa: { logo: `${url}/logo/${path.basename(cur.capa.logo)}`, slogan: cur.capa.slogan ? `${url}/logo/${path.basename(cur.capa.slogan)}` : null },
  faca: cur.faca,
  evite: cur.evite,
  logos,
  cores,
  gradientes,
  contraste: { ok: tokens.contraste_aprovado.map(combinacao), nao: tokens.contraste_proibido.map(combinacao) },
  familias,
  familiaPrincipal: principal.nome,
  fontesGoogle,
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
for (const a of avisos) console.warn(`AVISO ${a}`);
