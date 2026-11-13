import numpy as np, os
from PIL import Image
src='/tmp/claude-0/-home-user-advanced-quantization-techniques-for-large-language-models-4003000/5a3058f7-d91e-5994-a5ff-590ba6c50629/images/12.png'
im=Image.open(src).convert('RGB'); a=np.asarray(im).astype(np.int16)
mx,mn=a.max(2,keepdims=True),a.min(2,keepdims=True)
d=(np.clip(a+255-mx-mn,0,255)*(230/255)+np.array([13,17,23])).clip(0,255).astype(np.uint8)
dark=Image.fromarray(d)
for b in [(1524,254,1609,339),(1524,413,1609,498),(1524,572,1609,657)]: dark.paste(im.crop(b),b[:2])
BG=(13,17,23); S=4096; M=80; GAP=70
# main column: tabs, query, answer, map, menu, input box
main=dark.crop((165,75,1100,1042))
main.paste(dark.crop((12,84,56,126)),(22,9))           # Google logo, moved next to the tabs
# the three source cards, laid side by side
cards=[dark.crop((1178,215,1618,347)),dark.crop((1178,372,1618,506)),dark.crop((1178,531,1618,665))]
g=28; rw=sum(c.width for c in cards)+g*2; rh=max(c.height for c in cards)
row=Image.new('RGB',(rw,rh),BG); x=0
for c in cards: row.paste(c,(x,0)); x+=c.width+g
rs=(S-2*M)/rw; row=row.resize((S-2*M,round(rh*rs)),Image.LANCZOS)
mh=S-2*M-GAP-row.height; ms=mh/main.height
main=main.resize((round(main.width*ms),mh),Image.LANCZOS)
cv=Image.new('RGB',(S,S),BG)
cv.paste(main,((S-main.width)//2,M)); cv.paste(row,(M,M+mh+GAP))
o='/home/user/advanced-quantization-techniques-for-large-language-models-4003000/google-hydrogen-scotland-x.png'
cv.save(o,optimize=True); print(main.size,row.size,os.path.getsize(o)//1024,'KB')
