"""Renderizador KM — código fiel ao bot Instagram KM original (bot.py), exposto por HTTP.
Endpoints: POST /frase {frase, paleta, autoria} -> JPEG
           POST /carrossel {dados:{titulo,subtitulo,slides[],cta}, paleta} -> ZIP de JPEGs (slide_01.jpg ...)
           POST /logo (body=imagem) -> JPEG com logo
           GET  /paletas
"""
import os, io, json, zipfile
from flask import Flask, request, send_file, jsonify

LOGO_PATH = os.environ.get("LOGO_PATH", os.path.join(os.path.dirname(__file__), "logo_km.png"))

PALETAS = {
    "km":    {"nome":"KM Classico",      "escuro":"#37414E","claro":"#F5F0E8","destaque":"#C8A96E","tc":"#FFFFFF","te":"#2A2A2A"},
    "preto": {"nome":"Preto Premium",    "escuro":"#000000","claro":"#F5F0E8","destaque":"#C8A96E","tc":"#FFFFFF","te":"#1A1A1A"},
    "copa":  {"nome":"Copa Brasil",      "escuro":"#1A3A1A","claro":"#FFFDE7","destaque":"#009C3B","tc":"#FFFFFF","te":"#1A3A1A"},
    "azul":  {"nome":"Azul Corporativo", "escuro":"#1A2A4A","claro":"#EEF3FA","destaque":"#4A90D9","tc":"#FFFFFF","te":"#1A2A4A"},
    "vinho": {"nome":"Vinho",            "escuro":"#3A1A1A","claro":"#FAF0E8","destaque":"#C8A96E","tc":"#FFFFFF","te":"#3A1A1A"},
}

def add_logo(img_bytes_or_path, is_bytes=True):
    from PIL import Image
    if is_bytes:
        img = Image.open(io.BytesIO(img_bytes_or_path)).convert("RGBA")
    else:
        img = Image.open(img_bytes_or_path).convert("RGBA")
    W, H = img.size
    if not os.path.exists(LOGO_PATH):
        out = io.BytesIO(); img.convert("RGB").save(out, format="JPEG", quality=95); return out.getvalue()
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo_w = int(W * 0.18); logo_h = int(logo.height * (logo_w / logo.width))
    logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
    margin = int(W * 0.04)
    img.paste(logo, (W - logo_w - margin, H - logo_h - margin), logo)
    final = io.BytesIO(); img.convert("RGB").save(final, format="JPEG", quality=95)
    return final.getvalue()

def get_font(sz, bold=True):
    from PIL import ImageFont
    paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
    if not bold:
        paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"] + paths
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

def renderizar_frase(frase, paleta="km", autoria="@kauemunchen", custom=None):
    from PIL import Image, ImageDraw, ImageFont
    import textwrap as _tw
    pal = PALETAS.get(paleta, PALETAS["km"])
    if paleta == "custom" and custom: pal = custom
    W, H = 1080, 1350
    MARGIN = 72

    def h2r(h):
        h = h.lstrip("#")
        return tuple(int(h[i:i+2], 16) for i in (0,2,4))

    def gf(sz, bold=True):
        paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
        if not bold:
            paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                     "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"] + paths
        for p in paths:
            if os.path.exists(p):
                try: return ImageFont.truetype(p, sz)
                except: pass
        return ImageFont.load_default()

    def wrap_px(text, font, max_w, draw):
        words = text.split()
        lines = []; line = ""
        for w in words:
            test = (line + " " + w).strip()
            if draw.textbbox((0,0), test, font=font)[2] > max_w and line:
                lines.append(line.strip()); line = w
            else:
                line = test
        if line: lines.append(line.strip())
        return lines

    img = Image.new("RGB", (W,H), h2r(pal["claro"]))
    draw = ImageDraw.Draw(img)

    # Barra lateral fina
    draw.rectangle([0, 0, 12, H], fill=h2r(pal["destaque"]))

    # Frase principal — centralizada verticalmente
    f_frase = gf(80)
    lines_frase = wrap_px(frase.upper(), f_frase, W - MARGIN*2 - 40, draw)
    total_h = len(lines_frase) * 90
    y_start = (H - total_h) // 2 - 60

    for line in lines_frase:
        draw.text((MARGIN, y_start), line, fill=h2r(pal["te"]), font=f_frase)
        y_start += 90

    # Linha decorativa abaixo da frase
    draw.rectangle([MARGIN, y_start+30, MARGIN+80, y_start+34], fill=h2r(pal["destaque"]))

    # Autoria
    draw.text((MARGIN, y_start+55), autoria, fill=(*h2r(pal["te"]), 130), font=gf(30, False))

    # Logo KM canto inferior direito
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("RGBA")
            lw = int(W*0.11); lh = int(logo.height*(lw/logo.width))
            logo = logo.resize((lw,lh), Image.LANCZOS)
            img.paste(logo, (W-lw-MARGIN, H-lh-60), logo)
        except: pass

    buf = io.BytesIO(); img.save(buf, "JPEG", quality=95)
    return buf.getvalue()

