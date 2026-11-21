"""Cut 5x5 painted upgrade atlases into 10 classes x 5 tiers x 3 heat states.
Keep raw alpha artwork and its material texture. Wood/leather/crystals are not
heated; a pixel-wise metal mask changes only neutral/cool metal surfaces.
"""
from pathlib import Path
from PIL import Image
import colorsys
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'art-source/painted';OUT=ROOT/'public/assets/forging-weapons';OUT.mkdir(parents=True,exist_ok=True)

def thermal(im,strength,organic):
 out=im.copy();p=out.load()
 for y in range(im.height):
  for x in range(im.width):
   r,g,b,a=p[x,y]
   if a<4:continue
   hue,sat,val=colorsys.rgb_to_hsv(r/255,g/255,b/255)
   # Only iron/steel; avoid warm wood, leather, bronze and colorful inlays.
   metal=(sat<.28 or (.48<hue<.72 and sat<.65)) and val>.13
   if not metal:continue
   if organic:heat=strength*.68
   else:heat=strength
   lum=.2126*r+.7152*g+.0722*b
   hot=(min(255,145+lum*.6),min(239,lum*.86+18),max(8,lum*.15))
   p[x,y]=tuple(round(c*(1-heat)+v*heat) for c,v in zip((r,g,b),hot))+(a,)
 return out

def trim(im):
 # The painted sheet has a few tips across nominal cell boundaries. Keep the
 # main connected silhouette, not fragments from the neighboring weapon.
 w,h=im.size;alpha=im.getchannel('A');data=list(alpha.getdata());seen=set();groups=[]
 for start,value in enumerate(data):
  if value<=30 or start in seen:continue
  group=[];stack=[start];seen.add(start)
  while stack:
   k=stack.pop();group.append(k);x=k%w;y=k//w
   for yy in range(max(0,y-1),min(h,y+2)):
    for xx in range(max(0,x-1),min(w,x+2)):
     n=yy*w+xx
     if data[n]>30 and n not in seen:seen.add(n);stack.append(n)
  groups.append(group)
 if not groups:return im
 largest=max(groups,key=len);mask=Image.new('L',im.size);mp=mask.load()
 for k in largest:mp[k%w,k//w]=255
 from PIL import ImageFilter,ImageChops
 # Keep antialiased edge pixels around the connected painted silhouette.
 mask=mask.filter(ImageFilter.MaxFilter(5));im.putalpha(ImageChops.multiply(alpha,mask))
 bb=mask.getbbox()
 return im.crop(bb) if bb else im

def run():
 for filename,types in [('upgrades-a.png',['sword','shield','dagger','spear','cleaver']),('upgrades-b.png',['longbow','staff','axe','scythe','trident'])]:
  path=SRC/filename
  if not path.exists():continue
  atlas=Image.open(path).convert('RGBA');w,h=atlas.size
  bounds = [0,.18,.43,.59,.75,1] if filename == 'upgrades-a.png' else [0,.21,.38,.57,.80,1]
  for row,kind in enumerate(types):
   for tier in range(5):
    c=atlas.crop((round(tier*w/5),round(bounds[row]*h),round((tier+1)*w/5),round(bounds[row+1]*h)))
    # If image is chroma-keyed instead of alpha, remove only vivid magenta.
    px=c.load()
    for y in range(c.height):
     for x in range(c.width):
      r,g,b,a=px[x,y]
      if r>160 and b>140 and g<100 and r>g*1.6 and b>g*1.5:px[x,y]=(0,0,0,0)
    c=trim(c)
    # Sheet prompts request horizontal art. No rotation is applied to shields.
    c.thumbnail((384,200),Image.Resampling.LANCZOS)
    for heat,strength in [('cold',0),('warm',.44),('hot',.86)]:
     out=thermal(c,strength,kind in ('longbow','staff','shield')) if strength else c
     out.save(OUT/f'{kind}-t{tier}-{heat}.png')
 print(f'{len(list(OUT.glob("*.png")))} painted weapon states')
if __name__=='__main__':run()
