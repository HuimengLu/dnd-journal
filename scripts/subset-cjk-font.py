"""Rebuild web/src/assets/fonts/journal-hand.woff2 — the app's only typeface — from Xiaolai-Regular.ttf (github.com/lxgw/kose-font).

Keeps Latin (ASCII + Latin-1), common punctuation/symbols, GB2312 level-1 characters and every Chinese character used in the app; run it from the project root
after adding new Chinese UI text:  python3 scripts/subset-cjk-font.py Xiaolai-Regular.ttf web/src/assets/fonts/journal-hand.woff2
Requires fonttools and brotli (pip install fonttools brotli).
"""
import sys, re, glob
from fontTools import subset
from fontTools.ttLib import TTFont
src, out = sys.argv[1], sys.argv[2]
chars = set()
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try: chars.add(bytes([hi, lo]).decode('gb2312'))
        except UnicodeDecodeError: pass
for f in glob.glob('web/src/**/*.ts*', recursive=True) + glob.glob('shared/*.ts'):
    chars |= set(re.findall(r'[一-鿿]', open(f, encoding='utf-8').read()))
chars |= set('，。、；：？！“”‘’（）《》【】—…·～　「」『』')
chars |= {chr(c) for c in range(0x20, 0x7F)} | {chr(c) for c in range(0xA0, 0x100)}
chars |= set('–—‘’“”…→←↗×−•№✕')
font = TTFont(src)
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']
s = subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(font)
# OFL: a modified (subset) font must not use the Reserved Font Name
for rec in font['name'].names:
    if rec.nameID in (1, 3, 4, 6, 16, 17):
        new = {1: 'Journal Hand', 3: 'JournalHand-Subset', 4: 'Journal Hand Regular', 6: 'JournalHand-Regular', 16: 'Journal Hand', 17: 'Regular'}[rec.nameID]
        rec.string = new
font.flavor = 'woff2'; font.save(out)
print(len(chars), 'chars')