def car_renderizar(dados, paleta="km", custom=None):
    from PIL import Image, ImageDraw, ImageFont
    import textwrap as _tw
    if not dados or not dados.get("slides"): return []
    pal = PALETAS.get(paleta, PALETAS["km"])
    if paleta == "custom" and custom: pal = custom
    W, H = 1080, 1350  # formato 4:5 feed Instagram
    slides_list = dados["slides"]
    total = len(slides_list) + 2
    result = []

    def h2r(h):
        h = h.lstrip("#")
        return tuple(int(h[i:i+2], 16) for i in (0,2,4))

    def gf(sz, bold=True):
        paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
        if not bold:
            paths = ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                     "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"] + paths
        for p in paths:
            if os.path.exists(p):
                try: return ImageFont.truetype(p, sz)
                except: pass
        return ImageFont.load_default()

    def wrap_text(text, font, max_width, draw):
        """Quebra texto pelo largura real em pixels"""
        words = text.split()
        lines = []
        line = ""
        for w in words:
            test = (line + " " + w).strip()
            bbox = draw.textbbox((0,0), test, font=font)
            if bbox[2] > max_width and line:
                lines.append(line.strip())
                line = w
            else:
                line = test
        if line: lines.append(line.strip())
        return lines

    MARGIN = 80
    MAX_W = W - MARGIN * 2
    FUNDO = "#F7F3EE"

    def bordas(img, draw, cor):
        draw.rectangle([0, 0, W, 12], fill=h2r(cor))
        draw.rectangle([0, H-12, W, H], fill=h2r(cor))
        draw.rectangle([0, 0, 12, H], fill=h2r(cor))
        draw.rectangle([W-12, 0, W, H], fill=h2r(cor))

    def rodape_claro(draw, img):
        draw.rectangle([MARGIN, H-130, W-MARGIN, H-126], fill=h2r(pal["destaque"]))
        draw.text((MARGIN, H-110), "@kauemunchen", fill=h2r(pal["escuro"]), font=gf(28))
        if os.path.exists(LOGO_PATH):
            try:
                logo = Image.open(LOGO_PATH).convert("RGBA")
                lw = int(W*0.10); lh = int(logo.height*(lw/logo.width))
                logo = logo.resize((lw,lh), Image.LANCZOS)
                img.paste(logo, (W-lw-MARGIN, H-lh-90), logo)
            except: pass

    img = Image.new("RGB", (W,H), h2r(FUNDO))
    draw = ImageDraw.Draw(img)
    bordas(img, draw, pal["escuro"])
    draw.text((MARGIN, 80), "CARROSSEL", fill=h2r(pal["destaque"]), font=gf(28))
    draw.rectangle([MARGIN, 128, MARGIN+100, 133], fill=h2r(pal["destaque"]))
    titulo = str(dados.get("titulo","TITULO")).upper()
    f_t = gf(108)
    lines_t = wrap_text(titulo, f_t, MAX_W, draw)
    y = 155
    for line in lines_t:
        draw.text((MARGIN, y), line, fill=h2r(pal["escuro"]), font=f_t)
        y += 118
    sub = str(dados.get("subtitulo",""))
    draw.text((MARGIN, y+30), sub, fill="#888888", font=gf(40, False))
    rodape_claro(draw, img)
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=95); result.append(buf.getvalue())

    for idx, sl in enumerate(slides_list):
        img = Image.new("RGB", (W,H), h2r(FUNDO))
        draw = ImageDraw.Draw(img)
        bordas(img, draw, pal["escuro"])
        num = str(sl.get("num", str(idx+1))).zfill(2)
        titulo_sl = str(sl.get("titulo","")).upper()
        f_watermark = gf(220)
        draw.text((W-MARGIN, 40), num, fill=(*h2r(pal["destaque"]), 45), font=f_watermark, anchor="ra")
        draw.text((MARGIN, 80), num + " - " + titulo_sl, fill=h2r(pal["destaque"]), font=gf(28))
        draw.rectangle([MARGIN, 128, MARGIN+100, 133], fill=h2r(pal["escuro"]))
        f_titulo = gf(108)
        lines_titulo = wrap_text(titulo_sl, f_titulo, MAX_W, draw)
        y = 155
        for line in lines_titulo:
            draw.text((MARGIN, y), line, fill=h2r(pal["escuro"]), font=f_titulo)
            y += 118
        texto = str(sl.get("texto",""))
        f_corpo = gf(38, False)
        y_texto = y + 40
        for line in wrap_text(texto, f_corpo, MAX_W-50, draw):
            draw.text((MARGIN, y_texto), line, fill="#888888", font=f_corpo)
            y_texto += 54
        rodape_claro(draw, img)
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=95); result.append(buf.getvalue())

    img = Image.new("RGB", (W,H), h2r(pal["escuro"]))
    draw = ImageDraw.Draw(img)
    bordas(img, draw, pal["destaque"])
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("RGBA")
            lw = int(W*0.32); lh = int(logo.height*(lw/logo.width))
            logo = logo.resize((lw,lh), Image.LANCZOS)
            img.paste(logo, ((W-lw)//2, int(H*0.18)), logo)
        except: pass
    draw.text((W//2, int(H*0.54)), "KAUE MUNCHEN", fill=(255,255,255), font=gf(48), anchor="mm")
    draw.text((W//2, int(H*0.60)), "@kauemunchen", fill=h2r(pal["destaque"]), font=gf(34,False), anchor="mm")
    draw.rectangle([MARGIN, int(H*0.66), W-MARGIN, int(H*0.664)], fill=h2r(pal["destaque"]))
    cta = str(dados.get("cta","CONECTE-SE.")).upper()
    y_cta = int(H*0.70)
    for line in wrap_text(cta, gf(52), MAX_W-80, draw):
        draw.text((W//2, y_cta), line, fill=(255,255,255), font=gf(52), anchor="mm")
        y_cta += 62
    draw.text((W//2, int(H*0.84)), "Quem tem muitas frentes,", fill=(190,190,190), font=gf(32,False), anchor="mm")
    draw.text((W//2, int(H*0.89)), "tem muito a compartilhar.", fill=(190,190,190), font=gf(32,False), anchor="mm")
    bx = W//2-200; bw = 400; bh = 60; by2 = int(H*0.93)
    draw.rectangle([bx, by2, bx+bw, by2+bh], fill=h2r(pal["destaque"]))
    draw.text((W//2, by2+30), "@kauemunchen", fill=h2r(pal["escuro"]), font=gf(28), anchor="mm")
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=95); result.append(buf.getvalue())
    return result


app = Flask(__name__)

@app.get("/paletas")
def paletas(): return jsonify({k: v["nome"] for k, v in PALETAS.items()})

@app.post("/frase")
def frase_ep():
    j = request.get_json(force=True)
    out = renderizar_frase(j["frase"], j.get("paleta", "km"), j.get("autoria", "@kauemunchen"), j.get("custom"))
    return send_file(io.BytesIO(out), mimetype="image/jpeg")

@app.post("/carrossel")
def carrossel_ep():
    j = request.get_json(force=True)
    slides = car_renderizar(j["dados"], j.get("paleta", "km"), j.get("custom"))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for i, b in enumerate(slides): z.writestr(f"slide_{i+1:02d}.jpg", b)
    buf.seek(0); return send_file(buf, mimetype="application/zip")

@app.post("/logo")
def logo_ep():
    return send_file(io.BytesIO(add_logo(request.get_data(), True)), mimetype="image/jpeg")

@app.get("/health")
def health(): return jsonify(ok=True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5055)))
