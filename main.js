// --- init map ---
const map = L.map('map', { center:[-7.0,110.4], zoom:15, zoomControl:true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:'&copy; OpenStreetMap contributors',
  maxZoom:19
}).addTo(map);

// fix map container resize
window.addEventListener('load', ()=>{ map.invalidateSize(); });

// --- crop box ---
const crop = document.getElementById('cropBox');
const mapWrap = document.getElementById('map-wrap');
function resetCrop(){
  const size = Math.min(mapWrap.clientWidth,mapWrap.clientHeight)*0.3;
  crop.style.width = crop.style.height = size+'px';
  crop.style.left = (mapWrap.clientWidth-size)/2+'px';
  crop.style.top = (mapWrap.clientHeight-size)/2+'px';
}
resetCrop();
window.addEventListener('resize',resetCrop);

// crop drag
let dragging=false,start={x:0,y:0,left:0,top:0};
crop.addEventListener('mousedown', e=>{
  dragging=true;
  start.x=e.clientX; start.y=e.clientY;
  const r=crop.getBoundingClientRect();
  start.left=r.left; start.top=r.top;
  document.body.style.userSelect='none';
});
window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  const dx=e.clientX-start.x, dy=e.clientY-start.y;
  const mw=mapWrap.getBoundingClientRect();
  let nl=start.left+dx, nt=start.top+dy;
  nl=Math.max(mw.left,Math.min(nl,mw.right-crop.offsetWidth));
  nt=Math.max(mw.top,Math.min(nt,mw.bottom-crop.offsetHeight));
  crop.style.left=(nl-mw.left)+'px';
  crop.style.top=(nt-mw.top)+'px';
});
window.addEventListener('mouseup', ()=>{ dragging=false; document.body.style.userSelect='auto'; });

// get crop bbox
function getCropBbox(){
  const rect=crop.getBoundingClientRect();
  const mapRect=map.getContainer().getBoundingClientRect();
  const x1=rect.left-mapRect.left, y1=rect.top-mapRect.top;
  const x2=x1+rect.width, y2=y1+rect.height;
  const p1=map.containerPointToLatLng([x1,y1]);
  const p2=map.containerPointToLatLng([x2,y2]);
  return [Math.min(p1.lng,p2.lng), Math.min(p1.lat,p2.lat), Math.max(p1.lng,p2.lng), Math.max(p1.lat,p2.lat)];
}

// search
document.getElementById('btnSearch').addEventListener('click', async ()=>{
  const q=document.getElementById('searchInput').value.trim(); if(!q) return;
  const url='https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q);
  try{
    const res=await fetch(url); const data=await res.json();
    if(!data.length) return alert('Not found');
    map.setView([parseFloat(data[0].lat),parseFloat(data[0].lon)],17);
  }catch(e){alert('Search error');}
});

// --- Generate basemap PNG using leaflet-image ---
let lastCanvas=null;
document.getElementById('btnGenerate').addEventListener('click', ()=>{
  const bbox=getCropBbox();
  map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
  
  leafletImage(map, function(err, canvas){
    if(err){ console.error(err); return; }
    const outputSize=parseInt(document.getElementById('sizeSel').value);
    const img=document.createElement('canvas');
    img.width=outputSize; img.height=outputSize;
    const ctx=img.getContext('2d');
    ctx.drawImage(canvas,0,0,outputSize,outputSize);
    lastCanvas=img;
    document.getElementById('result').textContent='Generated '+outputSize+'×'+outputSize+' basemap.';
    document.getElementById('btnExport').disabled=false;
  });
});

// --- Export ZIP with basemap + config.txt + map.im ---
function generateConfigTxt(name="Basemap", author="YourName", version="1.0"){
  return `Name=${name}\nAuthor=${author}\nVersion=${version}\nDescription=Generated basemap for Trainz\n`;
}

function generateMapIM(){ return "IM file placeholder for Trainz basemap"; }

document.getElementById('btnExport').addEventListener('click', ()=>{
  if(!lastCanvas) return;
  const zip=new JSZip();
  lastCanvas.toBlob(blob=>{
    zip.file('basemap.png',blob);
    zip.file('config.txt',generateConfigTxt("MyBasemap","Farhan","1.0"));
    zip.file('map.im',generateMapIM());
    zip.generateAsync({type:'blob'}).then(content=>{
      saveAs(content,'basemap_trainz.zip');
      document.getElementById('result').textContent='ZIP exported!';
    });
  });
});
