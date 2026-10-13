# Sharp Recipes

Runnable snippets. `sharp` is already a dependency in `webapp/package.json` (`^0.34.5`). Resolve it
explicitly from the repo root; do not install anything. Every command is bounded with `timeout`.

## Read metadata first

```bash
timeout 30 node -e "
const sharp=require('./webapp/node_modules/sharp');
Promise.all(process.argv.slice(1).map(f=>sharp(f).metadata().then(m=>console.log(f,m.width+'x'+m.height,m.format,m.hasAlpha?'alpha':''))))
" webapp/public/screenshots/v2/dashboard-light.webp
```

Never assume dimensions from a filename.

## Resize to a width, never upscale

```bash
timeout 120 node -e "
const sharp=require('./webapp/node_modules/sharp'),fs=require('fs');
(async()=>{
  const out='/tmp/become-img/dashboard-780.webp';
  fs.mkdirSync('/tmp/become-img',{recursive:true});
  const i=await sharp('src.png').resize({width:780,withoutEnlargement:true}).webp({quality:84}).toFile(out);
  console.log(out,i.width+'x'+i.height,Math.round(fs.statSync(out).size/1024)+'KB');
})();
"
```

`withoutEnlargement: true` is not optional. It turns an accidental upscale into a no-op you can see
in the reported dimensions rather than a soft image you ship.

## Crop OS chrome, then resize

Crop at full resolution first, resize once, encode once.

```bash
timeout 120 node -e "
const sharp=require('./webapp/node_modules/sharp'),fs=require('fs');
const STATUS=94, HOME=68;                 // measured once at 780x1688
const crop=async (src,dst)=>{
  const m=await sharp(src).metadata();
  const i=await sharp(src)
    .extract({left:0,top:STATUS,width:m.width,height:m.height-STATUS-HOME})
    .webp({quality:84}).toFile(dst);
  console.log(dst,i.width+'x'+i.height,Math.round(fs.statSync(dst).size/1024)+'KB');
};
(async()=>{
  fs.mkdirSync('/tmp/become-img',{recursive:true});
  await crop('webapp/public/screenshots/v2/dashboard-light.webp','/tmp/become-img/dash-light.webp');
  await crop('webapp/public/screenshots/v2/dashboard-dark.webp','/tmp/become-img/dash-dark.webp');
})();
"
```

**One crop constant, both twins, one script run.** Hand-picking a box per file is how a pair ends up
misaligned.

## Cover-fit into a platform frame

```bash
timeout 120 node -e "
const sharp=require('./webapp/node_modules/sharp'),fs=require('fs');
(async()=>{
  const i=await sharp('src.png')
    .resize({width:1080,height:1920,fit:'cover',position:'top'})
    .jpeg({quality:90,mozjpeg:true}).toFile('/tmp/become-img/story.jpg');
  console.log(i.width+'x'+i.height,Math.round(fs.statSync('/tmp/become-img/story.jpg').size/1024)+'KB');
})();
"
```

`fit: 'cover'` crops to fill. `fit: 'contain'` letterboxes and needs a `background`. For app captures
`position: 'top'` keeps the header rather than centring on the middle of a scroll.

## Pad onto a brand ground

```bash
timeout 120 node -e "
const sharp=require('./webapp/node_modules/sharp');
sharp('src.png')
  .resize({width:820,withoutEnlargement:true})
  .extend({top:220,bottom:260,left:130,right:130,background:'#0a0a0a'})
  .jpeg({quality:90,mozjpeg:true}).toFile('/tmp/become-img/square.jpg')
  .then(i=>console.log(i.width+'x'+i.height));
"
```

Compute the extends so the final size lands exactly on the spec. Verify by reading it back.

## Rounded corners (screen inside a device)

