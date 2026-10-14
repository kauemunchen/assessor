"""Stories KM — 9:16 1080×1920, padrão do Manual da Marca.
Fundo #37414E · Poppins · título branco com UMA palavra dourada #B9964B · apoio #C8CFD7 · logo KM (símbolo) SEMPRE no canto padrão.
Modelos: foto_faixa, frase, chamada_feed, passos, pergunta, data. Toda saída passa por marca_dagua() no fim — regra dura.
"""
import io
from PIL import Image, ImageDraw, ImageFilter
from template_manual import fonte, h2r, wrap, titulo_destacado, logo, marca_dagua, PRIM, SEC, BRANCO, OURO

W, H, M = 1080, 1920, 72
ZONA_TOPO, ZONA_BASE = 250, 300  # áreas que a UI do Instagram cobre — não pôr texto importante lá

def _base(cor=PRIM):
    img = Image.new("RGB", (W, H), h2r(cor)); return img, ImageDraw.Draw(img)

def _jpeg(img):
    b = io.BytesIO(); img.convert("RGB").save(b, "JPEG", quality=95); return b.getvalue()

def _finalizar(img):
    """Regra dura: toda arte de story sai com o símbolo KM no canto padrão (inferior-direito), cor decidida pela luminosidade."""
    out, info = marca_dagua(_jpeg(img), "inferior-direito", 0.13, False)
    return out, info

def _etiqueta(dr, texto, y=ZONA_TOPO):
    if not texto: return y
    dr.text((M, y), texto.upper(), fill=h2r(OURO), font=fonte("Bold", 30))
    dr.rectangle([M, y + 46, M + 72, y + 49], fill=h2r(OURO))
    return y + 90

def _cover(foto_bytes):
    """Foto preenchendo 1080×1920 (crop central)."""
    f = Image.open(io.BytesIO(foto_bytes)).convert("RGB")
    r = max(W / f.width, H / f.height)
    f = f.resize((int(f.width * r) + 1, int(f.height * r) + 1), Image.LANCZOS)
    x = (f.width - W) // 2; y = (f.height - H) // 2
    return f.crop((x, y, x + W, y + H))

# 1) Foto + faixa de texto (faixa #37414E translúcida na base, texto branco, palavra dourada)
def foto_faixa(foto_bytes, texto, palavra_dourada=None, etiqueta_txt=None, posicao="base"):
    img = _cover(foto_bytes).convert("RGBA")
    f = fonte("Bold", 54); tmp = ImageDraw.Draw(img)
    linhas = wrap(tmp, texto, f, W - 2 * M - 40); lh = 66
    alt = 60 + (46 + 30 if etiqueta_txt else 0) + len(linhas) * lh + 60
    y0 = (H - ZONA_BASE - alt - 40) if posicao == "base" else (ZONA_TOPO + 40)
    faixa = Image.new("RGBA", (W, alt), (*h2r(PRIM), 225))
    img.alpha_composite(faixa, (0, y0))
    dr = ImageDraw.Draw(img); y = y0 + 48
    if etiqueta_txt:
        dr.text((M, y), etiqueta_txt.upper(), fill=h2r(OURO), font=fonte("Bold", 28)); dr.rectangle([M, y + 42, M + 64, y + 45], fill=h2r(OURO)); y += 76
    titulo_destacado(dr, texto, palavra_dourada, f, M, y, W - 2 * M - 40, lh)
    return _finalizar(img)

