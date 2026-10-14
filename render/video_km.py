"""Edição de vídeo KM (ffmpeg). Regra dura: todo vídeo que sai daqui recebe o símbolo KM no canto inferior direito.
Operações (combináveis, nesta ordem): enquadrar 9:16 → cortar duração → letreiro/faixa de texto → legendas (SRT) → logo KM.
"""
import io, os, json, subprocess, tempfile, shutil
from PIL import Image, ImageDraw
from template_manual import fonte, h2r, wrap, titulo_destacado, logo, PRIM, SEC, BRANCO, OURO

AQUI = os.path.dirname(os.path.abspath(__file__))
FONT_BOLD = os.path.join(AQUI, "fonts", "Poppins-Bold.ttf")
FONT_MED = os.path.join(AQUI, "fonts", "Poppins-Medium.ttf")

def _run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: raise RuntimeError(r.stderr[-800:])
    return r.stdout

def probe(path):
    j = json.loads(_run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path]))
    v = next((s for s in j["streams"] if s.get("codec_type") == "video"), {})
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd: rot = int(sd["rotation"])
    w, h = int(v.get("width", 0)), int(v.get("height", 0))
    if rot in (90, -90, 270): w, h = h, w
    return {"w": w, "h": h, "dur": float(j["format"].get("duration", 0)), "audio": any(s.get("codec_type") == "audio" for s in j["streams"])}

def _lum_canto(path, w, h, t=1.0):
    """Luminosidade média do canto inferior direito num frame — decide a cor do logo."""
    out = os.path.join(tempfile.gettempdir(), f"km_frame_{os.getpid()}_{abs(hash(path))}.jpg")
    try:
        _run(["ffmpeg", "-y", "-v", "error", "-ss", str(min(t, 0.5)), "-i", path, "-frames:v", "1", "-q:v", "3", out])
        img = Image.open(out).convert("L"); W, H = img.size
        box = (int(W * 0.78), int(H * 0.86), W, H); reg = img.crop(box).resize((24, 24))
        px = list(reg.getdata()); return sum(px) / max(1, len(px))
    except Exception: return 80
    finally:
        if os.path.exists(out): os.remove(out)

def _png_logo(variante, largura):
    lg = logo(variante); lh = int(lg.height * largura / lg.width)
    lg = lg.resize((largura, lh), Image.LANCZOS)
    p = os.path.join(tempfile.gettempdir(), f"km_logo_{variante}_{largura}.png"); lg.save(p); return p, lh

def _png_faixa(texto, palavra, W, posicao="base", etiqueta=None):
    """Faixa #37414E translúcida com texto (padrão KM) como PNG RGBA de largura W."""
    f = fonte("Bold", int(W * 0.05)); tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    M = int(W * 0.067); linhas = wrap(tmp, texto, f, W - 2 * M - 20); lh = int(W * 0.061)
    alt = 48 + (70 if etiqueta else 0) + len(linhas) * lh + 48
    img = Image.new("RGBA", (W, alt), (*h2r(PRIM), 225)); dr = ImageDraw.Draw(img); y = 40
    if etiqueta:
        dr.text((M, y), etiqueta.upper(), fill=h2r(OURO), font=fonte("Bold", int(W * 0.026))); dr.rectangle([M, y + 40, M + 60, y + 43], fill=h2r(OURO)); y += 70
    titulo_destacado(dr, texto, palavra, f, M, y, W - 2 * M - 20, lh)
    p = os.path.join(tempfile.gettempdir(), f"km_faixa_{abs(hash(texto))}.png"); img.save(p); return p, alt

