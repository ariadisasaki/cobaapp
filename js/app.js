// ================= FINAL FIXED HILAL CHECKER =================
console.log("FINAL FIXED HILAL CHECKER");

// ================= GLOBAL =================
let hijriMonthIndex = 0;
let tanggalHijriGlobal = 0;

let hilalData = { alt: 0, azi: 0, elo: 0 };

let smoothX = 0;
let smoothY = 0;

let audioCtx = null;
let locked = false;
let beepCooldown = false;

let headingOffset = 0;
let currentLat = 0;
let currentLon = 0;

let isCalculating = false;
let lastHijriUpdate = 0;

const HIJRI_KEY = "hijriLock";

// ================= KONSTANTA =================
const rad = Math.PI/180;
const deg = 180/Math.PI;

// ================= UTIL =================
function normalize360(x){
  return (x % 360 + 360) % 360;
}

// ================= DELTA T =================
function getDeltaT(){
  const year = new Date().getFullYear();
  const t = (year - 2000)/100;
  return 64.7 + 64.5*t + 0.21*t*t;
}

// ================= KOREKSI =================
function koreksiRefraction(alt){
  if(alt > -1){
    const R = 1.02 / Math.tan((alt + 10.3/(alt+5.11)) * rad);
    return alt + (R/60);
  }
  return alt;
}

function koreksiParallax(alt){
  const pi = 0.9507;
  const altRad = alt * rad;
  const corr = Math.asin(Math.sin(pi*rad) * Math.cos(altRad));
  return alt - (corr * deg);
}

// ================= INIT =================
window.onload = () => {
  startClock();
  getLocation();
  initSensor();

  document.body.addEventListener("click", ()=>{
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }, {once:true});
};

// ================= JAM =================
function startClock(){
  setInterval(()=>{
    const now = new Date();
    document.getElementById("waktu").innerText =
      now.toLocaleString("id-ID");
  },1000);
}

// ================= GPS =================
function getLocation(){
  navigator.geolocation.getCurrentPosition(pos=>{
    setupLocation(pos.coords.latitude, pos.coords.longitude);
  }, err=>{
    console.warn("GPS gagal, pakai default");
    setupLocation(-8.5833, 116.1167);
  }, {enableHighAccuracy:true});
}