# 2) Frase do dia (fundo da marca, frase grande centralizada verticalmente, assinatura discreta)
def frase(texto, palavra_dourada=None, etiqueta_txt=None, autoria="@kauemunchen"):
    img, dr = _base()
    f = fonte("Bold", 72); linhas = wrap(dr, texto, f, W - 2 * M); lh = 88
    bloco = len(linhas) * lh + 80
    y = max(ZONA_TOPO + 80, (H - bloco) // 2 - 60)
    if etiqueta_txt: _etiqueta(dr, etiqueta_txt, y - 110)
    titulo_destacado(dr, texto, palavra_dourada, f, M, y, W - 2 * M, lh)
    y2 = y + len(linhas) * lh + 36
    dr.rectangle([M, y2, M + 80, y2 + 4], fill=h2r(OURO))
    if autoria: dr.text((M, y2 + 28), autoria, fill=h2r(SEC), font=fonte("Regular", 32))
    return _finalizar(img)

# 3) Chamada para o feed (título do post + miniatura da capa 3:4 + "novo no feed")
def chamada_feed(titulo, capa_bytes=None, palavra_dourada=None, chamada="Novo no feed", formato="carrossel"):
    img, dr = _base()
    y = _etiqueta(dr, chamada, ZONA_TOPO + 20)
    f = fonte("Bold", 58); linhas = wrap(dr, titulo, f, W - 2 * M); lh = 70
    titulo_destacado(dr, titulo, palavra_dourada, f, M, y, W - 2 * M, lh); y += len(linhas) * lh + 48
    if capa_bytes:
        capa = Image.open(io.BytesIO(capa_bytes)).convert("RGB")
        cw = W - 2 * M - 160; ch = int(cw * 4 / 3)
        max_h = H - ZONA_BASE - y - 120
        if ch > max_h: ch = max_h; cw = int(ch * 3 / 4)
        capa = capa.resize((cw, ch), Image.LANCZOS)
        cx = (W - cw) // 2
        sombra = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0)); sd = ImageDraw.Draw(sombra)
        sd.rounded_rectangle([20, 24, cw + 20, ch + 24], radius=28, fill=(0, 0, 0, 120)); sombra = sombra.filter(ImageFilter.GaussianBlur(14))
        img.paste(sombra, (cx - 20, y - 20), sombra)
        mask = Image.new("L", (cw, ch), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw, ch], radius=28, fill=255)
        img.paste(capa, (cx, y), mask); y += ch + 36
    seta = {"carrossel": "Arrasta pra cima e salva o post", "reels": "Assiste no feed", "post": "Confere no feed"}.get(formato, "Confere no feed")
    dr.text((M, min(y, H - ZONA_BASE - 60)), seta + "  ↑", fill=h2r(SEC), font=fonte("Medium", 30))
    return _finalizar(img)

# 4) 3 passos / lista numerada
def passos(titulo, itens, palavra_dourada=None, etiqueta_txt=None):
    img, dr = _base()
    y = _etiqueta(dr, etiqueta_txt, ZONA_TOPO + 20) if etiqueta_txt else ZONA_TOPO + 40
    f = fonte("Bold", 60); linhas = wrap(dr, titulo, f, W - 2 * M); lh = 72
    titulo_destacado(dr, titulo, palavra_dourada, f, M, y, W - 2 * M, lh); y += len(linhas) * lh + 56
    fn = fonte("Bold", 54); ft = fonte("Regular", 40)
    for i, it in enumerate(itens[:5], 1):
        dr.text((M, y), f"{i:02d}", fill=h2r(OURO), font=fn)
        ls = wrap(dr, it, ft, W - 2 * M - 110)
        for l in ls: dr.text((M + 110, y + 8), l, fill=h2r(BRANCO), font=ft); y += 52
        y += 34
        if y > H - ZONA_BASE - 80: break
    return _finalizar(img)

# 5) Pergunta aberta (convida resposta por direct)
def pergunta(texto, palavra_dourada=None, rodape_txt="Me responde aqui no direct"):
    img, dr = _base()
    f = fonte("Bold", 76); linhas = wrap(dr, texto, f, W - 2 * M); lh = 92
    y = max(ZONA_TOPO + 120, (H - len(linhas) * lh) // 2 - 80)
    dr.text((M, y - 120), "PERGUNTA", fill=h2r(OURO), font=fonte("Bold", 30)); dr.rectangle([M, y - 74, M + 72, y - 71], fill=h2r(OURO))
    titulo_destacado(dr, texto, palavra_dourada, f, M, y, W - 2 * M, lh)
    y2 = y + len(linhas) * lh + 40
    dr.rounded_rectangle([M, y2, M + 560, y2 + 76], radius=38, outline=h2r(SEC), width=3)
    dr.text((M + 36, y2 + 18), rodape_txt, fill=h2r(SEC), font=fonte("Medium", 30))
    return _finalizar(img)

# 6) Data / contagem (aquecer um post ou evento)
def data(titulo, quando, detalhe=None, palavra_dourada=None, etiqueta_txt="Em breve"):
    img, dr = _base()
    y = _etiqueta(dr, etiqueta_txt, ZONA_TOPO + 20)
    f = fonte("Bold", 60); linhas = wrap(dr, titulo, f, W - 2 * M); lh = 72
    titulo_destacado(dr, titulo, palavra_dourada, f, M, y, W - 2 * M, lh); y += len(linhas) * lh + 70
    fq = fonte("Bold", 120); dr.text((M, y), quando, fill=h2r(OURO), font=fq); y += 150
    if detalhe:
        for l in wrap(dr, detalhe, fonte("Regular", 38), W - 2 * M): dr.text((M, y), l, fill=h2r(SEC), font=fonte("Regular", 38)); y += 50
    return _finalizar(img)
