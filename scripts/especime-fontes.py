"""Gera amostras em imagem das fontes do cliente que nao estao no Google Fonts.
Uso: python scripts/especime-fontes.py <slug>

Procura a fonte na pasta manual do cliente (caminho em cliente.md) e nas fontes
instaladas nesta maquina. Salva PNGs e o manifesto fontes.json em curadoria/<slug>/.
O arquivo da fonte nunca e copiado. Fonte nao encontrada fica como indisponivel:
nada e substituido. Depois rode npm run importar -- <slug>.
"""
import json, os, re, sys, unicodedata
from pathlib import Path
import pymupdf

raiz = Path(__file__).resolve().parent.parent
slug = sys.argv[1]
design = Path(os.environ.get('DESIGN_DIR', raiz.parent / 'DESIGN'))
dir_cliente = design / 'clientes' / slug
destino = raiz / 'curadoria' / slug
destino.mkdir(parents=True, exist_ok=True)
tinta = '#201326'
escala = 3


def chave(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


def pasta_manual():
    ficha = (dir_cliente / 'cliente.md').read_text(encoding='utf-8-sig')
    m = re.search(r'Pasta manual[^`\n]*`([^`]+)`', ficha)
    return [Path(m.group(1))] if m else []


def pastas():
    casa = Path.home()
    locais = [
        Path('C:/Windows/Fonts'),
        Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/Windows/Fonts',
        casa / 'FontBase',
        Path(os.environ.get('APPDATA', '')) / 'FontBase',
    ]
    return pasta_manual() + [p for p in locais if p.exists()]


def achar(familia):
    """Devolve {estilo: arquivo}, com estilo normalizado: black, blackitalic, regular."""
    alvo = chave(familia)
    achados = {}
    for pasta in pastas():
        if not pasta.exists():
            continue
        for arq in list(pasta.rglob('*.ttf')) + list(pasta.rglob('*.otf')):
            nome = chave(arq.stem)
            if not nome.startswith(alvo):
                try:
                    nome = chave(pymupdf.Font(fontfile=str(arq)).name)
                except Exception:
                    continue
                if not nome.startswith(alvo):
                    continue
            achados.setdefault(nome[len(alvo):] or 'regular', arq)
    return achados


def imagem(html_corpo, faces, largura, altura, nome):
    doc = pymupdf.open()
    # A caixa do HTML precisa de folga para nao reduzir o texto; o recorte volta ao tamanho pedido.
    pagina = doc.new_page(width=largura * 2, height=altura * 2 + 200)
    css = ''.join(f"@font-face{{font-family:f{i};src:url('{a.name}');}}" for i, a in enumerate(faces))
    css += f'*{{margin:0;padding:0;color:{tinta};}}'
    pasta = faces[0].parent
    if any(a.parent != pasta for a in faces):
        raise SystemExit('Pesos da mesma fonte em pastas diferentes')
    if pagina.insert_htmlbox(pagina.rect, html_corpo, css=css, archive=pymupdf.Archive(str(pasta)), scale_low=1)[0] < 0:
        raise SystemExit(f'Texto nao coube em {nome}')
    recorte = pymupdf.Rect(0, 0, largura, altura)
    pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=True, clip=recorte).save(destino / nome)
    return f'curadoria/{slug}/{nome}'


def linha(texto, arq, px, largura, altura, nome):
    corpo = f'<p style="margin:0;font-family:f0;font-size:{px}px;line-height:{altura}px;white-space:nowrap">{texto}</p>'
    return imagem(corpo, [arq], largura, altura, nome)


def forte(estilos):
    for p in ['bold', 'heavy', 'black', 'semibold', 'medium', 'regular']:
        if p in estilos:
            return estilos[p]
    return next(iter(estilos.values()))


def especime(fam, estilos, pesos, nome):
    regular = estilos.get('regular') or forte(estilos)
    faces = [regular] + [estilos[chave(p)] for p in pesos]
    px = 30
    blocos = [
        f'<p style="margin:0;font-family:f0;font-size:{px}px;line-height:44px">{t}</p>'
        for t in ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789 áãâéêíóõôúç ,.!?%&amp;@']
    ]
    blocos.append('<p style="margin:0;font-size:14px;line-height:22px">&nbsp;</p>')
    blocos += [
        f'<p style="margin:0;font-family:f{i + 1};font-size:{px}px;line-height:46px">{p}: Aa Bb Cc 123</p>'
        for i, p in enumerate(pesos)
    ]
    altura = 44 * 3 + 22 + 46 * len(pesos) + 8
    return imagem(''.join(blocos), faces, 720, altura, nome)


tokens = json.loads((dir_cliente / 'tokens.json').read_text(encoding='utf-8-sig'))
tipo = tokens['tipografia']
manifesto = {}
for f in tipo['familias']:
    if 'fonts.google.com' in f['onde']:
        continue
    nome = f['nome']
    base = 'fonte-' + re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', nome).encode('ascii', 'ignore').decode().lower()).strip('-')
    estilos = achar(nome)
    if not estilos:
        manifesto[nome] = {'disponivel': False}
        print(f'AVISO {nome}: nao encontrada na pasta do cliente nem nesta maquina')
        continue
    # Pesos na ordem da lista do kit; o que nao tiver arquivo fica de fora da amostra.
    declarados = [p for p in tipo.get('pesos_disponiveis', []) if nome == tipo.get('familia')]
    pesos = [p for p in declarados if chave(p) in estilos] or [p for p in estilos if 'italic' not in p]
    pesos = [p if p in declarados else p.capitalize() for p in pesos]
    item = {
        'disponivel': True,
        'nome': linha(nome, forte(estilos), 34, round(pymupdf.Font(fontfile=str(forte(estilos))).text_length(nome, 34)) + 8, 46, f'{base}-nome.png'),
        'especime': especime(nome, estilos, pesos, f'{base}-especime.png'),
        'pesos': pesos,
        'estilos': {},
        'faltam': [],
    }
    for k, e in tipo['estilos'].items():
        if e.get('familia', tipo['familia']) != nome:
            continue
        arq = estilos.get(chave(e['peso']))
        if not arq:
            item['faltam'].append(k)
            continue
        px = max(12, min(40, e['px'] / 2.4))
        alt = round(px * 1.4)
        item['estilos'][k] = {'src': linha('Aa 123', arq, px, round(px * 4.2), alt, f'{base}-{k}.png'), 'altura': alt}
    manifesto[nome] = item
    print(f"OK {nome}: {len(pesos)} pesos, {len(item['estilos'])} estilos" + (f", sem arquivo: {item['faltam']}" if item['faltam'] else ''))

(destino / 'fontes.json').write_text(json.dumps(manifesto, ensure_ascii=False, indent=2), encoding='utf-8')
