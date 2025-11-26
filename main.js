const map = L.map('map', { center:[-7.0,110.4], zoom:15, zoomControl:false });
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);


const crop = document.getElementById('cropBox');
const mapWrap = document.getElementById('map-wrap');
let lastImageBlob=null; let lastSize=1024;

// Crop is fixed 1:1, pointer-events:none for now
function resetCrop(){
  const size = Math.min(mapWrap.clientWidth,mapWrap.clientHeight)*0.35;
  crop.style.width = size+'px';
  crop.style.height = size+'px';
  crop.style.left = mapWrap.clientWidth/2 - size/2 + 'px';
  crop.style.top = mapWrap.clientHeight/2 - size/2 + 'px';
}
resetCrop(); window.addEventListener('resize',resetCrop);

// Convert crop to bbox
function getCropBbox(){
  const rect=crop.getBoundingClientRect();
  const mapRect=map.getContainer().getBoundingClientRect();
  const x1=rect.left-mapRect.left; const y1=rect.top-mapRect.top;
  const x2=x1+rect.width; const y2=y1+rect.height;
  const p1=map.containerPointToLatLng([x1,y1]); const p2=map.containerPointToLatLng([x2,y2]);
  return [Math.min(p1.lng,p2.lng),Math.min(p1.lat,p2.lat),Math.max(p1.lng,p2.lng),Math.max(p1.lat,p2.lat)];
}

// Search
document.getElementById('btnSearch').addEventListener('click',async ()=>{
  const q=document.getElementById('searchInput').value.trim(); if(!q) return;
  const url='https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q);
  try{ const res=await fetch(url); const data=await res.json(); if(!data.length) return alert('Not found'); map.setView([parseFloat(data[0].lat),parseFloat(data[0].lon)],17);}catch(e){alert('Search error');}
});

// Build Esri URL
function buildEsriUrl(bbox,size){
  const params=new URLSearchParams({bbox:bbox.join(','),bboxSR:4326,size:size+','+size,imageSR:3857,format:'jpgpng',f:'image'});
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?'+params.toString();
}

// Generate
document.getElementById('btnGenerate').addEventListener('click',async ()=>{
  const size=parseInt(document.getElementById('sizeSel').value,10);
  const bbox=getCropBbox();
  document.getElementById('result').innerText='Fetching image...';
  try{
    const url=buildEsriUrl(bbox,size);
    const res=await fetch(url); if(!res.ok) throw new Error('HTTP '+res.status);
    const blob=await res.blob(); lastImageBlob=blob; lastSize=size;
    document.getElementById('result').innerText=`Image fetched: ${size}×${size}\nURL: ${url}`;
    document.getElementById('btnExport').disabled=false;
  }catch(e){document.getElementById('result').innerText='Error: '+e;}
});

// Export
document.getElementById('btnExport').addEventListener('click',async ()=>{
  if(!lastImageBlob) return alert('Generate first');
  document.getElementById('result').innerText='Building ZIP...';
  const bmp=await createImageBitmap(lastImageBlob);
  const thumb=document.createElement('canvas'); thumb.width=240; thumb.height=180; thumb.getContext('2d').drawImage(bmp,0,0,240,180);
  const thumbBlob=await new Promise(r=>thumb.toBlob(r,'image/jpeg'));

  const kuid=document.getElementById('kuid').value||'xxxxxx:xxxx';
  const author=document.getElementById('author').value||'Unknown';
  const publisher=document.getElementById('publisher').value||'Unknown';
  const desc=document.getElementById('desc').value||'';

  const configTxt=`kuid <kuid:${kuid}>
username "${kuid}"
kind "scenery"
trainz-build 2.9
author "${author}"
publisher "${publisher}"
description "${desc}"

mesh-table
{
  default
  {
    mesh "basemap.im"
    auto-create 1
  }
}

thumbnails
{
  0
  {
    image "thumbnail.jpg"
    width 240
    height 180
  }
}

kuid-table
{
}`;

  const textureTxt=`Primary=basemap.png\nTile=st\n`;
  const imTxt=`imfileversion 1.0\nmesh\n{\nvertex 4\n{ -0.5,0,-0.5 }\n{ 0.5,0,-0.5 }\n{ 0.5,0,0.5 }\n{ -0.5,0,0.5 }\npoly 2\n{0,1,2}\n{0,2,3}\n}\n`;

  const zip=new JSZip();
  zip.file('basemap.png', lastImageBlob);
  zip.file('thumbnail.jpg', thumbBlob);
  zip.file('basemap.texture.txt', textureTxt);
  zip.file('config.txt', configTxt);
  zip.file('basemap.im', imTxt);

  const blob=await zip.generateAsync({type:'blob'});
  saveAs(blob,'trainz_basemap.zip');
  document.getElementById('result').innerText='ZIP ready';
});