def _srt(segmentos, path):
    def ts(s): h = int(s // 3600); m = int(s % 3600 // 60); sec = s % 60; return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")
    with open(path, "w", encoding="utf-8") as f:
        for i, sg in enumerate(segmentos, 1): f.write(f"{i}\n{ts(float(sg['inicio']))} --> {ts(float(sg['fim']))}\n{sg['texto'].strip()}\n\n")

def editar(video_bytes, ops):
    """ops: {"enquadrar": "9:16"|None, "cortar": {"inicio": s, "duracao": s}|None, "letreiro": {"texto", "palavra_dourada", "posicao": "base|topo", "etiqueta", "inicio", "fim"}|None,
             "legendas": [{"inicio","fim","texto"}]|None, "logo": True (sempre), "max_mb": 95}
    Devolve (mp4_bytes, info)."""
    tmp = tempfile.mkdtemp(prefix="kmv_")
    try:
        src = os.path.join(tmp, "in.mp4"); open(src, "wb").write(video_bytes)
        p = probe(src); W, H = p["w"], p["h"]
        filtros = []; inputs = ["-i", src]; idx = 1; info = {"origem": f"{W}x{H} {p['dur']:.1f}s"}
        # 1) enquadrar 9:16 (crop central + escala para 1080x1920)
        if ops.get("enquadrar") == "9:16":
            alvo = 9 / 16
            if W / H > alvo + 0.01: nw = int(H * alvo) // 2 * 2; filtros.append(f"crop={nw}:{H}:(iw-{nw})/2:0")
            elif W / H < alvo - 0.01: nh = int(W / alvo) // 2 * 2; filtros.append(f"crop={W}:{nh}:0:(ih-{nh})/2")
            filtros.append("scale=1080:1920:flags=lanczos"); W, H = 1080, 1920; info["enquadrado"] = "1080x1920"
        else:
            if W % 2 or H % 2: filtros.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")
        # 2) letreiro / faixa
        ov = []; alt_faixa_base = 0
        lt = ops.get("letreiro")
        if lt and lt.get("texto"):
            fp, alt = _png_faixa(lt["texto"], lt.get("palavra_dourada"), W, lt.get("posicao", "base"), lt.get("etiqueta"))
            if lt.get("posicao", "base") == "base": alt_faixa_base = alt
            inputs += ["-i", fp]; y = (H - int(H * 0.16) - alt) if lt.get("posicao", "base") == "base" else int(H * 0.13)
            en = ""
            if lt.get("inicio") is not None or lt.get("fim") is not None:
                en = f":enable='between(t,{float(lt.get('inicio') or 0)},{float(lt.get('fim') or 9999)})'"
            ov.append((idx, f"overlay=0:{y}{en}")); idx += 1; info["letreiro"] = lt["texto"]
        # 3) legendas
        if ops.get("legendas"):
            srt = os.path.join(tmp, "leg.srt"); _srt(ops["legendas"], srt)
            # libass usa resolução de script 384x288 para SRT: converter px → unidades
            r = 288 / H; fs = max(10, int(H * 0.042 * r)); mv = int((int(H * 0.17) + (alt_faixa_base + 24 if alt_faixa_base else 0)) * r)
            style = f"FontName=Poppins Medium,FontSize={fs},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV={mv}"
            filtros_leg = f"subtitles='{srt}':fontsdir='{os.path.join(AQUI, 'fonts')}':force_style='{style}'"
            info["legendas"] = len(ops["legendas"])
        else: filtros_leg = None
        # 4) logo KM (regra dura)
        lum = _lum_canto(src, W, H); variante = "branco" if lum < 60 else ("claro" if lum < 140 else "escuro")
        lw = int(W * 0.13); lp, lh = _png_logo(variante, lw); inputs += ["-i", lp]
        ov.append((idx, f"overlay=W-w-{int(W*0.045)}:H-h-{int(H*0.03)}")); idx += 1
        info["logo"] = {"branco": "branco", "claro": "claro #C8CFD7", "escuro": "escuro #37414E"}[variante]
        # montar filter_complex
        chain = "[0:v]" + (",".join(filtros) if filtros else "null") + "[v0]"; last = "v0"; parts = [chain]
        if filtros_leg: parts.append(f"[{last}]{filtros_leg}[vL]"); last = "vL"
        for k, (i, f) in enumerate(ov):
            parts.append(f"[{last}][{i}:v]{f}[v{k+1}]"); last = f"v{k+1}"
        fc = ";".join(parts)
        out = os.path.join(tmp, "out.mp4")
        cmd = ["ffmpeg", "-y", "-v", "error"]
        ct = ops.get("cortar")
        if ct: cmd += ["-ss", str(float(ct.get("inicio", 0)))]
        cmd += inputs
        if ct and ct.get("duracao"): cmd += ["-t", str(float(ct["duracao"]))]
        cmd += ["-filter_complex", fc, "-map", f"[{last}]"]
        if p["audio"]: cmd += ["-map", "0:a?", "-c:a", "aac", "-b:a", "128k"]
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "30", out]
        _run(cmd)
        data = open(out, "rb").read(); p2 = probe(out)
        info.update({"saida": f"{p2['w']}x{p2['h']} {p2['dur']:.1f}s", "mb": round(len(data) / 1048576, 1)})
        return data, info
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def extrair_audio(video_bytes):
    """MP3 mono 16 kHz para transcrição com tempos."""
    tmp = tempfile.mkdtemp(prefix="kma_")
    try:
        src = os.path.join(tmp, "in.mp4"); open(src, "wb").write(video_bytes); out = os.path.join(tmp, "a.mp3")
        _run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", out])
        return open(out, "rb").read()
    finally: shutil.rmtree(tmp, ignore_errors=True)
