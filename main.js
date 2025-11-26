// --- init map (OSM preview, fixed scale, no zoom) ---
const map = L.map('map', { 
  center:[-7.0,110.4], 
  zoom:15,
  zoomControl: false,
  dragging: true,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  touchZoom: false
});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);


// --- crop box ---
const crop = document.getElementById('cropBox');
const mapWrap = document.getElementById('map-wrap');
const mapContainer = map.getContainer();
let lastImageBlob=null, lastSize=1024;

function resetCrop(){
  const size = Math.min(mapWrap.clientWidth, mapWrap.clientHeight)*0.35;
  crop.style.width = crop.style.height = size+'px';
  crop.style.left = (mapWrap.clientWidth/2 - size/2)+'px';
  crop.style.top = (mapWrap.clientHeight/2 - size/2)+'px';
}
resetCrop();
window.addEventListener('resize', resetCrop);

let dragging=false, resizing=false, resizeDir=null, start={x:0,y:0,left:0,top:0,w:0,h:0};

crop.addEventListener('mousedown', e=>{
  const handle = e.target.closest('.handle');
  if(handle){resizing=true; resizeDir=handle.dataset.h;}else{dragging=true;}
  start.x=e.clientX; start.y=e.clientY;
  const r=crop.getBoundingClientRect(); start.left=r.left; start.top=r.top; start.w=r.width; start.h=r.height;
  document.body.style.userSelect='none';
});

window.addEventListener('mousemove', e=>{
  if(!dragging && !resizing) return;
  const dx=e.clientX-start.x, dy=e.clientY-start.y;
  const mw=mapWrap.getBoundingClientRect();

  if(dragging){
    let nl=start.left+dx, nt=start.top+dy;
    nl=Math.max(mw.left,Math.min(nl,mw.right-start.w));
    nt=Math.max(mw.top,Math.min(nt,mw.bottom-start.h));
    crop.style.left=(nl-mw.left)+'px';
    crop.style.top=(nt-mw.top)+'px';
  }

  if(resizing){
    let newSize = start.w + dx;
    newSize = Math.max(newSize,80); // min 80px
    crop.style.width = crop.style.height = newSize+'px';
    let newL=start.left, newT=start.top;
    if(resizeDir.includes('l')) newL=start.left+(start.w-newSize);
    if(resizeDir.includes('t')) newT=start.top+(start.h-newSize);
    newL=Math.max(mw.left,Math.min(newL,mw.right-newSize));
    newT=Math.max(mw.top,Math.min(newT,mw.bottom-newSize));
    crop.style.left=(newL-mw.left)+'px';
    crop.style.top=(newT-mw.top)+'px';
  }
});

window.addEventListener('mouseup', ()=>{dragging=false; resizing=false; resizeDir=null; document.body.style.userSelect='auto';});

// --- bounding box lon/lat ---
function getCropBbox(){
  const rect=crop.getBoundingClientRect();
  const mapRect=mapContainer.getBoundingClientRect();
  const x1=rect.left-mapRect.left, y1=rect.top-mapRect.top;
  const x2=x1+rect.width, y2=y1+rect.height;
  const p1=map.containerPointToLatLng([x1,y1]);
  const p2=map.containerPointToLatLng([x2,y2]);
  return [Math.min(p1.lng,p2.lng),Math.min(p1.lat,p2.lat),Math.max(p1.lng,p2.lng),Math.max(p1.lat,p2.lat)];
}

// --- search ---
document.getElementById('btnSearch').addEventListener('click', async ()=>{
  const q=document.getElementById('searchInput').value.trim(); if(!q) return;
  const url='https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q);
  try{
    const res=await fetch(url);
    const data=await res.json();
    if(!data.length) return alert('Not found');
    map.setView([parseFloat(data[0].lat),parseFloat(data[0].lon)],17);
  }catch(e){alert('Search error');}
});

// --- Esri URL ---
function buildEsriUrl(bbox,size){
  const params=new URLSearchParams({
    bbox:bbox.join(','), bboxSR:4326, size:size+','+size, imageSR:3857, format:'jpgpng', f:'image'
  });
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?'+params.toString();
}

// --- generate ---
document.getElementById('btnGenerate').addEventListener('click', async ()=>{
  const size=parseInt(document.getElementById('sizeSel').value,10);
  const bbox=getCropBbox();
  document.getElementById('result').innerText='Fetching image...';
  try{
    const url=buildEsriUrl(bbox,size);
    const res=await fetch(url);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const blob=await res.blob(); lastImageBlob=blob; lastSize=size;
    document.getElementById('result').innerText=`Image fetched: ${size}×${size}\nURL: ${url}`;
    document.getElementById('btnExport').disabled=false;
  }catch(e){document.getElementById('result').innerText='Error: '+e;}
});

// --- export ---
document.getElementById('btnExport').addEventListener('click', async ()=>{
  if(!lastImageBlob) return alert('Generate first');
  document.getElementById('result').innerText='Building ZIP...';
  const bmp = await createImageBitmap(lastImageBlob);
  const thumb = document.createElement('canvas'); thumb.width=240; thumb.height=180;
  thumb.getContext('2d').drawImage(bmp,0,0,240,180);
  const thumbBlob = await new Promise(r=>thumb.toBlob(r,'image/jpeg'));

  const kuid = document.getElementById('kuidInput').value || '<kuid:xxxxxx:xxxx>';
  const author = document.getElementById('authorInput').value || 'Author';
  const publisher = document.getElementById('publisherInput').value || 'Publisher';
  const desc = document.getElementById('descInput').value || '';

  const configTxt = `${kuid}
description        "${desc}"
username           "${kuid}"
trainz-build       2.9
kind               "scenery"
category-class     "BR"
category-era       "2010s"
category-region    "US"
author             "${author}"
organisation       ""
contact-email      ""
contact-website    ""
license            ""

mesh-table
{
  default
  {
    mesh           "basemap.im"
    auto-create    1
  }
}
light              1

thumbnails
{
  0
  {
    image          "thumbnail.jpg"
    width          240
    height         180
  }
}

kuid-table
{
}
`;

  const textureTxt = `Primary=basemap.png\nTile=st\n`;

  const imTxt = `imfileversion 1.0
mesh
{
vertex 4
{ -0.5,0,-0.5 }
{ 0.5,0,-0.5 }
{ 0.5,0,0.5 }
{ -0.5,0,0.5 }
poly 2
{ 0,1,2 }
{ 0,2,3 }
}
`;

  const zip = new JSZip();
  zip.file('basemap.png', lastImageBlob);
  zip.file('thumbnail.jpg', thumbBlob);
  zip.file('basemap.texture.txt', textureTxt);
  zip.file('config.txt', configTxt);
  zip.file('basemap.im', imTxt);

  const blob = await zip.generateAsync({type:'blob'});
  saveAs(blob,'trainz_basemap.zip');
  document.getElementById('result').innerText='ZIP ready';
});
