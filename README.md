# Brand Hub Delipe

Guia de marca dos clientes para o time de design. Os designers abrem o cliente, veem o padrão e baixam os arquivos.

## Como funciona

O guia é gerado do brand kit da central. Não escreva página por cliente: todos usam `src/pages/[cliente].astro`.

1. O kit do cliente fica em `DESIGN/clientes/<slug>/`.
2. `curadoria/<slug>.json` escolhe logos, imagens, faça e evite, layouts e arquivos.
3. `npm run importar -- <slug>` gera `src/data/clientes/<slug>.json` e `public/clientes/<slug>/`.
4. Commit e push na `main` publicam o site no Cloudflare Pages.

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
- Preço e plano vigente ficam na Central de Clientes. O Hub mostra só modelos de bloco.
- Fonte paga não entra no site. Mostrar como imagem e baixar pelo Drive.
- Arquivo acima de 25 MiB fica no Drive, não em `public/`.
