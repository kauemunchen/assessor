"""Identidade visual por requisição (multi-cliente).
Sem marca → padrão KM (conta admin). Com marca → cores, assinatura e logos do próprio cliente.
A marca vale só para a requisição corrente (contextvars), então requisições simultâneas não se misturam.
"""
import base64, contextvars, io, os
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
KM = {"fundo": "#37414E", "titulo": "#FFFFFF", "apoio": "#C8CFD7", "destaque": "#B9964B", "assinatura": "@kauemunchen"}
_atual = contextvars.ContextVar("marca", default=None)


def h2r(h):
    h = str(h or "#000000").lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    try: return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except Exception: return (0, 0, 0)


def _lum(h):
    r, g, b = [c / 255 for c in h2r(h)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contraste(a, b):
    la, lb = sorted([_lum(a), _lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _mistura(a, b, t):
    ra, rb = h2r(a), h2r(b)
    return "#%02X%02X%02X" % tuple(int(ra[i] * t + rb[i] * (1 - t)) for i in range(3))


class Marca:
    def __init__(self, d=None):
        d = d or {}
        self.km = not d or bool(d.get("km"))
        cores = d.get("cores") or {}
        base = KM if self.km else {}
        self.fundo = cores.get("fundo") or base.get("fundo") or "#1F2A37"
        tit = cores.get("titulo") or base.get("titulo")
        if not tit or contraste(tit, self.fundo) < 3:
            tit = "#FFFFFF" if contraste("#FFFFFF", self.fundo) >= contraste("#1A1A1A", self.fundo) else "#1A1A1A"
        self.titulo = tit
        dest = cores.get("destaque") or base.get("destaque")
        self.destaque = dest if dest and contraste(dest, self.fundo) >= 1.8 else self.titulo
        apoio = cores.get("apoio") or base.get("apoio")
        self.apoio = apoio if apoio and contraste(apoio, self.fundo) >= 2.5 else _mistura(self.titulo, self.fundo, 0.72)
        self.assinatura = d.get("assinatura", base.get("assinatura", "")) or ""
        self.nome = d.get("nome") or ("KM" if self.km else "")
        self._raw = d.get("logos") or {}
        self._cache = {}

    def tem_logo(self):
        return self.km or any(self._raw.get(k) for k in ("principal", "claro", "escuro"))

    def logo(self, variante="claro"):
        """variante: 'branco'/'claro' = para fundo escuro · 'escuro' = para fundo claro."""
        if variante in self._cache: return self._cache[variante]
        img = None
        if self.km:
            p = os.path.join(AQUI, f"logo_km_{variante}.png")
            if os.path.exists(p): img = Image.open(p).convert("RGBA")
        else:
            claro = variante in ("branco", "claro")
            ordem = ["claro", "principal", "escuro"] if claro else ["escuro", "principal", "claro"]
            b64 = next((self._raw[k] for k in ordem if self._raw.get(k)), None)
            if b64:
                try: img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
                except Exception: img = None
        self._cache[variante] = img
        return img


def usar(d):
    """Define a marca da requisição corrente. d = dict vindo do app (ou None para KM)."""
    _atual.set(Marca(d))


def mk():
    m = _atual.get()
    if m is None:
        m = Marca(None); _atual.set(m)
    return m
