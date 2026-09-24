// Small code-native badge and a static derivative of the owner's unchanged GIF.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await sharp(new URL('icons/easy_video.gif', root).pathname.replace(/^\/(\w:)/, '$1')).resize(80,80).png().toFile(new URL('assets/easy-video-still.png',root).pathname.replace(/^\/(\w:)/,'$1'));
// Vector letter paths keep NEW crisp without depending on an installed font.
const letters = '<path d="M24 31V17L33 31V17M40 17H49M40 17V31H49M40 24H47M55 17L58 31L63 22L68 31L71 17" fill="none" stroke="#252943" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
const frames=[];
for(let i=0;i<20;i++){
  const x = -40+i*9;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="88" height="48"><rect width="88" height="48" rx="16" fill="#c9f41d"/><path d="M${x} 0h18l-16 48h-18Z" fill="white" opacity=".38"/>${letters}</svg>`;
  frames.push(await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer());
}
const gif=await sharp(Buffer.concat(frames),{raw:{width:88,height:48*20,channels:4,pageHeight:48}}).gif({loop:1,delay:100}).toBuffer();
await writeFile(new URL('assets/new-class.gif',root),gif);
console.log(JSON.stringify({badgeBytes:gif.length,frames:20,durationMs:2000}));
