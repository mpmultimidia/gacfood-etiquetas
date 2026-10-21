import json, re, sys
from PIL import Image, ImageDraw, ImageFont
import qrcode
casos = json.load(open("tspl-casos.json"))
FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
CEL = {"1": (8, 12), "3": (16, 24)}
def renderizar(t):
    img = Image.new("L", (480, 480), 255); d = ImageDraw.Draw(img); caixas = []; qr = None
    for ln in t.split("\r\n"):
        m = re.match(r'TEXT (\d+),(\d+),"(\d)",0,1,1,"(.*)"$', ln)
        if m:
            x, y, f, s = int(m[1]), int(m[2]), m[3], m[4]; cw, ch = CEL[f]; w = len(s) * cw
            caixas.append((s, x, y, x + w, y + ch))
            if set(s) == {"_"}: d.rectangle([x, y + ch - 3, x + w, y + ch - 1], fill=0)
            else: d.text((x, y - 2), s, font=ImageFont.truetype(FONTE, int(cw / 0.602)), fill=0)
            continue
        m = re.match(r'QRCODE (\d+),(\d+),L,(\d+),A,0,"(.*)"$', ln)
        if m:
            x, y, c, dado = int(m[1]), int(m[2]), int(m[3]), m[4]
            q = qrcode.QRCode(border=0, box_size=1, error_correction=qrcode.constants.ERROR_CORRECT_L); q.add_data(dado); q.make(fit=True)
            mod = q.get_matrix(); n = len(mod)
            for r in range(n):
                for k in range(n):
                    if mod[r][k]: d.rectangle([x + k*c, y + r*c, x + (k+1)*c - 1, y + (r+1)*c - 1], fill=0)
            qr = (x, y, x + n*c, y + n*c)
    return img, caixas, qr
def sob(a, b): return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])
ok = True; imgs = []
for nome, t in casos.items():
    img, caixas, qr = renderizar(t); prob = []
    for s, x0, y0, x1, y1 in caixas:
        if x0 < 8 or y0 < 4 or x1 > 472 or y1 > 476: prob.append(f"fora da margem: '{s[:25]}'")
        yy0 = y1 - 6 if set(s) == {"_"} else y0
        if qr and sob((x0, yy0, x1, y1), (qr[0]-20, qr[1]-12, qr[2]+12, qr[3]+12)): prob.append(f"invade a zona do QR: '{s[:25]}'")
    T = [c for c in caixas if set(c[0]) != {"_"}]
    for i in range(len(T)):
        for j in range(i+1, len(T)):
            a, b = T[i], T[j]
            if a[0] == b[0] and a[2] == b[2] and abs(a[1]-b[1]) <= 2: continue
            if sob(a[1:], b[1:]): prob.append(f"textos sobrepostos: '{a[0][:18]}' x '{b[0][:18]}'")
    corpo = [c for c in T if 70 <= c[2] < 296]
    if corpo and max(c[4] for c in corpo) > 296: prob.append("dados do produto passam da régua do rodapé")
    textos = " ".join(c[0] for c in caixas)
    for obrigatorio in ["ID: ", "Lote: ", "Manip.: ", "Valid.: "]:
        if obrigatorio not in textos: prob.append(f"falta '{obrigatorio}'")
    print(("OK   " if not prob else "ERRO ") + nome, "| QR", qr)
    for p in prob: print("     -", p)
    ok &= not prob; imgs.append(img)
folha = Image.new("L", (490 * len(imgs) + 10, 500), 200)
for i, im in enumerate(imgs): folha.paste(im, (10 + i * 490, 10))
folha.save("previa.png"); sys.exit(0 if ok else 1)
