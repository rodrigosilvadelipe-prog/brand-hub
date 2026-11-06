# Brand Hub Delipe

Guia de marca dos clientes para o time de design. Os designers abrem o cliente, veem o padrão e baixam os arquivos.

## Como funciona

O guia é gerado do brand kit da central. Não escreva página por cliente: todos usam `src/pages/[cliente].astro`.

1. O kit do cliente fica em `DESIGN/clientes/<slug>/`.
2. `curadoria/<slug>.json` escolhe logos, imagens, faça e evite, layouts e arquivos.
3. Se o cliente tem fonte fora do Google, rode `python scripts/especime-fontes.py <slug>` nesta ordem, antes de importar. Ele usa a fonte da pasta manual ou da máquina, salva só imagens em `curadoria/<slug>/` e, sem a fonte, avisa e não substitui.
4. `npm run importar -- <slug>` gera `src/data/clientes/<slug>.json` e `public/clientes/<slug>/`.
5. Commit e push na `main` publicam o site no Cloudflare Pages.

Se a pasta da central estiver em outro lugar, defina `DESIGN_DIR`.

## Comandos

```bash
npm install
npm run dev
npm run importar -- winq
npm run build
```

## Regras

- Interface sempre Delipe, em Sora. Fontes, cores e grafismos do cliente só nas vitrines.
- "O que o cliente gosta" só com padrão recorrente da marca, escrito na curadoria. Pedido pontual de campanha ou job fica no `aprendizados.md` da central, fora do guia.
- Preço e plano vigente ficam na Central de Clientes. O Hub mostra só modelos de bloco.
- Fonte fora do Google nunca tem arquivo publicado: só imagem, com "onde encontrar" em `fontes` na curadoria.
- `regras` na curadoria entram em "Regras que valem para tudo", junto da seção do kit. Só o que vale para qualquer peça da marca.
- `python scripts/extrair-board.py <slug> 6=elementos 12=planos` extrai páginas do board. Antes de publicar, olhe a imagem: peça ou prancheta com elemento proibido fica fora. Exceção em layout: se o designer precisa ver a estrutura, use `{ "origem": "...", "alerta": "Só estrutura: ..." }` em `layouts`.
- Arquivo acima de 25 MiB fica no Drive, não em `public/`.
