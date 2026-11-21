"""Cut approved painted art into runtime layers without re-drawing the art.
Source artwork is retained under art-source/painted for regeneration.
"""
from pathlib import Path
from PIL import Image
import math
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'art-source/painted'
ANVIL=ROOT/'public/assets/anvil'
STATION=ROOT/'public/assets/stations'
def cut(im,box,logical=(1313,875)):
 w,h=im.size;lw,lh=logical
 out=im.crop(tuple(round(v*(w/lw if n%2==0 else h/lh)) for n,v in enumerate(box)))
 alpha=out.getchannel('A');bb=alpha.point(lambda v:255 if v>24 else 0).getbbox()
 return out.crop(bb) if bb else out

def fit(im,size):
 out=Image.new('RGBA',size);im=im.copy();im.thumbnail(size,Image.Resampling.LANCZOS);out.alpha_composite(im,((size[0]-im.width)//2,(size[1]-im.height)//2));return out

def run():
 bg=Image.open(SRC/'anvil-background.png').convert('RGBA')
 bg.resize((896,368),Image.Resampling.LANCZOS).save(ANVIL/'backdrop.png')
 sheet=Image.open(SRC/'forge-parts.png').convert('RGBA')
 for name,box in [('blade-hot',(25,0,1285,137)),('blade-shaped',(25,137,1285,271)),('blade-finished',(25,272,1285,394))]:
  c=cut(sheet,box);fit(c,(384,80)).save(ANVIL/(name+'.png'))
 # Middle hammer has the intended head at top and handle below. All animation
 # poses are cut from the same painted tool so proportions stay consistent.
 c=cut(sheet,(565,392,785,701));c.thumbnail((96,160),Image.Resampling.LANCZOS)
 base=Image.new('RGBA',(192,192));base.alpha_composite(c,(96-c.width//2,28))
 for name,angle in [('hammer-raised',-38),('hammer-fall',-18),('hammer-impact',0)]:
  out=base.rotate(angle,resample=Image.Resampling.BICUBIC,center=(96,152)) if angle else base
  out.save(ANVIL/(name+'.png'))
 for name,box,size in [('guard',(32,697,500,858),(40,88)),('grip',(565,710,906,850),(96,48)),('pommel',(1010,701,1180,850),(36,44))]:
  c=cut(sheet,box)
  if name=='guard':c=c.rotate(90,expand=True)
  fit(c,size).save(ANVIL/(name+'.png'))
 print('Cut painted anvil, blades, hammer poses and assembly pieces')
if __name__=='__main__':run()

def cut_station_parts():
 sheet=Image.open(SRC/'station-parts.png').convert('RGBA')
 for name,box,size in [('wheel',(20,0,466,411),(192,192)),('bellows',(492,0,1303,411),(192,138))]:
  c=cut(sheet,box);fit(c,size).save(STATION/(name+'.png'))
 barrel=cut(sheet,(12,410,570,870));barrel=barrel.resize((368,208),Image.Resampling.LANCZOS)
 barrel.save(STATION/'barrel-back.png')
 # Front rim and staves mask the lower half of the weapon. The boundary
 # follows the inner oval, not a rectangular cut across the water.
 front=barrel.copy();pix=front.load()
 for y in range(208):
  for x in range(368):
   nx=(x-184)/168
   boundary=64+math.sqrt(max(0,1-nx*nx))*38
   if y<boundary:pix[x,y]=(0,0,0,0)
 front.save(STATION/'barrel-front.png')
 for n,box in enumerate([(572,410,797,865),(800,410,1075,865),(1077,410,1305,865)]):
  c=cut(sheet,box);fit(c,(224,176)).save(STATION/f'fire-{n}.png')
 # Painted steam: soft blue-grey wisps with low alpha, layered separately.
 # Reuse natural flame silhouettes as the basis for rising plume motion,
 # recolored and diffused rather than block-shaped procedural clouds.
 from PIL import ImageFilter
 for n in range(3):
  fire=Image.open(STATION/f'fire-{n}.png').convert('RGBA');a=fire.getchannel('A').filter(ImageFilter.GaussianBlur(3))
  steam=Image.new('RGBA',fire.size,(190,211,218,0));steam.putalpha(a.point(lambda p:int(p*.42)));steam=steam.resize((192,176),Image.Resampling.LANCZOS);steam.save(STATION/f'steam-{n}.png')
 print('Cut painted wheel, bellows, barrel layers, three fires and steam')
if __name__=='__main__':cut_station_parts()

def cut_backgrounds():
 for source,name in [('anvil-background.png','anvil/backdrop.png'),('quench-background.png','stations/quench-backdrop.png')]:
  Image.open(SRC/source).convert('RGBA').resize((896,368),Image.Resampling.LANCZOS).save(ROOT/'public/assets'/name)
 im=Image.open(SRC/'furnace-grind-panels.png').convert('RGBA');w,h=im.size
 for n,name in enumerate(['furnace-backdrop','grind-backdrop']):
  im.crop((0,round(n*h/2),w,round((n+1)*h/2))).resize((896,368),Image.Resampling.LANCZOS).save(STATION/(name+'.png'))
 print('Cut all four painted backgrounds')
if __name__=='__main__':cut_backgrounds()