function setupLocation(lat, lon){
  currentLat = lat;
  currentLon = lon;

  document.getElementById("loc").innerText =
    `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

  const locStatus = document.getElementById("locStatus");
  if(locStatus) locStatus.innerText = "✅ Lokasi siap";

  getHijri(lat, lon);
  hitungHilal(lat, lon);
  startCam();

  setInterval(()=>{
    hitungHilal(currentLat, currentLon);
  },10000);

  setInterval(()=>{
    getHijri(currentLat, currentLon);
  },60000);
}

// ================= HIJRI =================
function getHijri(lat, lon){
  const now = new Date();
  const nowTime = now.getTime();

  if(nowTime - lastHijriUpdate < 60000) return;
  lastHijriUpdate = nowTime;

  const key = new Date().toDateString();
  if(localStorage.getItem(HIJRI_KEY) === key) return;

  const hilal = hitungHilalCore(lat, lon);

  if(hilal.alt > 3 && hilal.elo > 6.4){
    tanggalHijriGlobal++;
  }

  localStorage.setItem(HIJRI_KEY, key);

  document.getElementById("hijri").innerText =
    `Tanggal Hijriah: ${tanggalHijriGlobal}`;
}

// ================= HILAL =================
function hitungHilal(lat, lon, customTime=null){

  if(isCalculating) return;
  isCalculating = true;

  try{
    const data = hitungHilalCore(lat, lon, customTime);

    hilalData = data;

    document.getElementById("alt").innerText = data.alt.toFixed(2);
    document.getElementById("azi").innerText = data.azi.toFixed(2);
    document.getElementById("elo").innerText = data.elo.toFixed(2);

    updateStatus(data);

    // 🔥 paksa update AR
    updateAR(0,0,0);

    const arText = document.getElementById("arStatus");
    if(arText) arText.innerText = "🎯 Hilal terdeteksi";

  } catch(e){
    console.error("Error hilal:", e);
    document.getElementById("status").innerText =
      "❌ Error perhitungan";
  }

  isCalculating = false;
}

// ================= CORE =================
function hitungHilalCore(lat, lon, customTime=null){

  const now = customTime ? new Date(customTime) : new Date();

  const JD_UTC = (now.getTime()/86400000)+2440587.5;
  const JD = JD_UTC + getDeltaT()/86400;
  const T = (JD - 2451545)/36525;

  const L0 = normalize360(280.4665 + 36000.7698*T);
  const M = normalize360(357.52911 + 35999.05029*T);

  const C = (1.914602 - 0.004817*T) * Math.sin(M*rad)
          + 0.019993 * Math.sin(2*M*rad);

  const sunLong = normalize360(L0 + C);

  const sunRA = Math.atan2(
    Math.cos(23.44*rad)*Math.sin(sunLong*rad),
    Math.cos(sunLong*rad)
  )*deg;

  const sunDec = Math.asin(
    Math.sin(23.44*rad)*Math.sin(sunLong*rad)
  )*deg;

  const Lm = normalize360(218.316 + 13.176396*(JD - 2451545));
  const Mm = normalize360(134.963 + 13.064993*(JD - 2451545));

  const moonLong = Lm + 6.289*Math.sin(Mm*rad);
  const moonLat  = 5.128*Math.sin(Mm*rad);

  const moonRA = Math.atan2(
    Math.sin(moonLong*rad)*Math.cos(23.44*rad) - Math.tan(moonLat*rad)*Math.sin(23.44*rad),
    Math.cos(moonLong*rad)
  )*deg;

  const moonDec = Math.asin(
    Math.sin(moonLat*rad)*Math.cos(23.44*rad) +
    Math.cos(moonLat*rad)*Math.sin(23.44*rad)*Math.sin(moonLong*rad)
  )*deg;

  const GMST = normalize360(280.46061837 + 360.98564736629*(JD - 2451545));
  const LST = normalize360(GMST + lon);

  let HA = normalize360(LST - moonRA);
  if(HA > 180) HA -= 360;

  let alt = Math.asin(
    Math.sin(lat*rad)*Math.sin(moonDec*rad) +
    Math.cos(lat*rad)*Math.cos(moonDec*rad)*Math.cos(HA*rad)
  )*deg;

  let azi = Math.atan2(
    -Math.sin(HA*rad),
    Math.tan(moonDec*rad)*Math.cos(lat*rad) -
    Math.sin(lat*rad)*Math.cos(HA*rad)
  )*deg;

  azi = normalize360(azi);

  alt = koreksiParallax(alt);
  alt = koreksiRefraction(alt);

  const elo = Math.acos(
    Math.sin(sunDec*rad)*Math.sin(moonDec*rad) +
    Math.cos(sunDec*rad)*Math.cos(moonDec*rad)*Math.cos((sunRA - moonRA)*rad)
  )*deg;

  if(isNaN(alt) || isNaN(azi) || isNaN(elo)){
    throw new Error("NaN hasil");
  }

  return { alt, azi, elo };
}

// ================= STATUS =================
function updateStatus(data){
  let status = "❌ Tidak terlihat";

  if(data.alt > 3 && data.elo > 6.4){
    status = "🌙 Mudah terlihat";
  } else if(data.alt > 2){
    status = "⚠️ Sulit terlihat";
  }

  document.getElementById("status").innerText = status;
}

// ================= SENSOR =================
function initSensor(){

  function handler(e){
    updateAR(e.alpha||0, e.beta||0, e.gamma||0);
  }

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    document.body.addEventListener('click', () => {
      DeviceOrientationEvent.requestPermission()
        .then(res=>{
          if(res === 'granted'){
            window.addEventListener("deviceorientation", handler);
          }
        });
    }, {once:true});
  } else {
    window.addEventListener("deviceorientation", handler);
  }
}

// ================= AR =================
function updateAR(alpha, beta, gamma){

  const marker = document.getElementById("marker");
  if(!marker) return;

  const heading = (360 - alpha + headingOffset) % 360;

  let deltaAz = hilalData.azi - heading;

  if(deltaAz > 180) deltaAz -= 360;
  if(deltaAz < -180) deltaAz += 360;

  const targetX = window.innerWidth/2 + deltaAz*2;
  const targetY = window.innerHeight/2 - hilalData.alt*3;

  smoothX += (targetX - smoothX)*0.08;
  smoothY += (targetY - smoothY)*0.08;

  marker.style.left = smoothX + "px";
  marker.style.top  = smoothY + "px";
}

// ================= CAMERA =================
function startCam(){
  navigator.mediaDevices.getUserMedia({
    video:{ facingMode:"environment" }
  })
  .then(stream=>{
    document.getElementById("cam").srcObject = stream;
  })
  .catch(err=>{
    console.warn("kamera gagal:", err);
  });
}
