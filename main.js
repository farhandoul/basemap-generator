// --- init map (OSM preview) ---
const map = L.map('map', { center:[-7.0,110.4], zoom:15, zoomControl:false, dragging:false });
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(map);

// --- crop box ---
const crop = document.getElementById('cropBox');
const mapWrap = document.getElementById('map-wrap');
const mapContainer = map.getContainer();
let lastImageBlob = null; let lastSize = 1024;

function resetCrop(){
  const w = mapWrap.clientWidth * 0.35; const h=w; // square 1:1
  crop.style.width = w + 'px'; crop.style.height = h + 'px';
  crop.style.left = (mapWrap.clientWidth/2 - w/2) + 'px'; crop.style.top = (mapWrap.clientHeight/2 - h/2) + 'px';
}
resetCrop(); window.addEventListener('resize', resetCrop);

// --- search ---
document.getElementById('btnSearch').addEventListener('click', async ()=>{
  const q = document.getElementById('searchInput').value.trim(); if(!q) return;
  const url = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q);
  try{
    const res = await fetch(url);
    const data = await res.json();
    if(!data.length) return alert('Not found');
    map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 15);
    resetCrop();
  }catch(e){ alert('Search error'); }
});

// --- get crop bbox ---
function getCropBbox(){
  const rect = crop.getBoundingClientRect(); const mapRect = mapContainer.getBoundingClientRect();
  const x1 = rect.left - mapRect.left; const y1 = rect.top - mapRect.top;
  const x2 = x1 + rect.width; const y2 = y1 + rect.height;
  const p1 = map.containerPointToLatLng([x1,y1]); const p2 = map.containerPointToLatLng([x2,y2]);
  const minX = Math.min(p1.lng,p2.lng); const maxX = Math.max(p1.lng,p2.lng);
  const minY = Math.min(p1.lat,p2.lat); const maxY = Math.max(p1.lat,p2.lat);
  return [minX,minY,maxX,maxY];
}

// --- build Esri URL ---
function buildEsriUrl(bbox,size){
  const params = new URLSearchParams({bbox:bbox.join(','),bboxSR:4326,size:size+','+size,imageSR:3857,format:'jpgpng',f:'image'});
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?'+params.toString();
}

// --- generate ---
document.getElementById('btnGenerate').addEventListener('click', async ()=>{
  const size = parseInt(document.getElementById('sizeSel').value,10);
  const bbox = getCropBbox();
  document.getElementById('result').innerText = 'Fetching image...';
  try{
    const url = buildEsriUrl(bbox,size);
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const blob = await res.blob(); lastImageBlob = blob; lastSize = size;
    document.getElementById('result').innerText = `Image fetched: ${size}×${size}\nURL: ${url}`;
    document.getElementById('btnExport').disabled = false;
  }catch(e){ document.getElementById('result').innerText = 'Error: '+e; }
});

// --- export ---
document.getElementById('btnExport').addEventListener('click', async ()=>{
  if(!lastImageBlob) return alert('Generate first');
  document.getElementById('result').innerText = 'Building ZIP...';

  const bmp = await createImageBitmap(lastImageBlob);
  const thumb = document.createElement('canvas'); thumb.width=240; thumb.height=180; thumb.getContext('2d').drawImage(bmp,0,0,240,180);
  const thumbBlob = await new Promise(r=>thumb.toBlob(r,'image/jpeg'));

  const kuid = document.getElementById('inputKuid').value || '<kuid:xxxx:xxxx>';
  const build = document.getElementById('inputBuild').value || '2.9';
  const author = document.getElementById('inputAuthor').value || 'Author';
  const publisher = document.getElementById('inputPublisher').value || 'Publisher';
  const desc = document.getElementById('inputDesc').value || 'Description';

  const configTxt = `
kuid               ${kuid}
description        "${desc}"
username           "${kuid}"
trainz-build       ${build}
kind               "scenery"
author             "${author}"
publisher          "${publisher}"

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
  const imTxt = `imfileversion 1.0\nmesh\n{\nvertex 4\n{ -0.5,0,-0.5 }\n{ 0.5,0,-0.5 }\n{ 0.5,0,0.5 }\n{ -0.5,0,0.5 }\npoly 2\n{ 0,1,2 }\n{ 0,2,3 }\n}\n`;

  const zip = new JSZip();
  zip.file('basemap.png', lastImageBlob);
  zip.file('thumbnail.jpg', thumbBlob);
  zip.file('basemap.texture.txt', textureTxt);
  zip.file('config.txt', configTxt);
  zip.file('basemap.im', imTxt);

  const blob = await zip.generateAsync({type:'blob'});
  saveAs(blob, 'trainz_basemap.zip');
  document.getElementById('result').innerText = 'ZIP ready';
});
