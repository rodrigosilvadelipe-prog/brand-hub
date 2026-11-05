"""Extrai paginas do board PDF de um cliente para curadoria/<slug>/.
Uso: python scripts/extrair-board.py <slug> <pagina>=<nome> [<pagina>=<nome> ...]
Paginas contam a partir de 1. Sem paginas, lista os titulos do PDF."""
import os, sys
from pathlib import Path
import pymupdf

raiz = Path(__file__).resolve().parent.parent
slug = sys.argv[1]
design = Path(os.environ.get('DESIGN_DIR', raiz.parent / 'DESIGN'))
pdf = pymupdf.open(design / 'clientes' / slug / 'vectorcraft' / f'{slug}-brand-kit-board.pdf')
if len(sys.argv) == 2:
    for i, p in enumerate(pdf, 1):
        print(i, (p.get_text().strip().split('\n') or [''])[0][:70])
    raise SystemExit
destino = raiz / 'curadoria' / slug
destino.mkdir(parents=True, exist_ok=True)
for item in sys.argv[2:]:
    n, nome = item.split('=')
    pdf[int(n) - 1].get_pixmap(dpi=96, alpha=False).save(destino / f'{nome}.png')
    print('OK', nome)