```bash
timeout 120 node -e "
const sharp=require('./webapp/node_modules/sharp');
(async()=>{
  const W=780,H=1688,R=Math.round(W*0.085);      // radius scales with width
  const mask=Buffer.from('<svg width=\"'+W+'\" height=\"'+H+'\"><rect width=\"'+W+'\" height=\"'+H+'\" rx=\"'+R+'\" ry=\"'+R+'\" fill=\"#fff\"/></svg>');
  await sharp('webapp/public/screenshots/v2/dashboard-light.webp')
    .resize(W,H,{fit:'cover'})
    .composite([{input:mask,blend:'dest-in'}])
    .png().toFile('/tmp/become-img/screen-rounded.png');
  console.log('ok');
})();
"
```

Radius as a fraction of width, never a fixed pixel value. A 40px radius on a 1080px phone and on a
300px phone are different objects.

## Drop shadow under a composited object

```bash
timeout 120 node -e "
const sharp=require('./webapp/node_modules/sharp');
(async()=>{
  const obj=await sharp('/tmp/become-img/screen-rounded.png').toBuffer();
  const {width,height}=await sharp(obj).metadata();
  // negate() is required: the alpha channel is white where the object is opaque, and a white
  // multiply is a no-op. Without it the composite darkens everything EXCEPT under the object.
  const shadow=await sharp(obj).extractChannel('alpha')
    .negate()
    .blur(28).toColourspace('b-w')
    .toBuffer();
  await sharp({create:{width:width+160,height:height+200,channels:4,background:'#0a0a0a'}})
    .composite([
      {input:shadow,left:80,top:120,blend:'multiply'},
      {input:obj,left:80,top:90},
    ])
    .png().toFile('/tmp/become-img/screen-shadow.png');
  console.log('ok');
})();
"
```

Offset the shadow down and slightly opposite the implied light. Keep the blur generous and the
opacity low; a hard shadow reads as a paste.

If the output looks like a dark frame with a bright rectangle in the middle, `negate()` is missing.
That is the failure this recipe is written to avoid, and it is easy to miss because the result is
plausible-looking until you compare it against the source.

## Batch a directory

```bash
timeout 300 node -e "
const sharp=require('./webapp/node_modules/sharp'),fs=require('fs'),p=require('path');
const src='/tmp/become-shots', dst='/tmp/become-img';
fs.mkdirSync(dst,{recursive:true});
(async()=>{
  for (const f of fs.readdirSync(src).filter(n=>/\.(png|jpe?g|webp)$/i.test(n))) {
    const out=p.join(dst,f.replace(/\.\w+$/,'.webp'));
    const i=await sharp(p.join(src,f)).resize({width:780,withoutEnlargement:true}).webp({quality:84}).toFile(out);
    console.log(out,i.width+'x'+i.height,Math.round(fs.statSync(out).size/1024)+'KB');
  }
})();
"
```

## Verify everything you wrote

```bash
timeout 60 node -e "
const sharp=require('./webapp/node_modules/sharp'),fs=require('fs'),p=require('path');
const d=process.argv[1];
(async()=>{for(const f of fs.readdirSync(d)){
  const fp=p.join(d,f); if(!/\.(png|jpe?g|webp)$/i.test(f))continue;
  const m=await sharp(fp).metadata();
  console.log(f,m.width+'x'+m.height,m.format,Math.round(fs.statSync(fp).size/1024)+'KB');
}})();
" /tmp/become-img
```

Report these numbers. "Exported the story asset" without dimensions and a byte size is not a report.

## Rules that keep biting

| Rule | Why |
|---|---|
| Crop, then resize, then encode. Once each | Every extra encode compounds artifacts |
| Never re-encode an existing webp as webp | The v2 captures are already quality 84 |
| `withoutEnlargement: true`, always | Silent upscales are the most common defect |
| One script run per twin pair | Guarantees identical crop and quality |
| Write to a new path | Never overwrite a source |
| Delete scratch scripts and `/tmp` output | Nothing one-off stays in the repo |
