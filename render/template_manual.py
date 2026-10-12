"""Template "manual" — Manual da Marca KM (out/2026).
3:4 1080×1440 · fundo #37414E · título branco · UMA palavra em dourado #B9964B · apoio #C8CFD7 · Poppins ·
etiqueta do pilar (Bold 30 caixa alta) · rodapé: logo KM branco + KAUÊ MÜNCHEN (Medium 22 caixa alta), margem 64.
"""
import io, os, re
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.environ.get("LOGO_PATH", os.path.join(AQUI, "logo_km.png"))
W, H, M = 1080, 1440, 64
PRIM, SEC, BRANCO, PRETO, OURO = "#37414E", "#C8CFD7", "#FFFFFF", "#000000", "#B9964B"

def h2r(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def fonte(peso, tam):
    p = os.path.join(AQUI, "fonts", f"Poppins-{peso}.ttf")
    try: return ImageFont.truetype(p, tam)
    except Exception:
        for alt in ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
            if os.path.exists(alt): return ImageFont.truetype(alt, tam)
        return ImageFont.load_default()

_logo_branco = None
def logo_branco():
    global _logo_branco
    if _logo_branco is None and os.path.exists(LOGO_PATH):
        lg = Image.open(LOGO_PATH).convert("RGBA")
        a = lg.getchannel("A"); _logo_branco = Image.merge("RGBA", (Image.new("L", lg.size, 255),) * 3 + (a,))
    return _logo_branco

def wrap(draw, texto, font, max_w):
    linhas, linha = [], ""
    for w in texto.split():
        t = (linha + " " + w).strip()
        if draw.textbbox((0, 0), t, font=font)[2] > max_w and linha: linhas.append(linha); linha = w
        else: linha = t
    if linha: linhas.append(linha)
    return linhas

def titulo_destacado(draw, texto, palavra, font, x, y, max_w, lh, cor=BRANCO):
    """Desenha título quebrando linhas; a palavra-chave (primeira ocorrência) sai em dourado."""
    alvo = (palavra or "").strip().lower()
    feito = False
    for linha in wrap(draw, texto, font, max_w):
        cx = x
        for tok in linha.split(" "):
            limpo = re.sub(r"[^\wÀ-ÿ]", "", tok).lower()
            c = OURO if (alvo and not feito and limpo == alvo) else cor
            if c == OURO: feito = True
            draw.text((cx, y), tok, fill=h2r(c), font=font)
            cx += draw.textbbox((0, 0), tok + " ", font=font)[2]
        y += lh
    return y

def rodape(img, draw, cor_texto=BRANCO):
    # Só o símbolo KM, sem nome (decisão do dono, 11/10/2026)
    lg = logo_branco()
    y = H - M - 52
    if lg is not None:
        lh = 52; lw = int(lg.width * lh / lg.height); l2 = lg.resize((lw, lh), Image.LANCZOS)
        img.paste(l2, (M, y), l2)

def etiqueta(draw, texto):
    draw.text((M, M), texto.upper(), fill=h2r(OURO), font=fonte("Bold", 30))
    draw.rectangle([M, M + 46, M + 72, M + 49], fill=h2r(OURO))

def base():
    img = Image.new("RGB", (W, H), h2r(PRIM)); return img, ImageDraw.Draw(img)

def jpeg(img):
    b = io.BytesIO(); img.save(b, "JPEG", quality=95); return b.getvalue()

def numeracao(draw, i, total):
    t = f"{i:02d}/{total:02d}"; f = fonte("Medium", 22)
    w = draw.textbbox((0, 0), t, font=f)[2]
    draw.text((W - M - w, H - M - 34), t, fill=h2r(SEC), font=f)

# ---------- Carrossel (capa → problema → conteúdo… → resumo → CTA) ----------
def carrossel(d):
    slides = d.get("slides") or []
    total = len(slides) + 2
    out = []
    # Capa
    img, dr = base(); etiqueta(dr, d.get("etiqueta", "GESTÃO"))
    y = titulo_destacado(dr, d.get("titulo", ""), d.get("palavra_dourada"), fonte("Bold", 72), M, 420, W - 2 * M, 84)
    for l in wrap(dr, d.get("subtitulo", ""), fonte("Regular", 32), W - 2 * M)[:2]:
        dr.text((M, y + 24), l, fill=h2r(SEC), font=fonte("Regular", 32)); y += 44
    rodape(img, dr); numeracao(dr, 1, total); out.append(jpeg(img))
    # Internos
    for i, s in enumerate(slides, start=2):
        img, dr = base(); etiqueta(dr, d.get("etiqueta", "GESTÃO"))
        tipo = (s.get("tipo") or "conteudo").lower()
        rotulo = {"problema": "O PROBLEMA", "resumo": "RESUMO"}.get(tipo)
        y = 300
        if rotulo: dr.text((M, y), rotulo, fill=h2r(SEC), font=fonte("Medium", 22)); y += 44
        y = titulo_destacado(dr, s.get("titulo", ""), s.get("palavra_dourada"), fonte("Bold", 54), M, y, W - 2 * M, 66)
        y += 28
        for l in wrap(dr, s.get("texto", ""), fonte("Regular", 32), W - 2 * M - 40)[:8]:
            dr.text((M, y), l, fill=h2r(SEC), font=fonte("Regular", 32)); y += 46
        rodape(img, dr); numeracao(dr, i, total); out.append(jpeg(img))
    # CTA
    img, dr = base(); etiqueta(dr, d.get("etiqueta", "GESTÃO"))
    lg = logo_branco()
    if lg is not None:
        lw = 220; lh = int(lg.height * lw / lg.width); l2 = lg.resize((lw, lh), Image.LANCZOS); img.paste(l2, ((W - lw) // 2, 330), l2)
    f = fonte("Bold", 54); cta = d.get("cta", "")
    y = 640
    for l in wrap(dr, cta, f, W - 2 * M):
        w = dr.textbbox((0, 0), l, font=f)[2]; dr.text(((W - w) // 2, y), l, fill=h2r(BRANCO), font=f); y += 66
    dr.rectangle([W // 2 - 40, y + 20, W // 2 + 40, y + 24], fill=h2r(OURO))
    f2 = fonte("Regular", 30); t2 = "@kauemunchen"; w2 = dr.textbbox((0, 0), t2, font=f2)[2]
    dr.text(((W - w2) // 2, y + 56), t2, fill=h2r(OURO), font=f2)
    rodape(img, dr); numeracao(dr, total, total); out.append(jpeg(img))
    return out

# ---------- Estático: frase forte + assinatura ----------
def frase(texto, palavra_dourada=None, etiqueta_txt=None, autoria="@kauemunchen"):
    img, dr = base()
    if etiqueta_txt: etiqueta(dr, etiqueta_txt)
    f = fonte("Bold", 64); linhas = wrap(dr, texto, f, W - 2 * M)
    lh = 78; y = (H - len(linhas) * lh) // 2 - 40
    titulo_destacado(dr, texto, palavra_dourada, f, M, y, W - 2 * M, lh)
    y2 = y + len(linhas) * lh + 28
    dr.rectangle([M, y2, M + 72, y2 + 4], fill=h2r(OURO))
    dr.text((M, y2 + 24), autoria, fill=h2r(SEC), font=fonte("Regular", 30))
    rodape(img, dr); return jpeg(img)

# ---------- Letreiro de reel (gancho em caixa #37414E, 9:16 transparente) ----------
def letreiro(gancho, largura=1080):
    f = fonte("Bold", 56); tmp = Image.new("RGBA", (10, 10)); dr = ImageDraw.Draw(tmp)
    linhas = wrap(dr, gancho, f, largura - 2 * 80)
    h = 48 + len(linhas) * 68 + 32
    img = Image.new("RGBA", (largura, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(img)
    dr.rounded_rectangle([40, 0, largura - 40, h], radius=24, fill=h2r(PRIM))
    y = 40
    for l in linhas: dr.text((80, y), l, fill=h2r(BRANCO), font=f); y += 68
    b = io.BytesIO(); img.save(b, "PNG"); return b.getvalue()

# ---------- Marca d'água inteligente (foto do dono) ----------
def _luminancia_media(img, box):
    reg = img.crop(box).convert("L").resize((32, 32))
    px = list(reg.get_flattened_data()) if hasattr(reg, "get_flattened_data") else list(reg.getdata())
    return sum(px) / max(1, len(px))

def _desvio(img, box):
    reg = img.crop(box).convert("L").resize((32, 32))
    px = list(reg.get_flattened_data()) if hasattr(reg, "get_flattened_data") else list(reg.getdata())
    m = sum(px) / len(px); return (sum((p - m) ** 2 for p in px) / len(px)) ** 0.5

def logo_colorido(cor_hex):
    if not os.path.exists(LOGO_PATH): return None
    lg = Image.open(LOGO_PATH).convert("RGBA"); a = lg.getchannel("A"); r, g, b = h2r(cor_hex)
    return Image.merge("RGBA", (Image.new("L", lg.size, r), Image.new("L", lg.size, g), Image.new("L", lg.size, b), a))

def marca_dagua(img_bytes, posicao="inferior-direito", proporcao=0.14, assinatura=False):
    """Aplica o logo KM com cor decidida pela luminosidade do canto: branco em fundo escuro, #37414E em fundo claro.
    Em fundo médio/ruidoso adiciona sombra suave para legibilidade. Retorna (jpeg_bytes, info)."""
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    Wf, Hf = img.size
    lw = int(Wf * proporcao); margem = int(Wf * 0.045)
    lg0 = logo_branco()
    if lg0 is None:
        out = io.BytesIO(); img.convert("RGB").save(out, "JPEG", quality=95); return out.getvalue(), {"logo": "ausente"}
    lh = int(lg0.height * lw / lg0.width)
    x = Wf - lw - margem if "direito" in posicao else margem
    y = Hf - lh - margem if "inferior" in posicao else margem
    box = (max(0, x - 10), max(0, y - 10), min(Wf, x + lw + 10), min(Hf, y + lh + 10))
    lum = _luminancia_media(img, box); dev = _desvio(img, box)
    if lum < 110: cor, nome = BRANCO, "branco"
    elif lum > 170: cor, nome = PRIM, "azul-cinza #37414E"
    else: cor, nome = (BRANCO, "branco") if lum < 140 else (PRIM, "azul-cinza #37414E")
    logo = logo_colorido(cor).resize((lw, lh), Image.LANCZOS)
    # sombra suave quando fundo é médio ou ruidoso
    if 90 < lum < 190 or dev > 40:
        from PIL import ImageFilter
        sombra_cor = (0, 0, 0, 150) if cor == BRANCO else (255, 255, 255, 150)
        sombra = Image.new("RGBA", (lw + 24, lh + 24), (0, 0, 0, 0))
        a = logo.getchannel("A"); s = Image.new("RGBA", logo.size, sombra_cor); s.putalpha(a)
        sombra.paste(s, (12, 12), s); sombra = sombra.filter(ImageFilter.GaussianBlur(6))
        img.alpha_composite(sombra, (x - 12, y - 12))
    img.alpha_composite(logo, (x, y))
    if assinatura:
        dr = ImageDraw.Draw(img); f = fonte("Medium", max(18, int(Wf * 0.02)))
        txt = "@kauemunchen"; tw = dr.textbbox((0, 0), txt, font=f)[2]
        tx = x + lw - tw if "direito" in posicao else x
        dr.text((tx, y + lh + 6), txt, fill=h2r(cor), font=f)
    out = io.BytesIO(); img.convert("RGB").save(out, "JPEG", quality=95)
    return out.getvalue(), {"logo": nome, "luminancia": round(lum), "sombra": bool(90 < lum < 190 or dev > 40), "posicao": posicao}
