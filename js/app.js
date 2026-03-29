// ================= FINAL ULTRA COMPLETE - HILAL CHECKER =================
console.log("FINAL ULTRA COMPLETE - HILAL CHECKER");

// ================= GLOBAL =================
const nowGlobal = new Date();
let hijriMonthIndex = 0;
let tanggalHijriGlobal = 0;
let hilalData = { alt: 0, azi: 0 };
let smoothX = 0;
let smoothY = 0;
let audioCtx = null;
let locked = false;
let beepCooldown = false;
let headingOffset = 0;
let calibrating = false;
let currentLat = 0;
let currentLon = 0;
let lastPathUpdate = 0;
let declinationGlobal = 0;
let ijtimaCache = null;
const saved = localStorage.getItem("ijtima");
if(saved){
  ijtimaCache = new Date(saved);
}

// ====== IJTIMA INTERVAL GLOBAL ======
let ijtimaInterval = null;

// ================= INIT =================
window.onload = () => {
  startClock();
  getLocation();      // akan update hilal & hijri
  initSensor();

  // Tombol Kalibrasi Kompas
  const calibBtn = document.getElementById("calibrateBtn");
  if(calibBtn){
    calibBtn.addEventListener("click", ()=>{
      calibrateCompass();
    });
  }

  // Notifikasi & audio aktif otomatis saat klik pertama
  document.body.addEventListener("click", () => {
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      console.log("Audio aktif");
    }

    if(Notification.permission === "default"){
      Notification.requestPermission().then(p=>{
        if(p==="granted"){
          showNotif("Hilal Checker", "Notifikasi aktif 🌙");
        }
      });
    }
  }, { once:true });
};

// ================= GET LOCATION =================
function getLocation(){
  navigator.geolocation.getCurrentPosition(async p=>{
    const lat = p.coords.latitude;
    const lon = p.coords.longitude;

    currentLat = lat;
    currentLon = lon;

    document.getElementById('loc').innerText =
      `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
      .then(r=>r.json())
      .then(d=>{
        const a = d.address || {};
        const lokasi = [
          a.village || a.town || a.city || "",
          a.county || "",
          a.state || "",
          a.country || ""
        ].filter(v=>v).join(", ");
        document.getElementById('lokasi').innerText = lokasi;
      })
      .catch(()=> document.getElementById('lokasi').innerText = "Lokasi tidak tersedia");

    // ====== UPDATE HIJRI & HILAL ======
    updateHijriRealTime(lat, lon);
    hitungHilal(lat, lon);
    startCam();
    autoReloadAtMaghrib(lat, lon);

    // ====== INTERVAL HILAL & HIJRI ======
    setInterval(()=> hitungHilal(currentLat, currentLon), 10000);
    setInterval(()=> updateHijriRealTime(currentLat, currentLon), 60000);

    // ====== IJTIMA ======
    updateIjtimaRealtime(lat, lon);

    // ====== DECLINATION (NON-BLOCKING) ======
    getMagneticDeclination(lat, lon);
  }, ()=>{
    // fallback lokasi default
    const lat = -8.5833;
    const lon = 116.1167;
    currentLat = lat;
    currentLon = lon;

    document.getElementById('loc').innerText = `${lat}, ${lon}`;
    document.getElementById('lokasi').innerText = "Lokasi default";

    updateHijriRealTime(lat, lon);
    hitungHilal(lat, lon);
    startCam();
    autoReloadAtMaghrib(lat, lon);

    updateIjtimaRealtime(lat, lon);
    declinationGlobal = 0;
  },{
    enableHighAccuracy:true,
    timeout:15000,
    maximumAge:0
  });
}

// ================= UPDATE IJTIMA REALTIME =================
function updateIjtimaRealtime(lat, lon){
  const el = document.getElementById("ijtima");
  if(!el) return;

  if(ijtimaInterval) clearInterval(ijtimaInterval);

  // 🔥 hitung SEKALI (biar tidak berat)
  if(lat == null || lon == null){
    console.warn("Koordinat belum tersedia");
    return;
  }
  
  const t = getIjtimaFix(lat, lon);
  const next = getIjtimaBerikutnya(lat, lon);

  ijtimaInterval = setInterval(()=>{
    const now = new Date();

    // 🔹 sejak ijtima
    const totalDetik = Math.floor((now - t) / 1000);
    
    const jam = Math.floor(totalDetik / 3600);
    const menit = Math.floor((totalDetik % 3600) / 60);
    const detik = totalDetik % 60;
    
    // 🔹 menuju ijtima berikutnya
    const totalDetikNext = Math.floor((next - now) / 1000);
    
    const jamNext = Math.floor(totalDetikNext / 3600);
    const menitNext = Math.floor((totalDetikNext % 3600) / 60);
    const detikNext = totalDetikNext % 60;

    // 🔹 format tanggal
    const tanggal = t.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 🔥 tampilkan ke UI
    el.innerText =
      `🌑 Ijtima: ${tanggal}\n` +
      `⏱ Sejak Ijtima: ${jam}j ${menit}m ${detik}d\n` +
      `⏳ Menuju Ijtima: ${jamNext}j ${menitNext}m ${detikNext}d`;
  }, 1000);
}

// ==== CARI PERKIRAAN IJTIMA ===
function cariPerkiraanIjtima(lat, lon, now){
  let minDiff = 999;
  let bestTime = null;

  for(let i = -48; i <= 48; i++){ // ±2 hari tiap 1 jam
    let t = new Date(now.getTime() + i * 3600 * 1000);
    let diff = Math.abs(selisihRA(lat, lon, t));

    if(diff < minDiff){
      minDiff = diff;
      bestTime = t;
    }
  }

  return bestTime;
}

// ==== DAPATKAN IJTIMA FIX ====
function getIjtimaFix(lat, lon){
  if(ijtimaCache) return ijtimaCache;

  let t = cariIjtimaPresisi(lat, lon, nowGlobal);

  if(t > nowGlobal){
    t = new Date(t.getTime() - 29.530588 * 24 * 3600 * 1000);
  }

  ijtimaCache = t;
  localStorage.setItem("ijtima", t.toISOString());
  return t;
}

// ==== CARI IJTIMA PRESISI ====
function cariIjtimaPresisi(lat, lon, now){

  // ================= STEP 1: CARI PERKIRAAN DULU =================
  let minDiff = 999;
  let center = null;

  for(let i = -48; i <= 48; i++){ // ±2 hari (step 1 jam)
    let t = new Date(now.getTime() + i * 3600 * 1000);
    let diff = Math.abs(selisihRA(lat, lon, t));

    if(diff < minDiff){
      minDiff = diff;
      center = t;
    }
  }

  // 🔥 JAGA-JAGA kalau center null
  if(!center){
    console.warn("Center tidak ditemukan");
    return now;
  }

  // ================= STEP 2: BIKIN RANGE SEMPIT =================
  let t1 = new Date(center.getTime() - 6 * 3600 * 1000);
  let t2 = new Date(center.getTime() + 6 * 3600 * 1000);

  let f1 = selisihRA(lat, lon, t1);
  let f2 = selisihRA(lat, lon, t2);

  // 🔥 VALIDASI ROOT
  if(isNaN(f1) || isNaN(f2)){
    console.warn("Nilai RA invalid");
    return center;
  }

  if(f1 * f2 > 0){
    console.warn("Root tidak ketemu, pakai pendekatan kasar");
    return center; // fallback aman
  }

  // ================= STEP 3: BISECTION =================
  for(let i = 0; i < 30; i++){
    let tMid = new Date((t1.getTime() + t2.getTime()) / 2);
    let fMid = selisihRA(lat, lon, tMid);

    if(isNaN(fMid)){
      console.warn("fMid NaN, skip");
      return center;
    }

    if(f1 * fMid < 0){
      t2 = tMid;
      f2 = fMid;
    } else {
      t1 = tMid;
      f1 = fMid;
    }
  }

  // ================= HASIL FINAL =================
  return new Date((t1.getTime() + t2.getTime()) / 2);
}

// =============== CARI IJTIMA TERDEKAT ===============
function cariIjtimaTerdekat(lat, lon){
  const now = new Date();

  let minElo = 999;
  let waktuIjtima = null;

  for(let i = -7200; i <= 7200; i++){
    let t = new Date(now.getTime() + i * 60000);
    let data = hitungHilalCore(lat, lon, t);

    if(data.elo < minElo){
      minElo = data.elo;
      waktuIjtima = t;
    }
  }

  return waktuIjtima;
}

// =============== IJTIMA TERAKHIR ===========
function getIjtimaTerakhir(lat, lon){
  const now = nowGlobal;

  let t = cariIjtimaPresisi(lat, lon);

  if(t > now){
    t = new Date(t.getTime() - 29.530588 * 24 * 3600 * 1000);
  }

  return t;
}

// =============== IJTIMA BERIKUTNYA ===========
function getIjtimaBerikutnya(lat, lon){
  const last = getIjtimaTerakhir(lat, lon);
  return new Date(last.getTime() + 29.530588 * 24 * 3600 * 1000);
}

// ======= SELISIH RA =======
function selisihRA(lat, lon, time){
  const data = hitungHilalCore(lat, lon, time);

  if(data.sunRA === undefined || data.moonRA === undefined){
    console.error("RA TIDAK ADA!", data);
    return NaN;
  }

  let diff = data.sunRA - data.moonRA;

  if(diff > 180) diff -= 360;
  if(diff < -180) diff += 360;

  return diff;
}

// ================= JAM =================
function startClock(){
  setInterval(()=>{
    const now = new Date();
    const hari = now.toLocaleDateString('id-ID',{weekday:'long'});
    const tanggal = now.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
    const jam = now.toLocaleTimeString('id-ID').replace(/\./g,":");
    document.getElementById('waktu').innerText = `${hari}, ${tanggal} - ${jam}`;
  },1000);
}

// ================= SENSOR =================
function initSensor(){
  let lastAlpha=0, lastBeta=0, lastGamma=0;

  window.addEventListener("deviceorientationabsolute", e=>{
    let alpha = e.alpha || 0;
    let beta  = e.beta  || 0;
    let gamma = e.gamma || 0;

    // 🔹 FILTER biar halus
    alpha = lastAlpha + (alpha - lastAlpha) * 0.05;
    beta  = lastBeta  + (beta  - lastBeta)  * 0.05;
    gamma = lastGamma + (gamma - lastGamma) * 0.05;

    lastAlpha = alpha;
      window.lastAlpha = alpha;
    lastBeta  = beta;
    lastGamma = gamma;

    updateAR(alpha, beta, gamma);
  });
}

// ============== DEKLINASI ==============
async function getMagneticDeclination(lat, lon){
    try {
        const now = new Date();
        const response = await fetch(
            `https://www.ngdc.noaa.gov/geomag-web/calculators/calcDeclination?lat1=${lat}&lon1=${lon}&resultFormat=json&model=WMM`
        );
        const data = await response.json();
        declinationGlobal = data.result[0].declination;
        console.log("Declination global:", declinationGlobal.toFixed(2), "°");
        return declinationGlobal;
    } catch(e){
        declinationGlobal = 0;
        console.warn("Declination API gagal, pakai 0°");
        return 0;
    }
}

// ============== KONSTANTA ==============
const rad = Math.PI/180;
const deg = 180/Math.PI;

// ============== HIJRI REALTIME =============
function updateHijriRealTime(lat, lon){
    const now = new Date();

    // ================== WAKTU ==================
    const jam = now.getHours() + now.getMinutes()/60;

    // ================== MAGHRIB ==================
    const maghribData = hitungMaghrib(lat, lon);
    const maghrib = maghribData ? maghribData.decimal : 18;

    // ================== BUFFER (ANTI FLIP) ==================
    const bufferMenit = 10; // 10 menit setelah maghrib
    const bufferJam = bufferMenit / 60;

    // ================== KEY HARIAN ==================
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const key = "hijriFix_" + today.toDateString();

    // ================== HAPUS CACHE LAMA ==================
    Object.keys(localStorage).forEach(k=>{
        if(k.startsWith("hijriFix_") && k !== key){
            localStorage.removeItem(k);
        }
    });

    let tambahHari = 0;

    // ================== LOGIKA FINAL ==================
    const saved = localStorage.getItem(key);
    
    // 🔒 PRIORITAS UTAMA: kalau sudah ada cache → pakai terus
    if(saved !== null){
        tambahHari = parseInt(saved);
        console.log("🔒 LOCK AKTIF (pakai cache):", tambahHari);
    
    } else {
        
        // ⏳ BELUM ADA KEPUTUSAN → tunggu maghrib + buffer
        if(jam >= (maghrib + bufferJam)){

            console.log("⏳ Buffer selesai → hitung SEKALI pakai waktu maghrib");
            
            // 🔥 PENTING: pakai waktu MAGHRIB (bukan now)
            const maghribTime = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                Math.floor(maghrib),
                Math.floor((maghrib % 1) * 60),
                0, 0
            );
            
            const hilal = hitungHilal(lat, lon, maghribTime);
            
            const bisaRukyat = (
                hilal.alt >= 3 &&
                hilal.elo >= 6.4 &&
                hilal.age >= 8
            );
            
            tambahHari = bisaRukyat ? 1 : 0;
            
            // 🔒 SIMPAN (LOCK SEHARI PENUH)
            localStorage.setItem(key, tambahHari);
            
            console.log("💾 Simpan keputusan FINAL:", tambahHari);
        
        } else {
            
            // ⏳ sebelum maghrib + buffer → tetap hari lama
            tambahHari = 0;
            console.log("⏳ Menunggu maghrib + buffer...");
        }
    }

    // ================== JULIAN DAY ==================
    const localMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,0,0,0
    );

    const utcMidnight = localMidnight.getTime() - (localMidnight.getTimezoneOffset()*60000);

    let jd = Math.floor((utcMidnight/86400000)+2440587.5) + tambahHari;

    // ================== KONVERSI HIJRI ==================
    let l = jd - 1948440 + 10632;
    let n = Math.floor((l-1)/10631);
    l = l - 10631*n + 354;
    let j = (Math.floor((10985-l)/5316))*(Math.floor((50*l)/17719))
          +(Math.floor(l/5670))*(Math.floor((43*l)/15238));
    l = l - (Math.floor((30-j)/15))*(Math.floor((17719*j)/50))
          - (Math.floor(j/16))*(Math.floor((15238*j)/43)) + 29;

    const m = Math.floor((24*l)/709);
    const d = l - Math.floor((709*m)/24);
    const y = 30*n + j - 30;

    hijriMonthIndex = m - 1;
    tanggalHijriGlobal = d;

    const bulan = [
        "Muharram","Safar","Rabiul Awal","Rabiul Akhir",
        "Jumadil Awal","Jumadil Akhir","Rajab","Syaban",
        "Ramadhan","Syawal","Zulkaidah","Zulhijjah"
    ];

    document.getElementById('hijri').innerText =
        `${d} ${bulan[hijriMonthIndex]} ${y} H`;
}

// ================= REFRACTION & PARALLAX =================
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
  const correction = Math.asin(Math.sin(pi*rad) * Math.cos(altRad));
  return alt - (correction * deg);
}

// ================= DELTA TIME =================
function getDeltaT(){
  const year = new Date().getFullYear();
  const t = (year - 2000) / 100;
  return 64.7 + 64.5*t + 0.21*t*t; // aproksimasi Meeus modern
}

// ================= HILAL =================
function hitungHilal(lat, lon, customTime=null){
  const statusEl = document.getElementById('status');
  const prediksiEl = document.getElementById('prediksi');

  // 🔹 Status sementara saat menghitung
  statusEl.innerText = "⏳ Menghitung hilal...";
  prediksiEl.innerText = "";

  const data = hitungHilalCore(lat, lon, customTime);

  const { alt, azi, elo, age, illumination } = data;
  hilalData.alt = alt;
  hilalData.azi = azi;

  document.getElementById('alt').innerText = alt.toFixed(2);
  document.getElementById('azi').innerText = azi.toFixed(2);
  document.getElementById('elo').innerText = elo.toFixed(2);
  document.getElementById('age').innerText = age.toFixed(1);
  document.getElementById('illum').innerText = illumination.toFixed(2) + " %";

  if(alt < 0){
    statusEl.innerText = "🌑 Bulan di bawah horizon";
    prediksiEl.innerText = "Tidak mungkin rukyat";
  } else {
    const imkan = (alt>=3 && elo>=6.4 && age>=8);
    const q = alt - (0.1018*Math.sqrt(elo));
    const vis = q>0.216 ? "Mudah terlihat"
              : q>-0.014 ? "Terlihat dengan alat"
              : "Tidak terlihat";

    if(tanggalHijriGlobal >= 29){
      statusEl.innerText = imkan ? "✅ Imkan Rukyat" : "❌ Istikmal";
      prediksiEl.innerText = vis;
    } else {
      statusEl.innerText = "ℹ️ Belum akhir bulan";
      prediksiEl.innerText = vis;
    }
  }

  return data;
}

// ================= JALUR BULAN =================
function generateHilalPath(lat, lon){
  let path = [];

  for(let i=0;i<=60;i++){ // 60 menit ke depan
    let future = new Date(Date.now() + i*60000);
    let data = hitungHilalFuture(lat, lon, future);
    path.push(data);
  }

  return path;
}

// ================= HITUNG HILAL MENDATANG =================
function hitungHilalFuture(lat, lon, time){
  return hitungHilalCore(lat, lon, time);
}

// ================= HITUNG HILAL CORE =================
function hitungHilalCore(lat, lon, customTime=null){
  const rad = Math.PI/180;
  const deg = 180/Math.PI;

  const now = customTime ? new Date(customTime) : new Date();

  // ================= TIME =================
  const JD_UTC = (now.getTime()/86400000)+2440587.5;
  const deltaT = getDeltaT()/86400;
  const JD = JD_UTC + deltaT;
  const T = (JD - 2451545)/36525;

  // ================= OBLIQUITY + NUTATION =================
  const U = T/100;
  let epsilon0 = 23 + 26/60 + 21.448/3600
    - (46.8150*T + 0.00059*T*T - 0.001813*T*T*T)/3600;

  const L = (280.4665 + 36000.7698*T) % 360;
  const Lm = (218.3165 + 481267.8813*T) % 360;
  const omega = (125.04452 - 1934.136261*T) % 360;

  const deltaPsi = (-17.20*Math.sin(omega*rad) - 1.32*Math.sin(2*L*rad)
                   -0.23*Math.sin(2*Lm*rad) + 0.21*Math.sin(2*omega*rad))/3600;

  const deltaEps = (9.20*Math.cos(omega*rad) + 0.57*Math.cos(2*L*rad)
                   +0.10*Math.cos(2*Lm*rad) -0.09*Math.cos(2*omega*rad))/3600;

  const epsilon = epsilon0 + deltaEps;

  // ================= MATAHARI =================
  const M = (357.52911 + 35999.05029*T) % 360;
  const C = (1.914602 - 0.004817*T - 0.000014*T*T)*Math.sin(M*rad)
          + (0.019993 - 0.000101*T)*Math.sin(2*M*rad)
          + 0.000289*Math.sin(3*M*rad);

  const sunLong = L + C + deltaPsi;
  let sunRA = Math.atan2(
    Math.cos(epsilon*rad)*Math.sin(sunLong*rad), 
    Math.cos(sunLong*rad)
  )*deg;
  
  if(sunRA < 0) sunRA += 360;
  const sunDec = Math.asin(Math.sin(epsilon*rad)*Math.sin(sunLong*rad))*deg;

  // ================= BULAN =================
  const D = (297.8501921 + 445267.1114034*T) % 360;
  const Mm = (134.9633964 + 477198.8675055*T) % 360;
  const Ms = M;
  const F  = (93.2720950 + 483202.0175233*T) % 360;

  let lonMoon =
    Lm
    + 6.289*Math.sin(Mm*rad)
    + 1.274*Math.sin((2*D - Mm)*rad)
    + 0.658*Math.sin(2*D*rad)
    + 0.214*Math.sin(2*Mm*rad)
    - 0.186*Math.sin(Ms*rad)
    - 0.059*Math.sin((2*D - 2*Mm)*rad)
    - 0.057*Math.sin((2*D - Ms - Mm)*rad)
    + 0.053*Math.sin((2*D + Mm)*rad)
    + 0.046*Math.sin((2*D - Ms)*rad);

  let latMoon =
    5.128*Math.sin(F*rad)
    + 0.280*Math.sin((Mm + F)*rad)
    + 0.277*Math.sin((Mm - F)*rad)
    + 0.173*Math.sin((2*D - F)*rad);

  lonMoon += deltaPsi;

  // ================= RA DEC BULAN =================
  let moonRA = Math.atan2(
    Math.sin(lonMoon*rad)*Math.cos(epsilon*rad) - Math.tan(latMoon*rad)*Math.sin(epsilon*rad),
    Math.cos(lonMoon*rad)
  )*deg;
  
  if(moonRA < 0) moonRA += 360;

  const moonDec = Math.asin(
    Math.sin(latMoon*rad)*Math.cos(epsilon*rad)
    + Math.cos(latMoon*rad)*Math.sin(epsilon*rad)*Math.sin(lonMoon*rad)
  )*deg;

  // ================= SIDEREAL =================
  const GMST = (280.46061837 + 360.98564736629*(JD-2451545)) % 360;
  const LST = GMST + lon;
  const HA = (LST - moonRA);

  // ================= TOPOCENTRIC ALT AZ =================
  let alt = Math.asin(
    Math.sin(lat*rad)*Math.sin(moonDec*rad)
    + Math.cos(lat*rad)*Math.cos(moonDec*rad)*Math.cos(HA*rad)
  )*deg;

  let azi = Math.atan2(
    -Math.sin(HA*rad),
    Math.tan(moonDec*rad)*Math.cos(lat*rad) - Math.sin(lat*rad)*Math.cos(HA*rad)
  )*deg;

  if(azi < 0) azi += 360;

  // ================= KOREKSI =================
  alt = koreksiParallax(alt);
  alt = koreksiRefraction(alt);

  // ================= ELO & AGE =================
  const elo = Math.acos(
    Math.sin(sunDec*rad)*Math.sin(moonDec*rad)
    + Math.cos(sunDec*rad)*Math.cos(moonDec*rad)*Math.cos((sunRA - moonRA)*rad)
  )*deg;

  const age = elo/12.19*24; // usia bulan dalam jam

  // ================= ILUMINASI =================
  const illumination = (1 - Math.cos(elo * rad)) / 2 * 100;

  // ================= OUTPUT BERSIH =================
  return { 
    alt, 
    azi, 
    elo, 
    age, 
    illumination, 
    sunRA, 
    moonRA
  };
}

// ================= HITUNG MATAHARI =================
function hitungMatahari(lat, lon){
  const now = new Date();

  const JD = (now/86400000)+2440587.5;
  const T = (JD-2451545)/36525;

  const L0 = (280.46646 + 36000.76983*T)%360;
  const M = 357.52911 + 35999.05029*T;

  const C = (1.914602 - 0.004817*T)*Math.sin(M*rad)
          + (0.019993 - 0.000101*T)*Math.sin(2*M*rad)
          + 0.000289*Math.sin(3*M*rad);

  const lambda = L0 + C;

  const epsilon = 23.439291 - 0.0130042*T;

  const RA = Math.atan2(
    Math.cos(epsilon*rad)*Math.sin(lambda*rad),
    Math.cos(lambda*rad)
  )*deg;

  const Dec = Math.asin(
    Math.sin(epsilon*rad)*Math.sin(lambda*rad)
  )*deg;

  const GMST = (280.46061837 + 360.98564736629*(JD-2451545)) % 360;
  const LST = GMST + lon;
  const HA = (LST - RA);

  let alt = Math.asin(
    Math.sin(lat*rad)*Math.sin(Dec*rad) +
    Math.cos(lat*rad)*Math.cos(Dec*rad)*Math.cos(HA*rad)
  )*deg;

  let azi = Math.atan2(
    -Math.sin(HA*rad),
    Math.tan(Dec*rad)*Math.cos(lat*rad) -
    Math.sin(lat*rad)*Math.cos(HA*rad)
  )*deg;

  if(azi < 0) azi += 360;

  return { alt, azi };
}

// ================= KALIBRASI MATAHARI =================
function calibrateWithSun(){
  if(!currentLat || !currentLon){
    alert("Lokasi belum tersedia");
    return;
  }

  alert("Arahkan kamera tepat ke Matahari ☀️ lalu tekan OK");

  setTimeout(()=>{
    const sun = hitungMatahari(currentLat, currentLon);

    // Ambil arah HP sekarang
    let heading;

    if(window.lastAlpha !== undefined){
      heading = lastAlpha;
    } else {
      alert("Sensor belum siap");
      return;
    }

    // Hitung offset
    headingOffset = (sun.azi - heading + 360) % 360;

    alert("Kalibrasi Matahari berhasil ✅\nOffset: " + headingOffset.toFixed(2) + "°");

  }, 1000);
}

// ================= MAGHRIB =================
function hitungMaghrib(lat, lon){
  const now = new Date();
  const JD = (now/86400000)+2440587.5;
  const T = (JD-2451545)/36525;
  const epsilon = 23.439291 - 0.0130042*T - 1.64e-7*T*T + 5.04e-7*T*T*T;
  const L0 = (280.46646 + 36000.76983*T)%360;
  const M = 357.52911 + 35999.05029*T;
  const C = (1.914602 - 0.004817*T)*Math.sin(M*rad)
          + (0.019993 - 0.000101*T)*Math.sin(2*M*rad)
          + 0.000289*Math.sin(3*M*rad);
  const lambda = L0 + C;
  const delta = Math.asin(Math.sin(epsilon*rad)*Math.sin(lambda*rad));
  const y = Math.tan((epsilon/2)*rad)**2;
  const EoT = 4 * deg * (
    y*Math.sin(2*L0*rad)
    - 2*0.0167*Math.sin(M*rad)
    + 4*0.0167*y*Math.sin(M*rad)*Math.cos(2*L0*rad)
    - 0.5*y*y*Math.sin(4*L0*rad)
    - 1.25*0.0167*0.0167*Math.sin(2*M*rad)
  );
  const h0 = -0.833 * rad;
  const cosH = (Math.sin(h0) - Math.sin(lat*rad)*Math.sin(delta)) / (Math.cos(lat*rad)*Math.cos(delta));
  if(cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH)*deg;
  const timezone = -now.getTimezoneOffset()/60;
  const solarNoon = 12 + timezone - (lon/15) - (EoT/60);
  const maghrib = solarNoon + (H/15);
  return { decimal: maghrib };
}

// ================= AUTO RELOAD MAGHRIB =================
function autoReloadAtMaghrib(lat, lon){
  const now = new Date();
  const todayKey = 'hilalReloadDate';
  const lastReload = localStorage.getItem(todayKey);
  if(lastReload === now.toDateString()) return;

  const maghribData = hitungMaghrib(lat, lon);
  if(!maghribData) return;

  const maghribDecimal = maghribData.decimal;
  const maghribHour = Math.floor(maghribDecimal);
  const maghribMinute = Math.floor((maghribDecimal - maghribHour)*60);

  const maghribTime = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
    maghribHour, maghribMinute, 0, 0
  );

  let diff = maghribTime - now;
  if(diff < 0) diff = 0;

  setTimeout(()=>{
    localStorage.setItem(todayKey, now.toDateString());
    
    console.log("🌙 Maghrib tercapai, update Hijri");
    
    updateHijriRealTime(lat, lon); // 🔥 update tanpa reload
  
  }, diff);
}

// ================= AR =================
function updateAR(alpha, beta, gamma){
    const marker = document.getElementById('marker');
    const wrapper = document.querySelector('.camera-wrapper');
    const azEl = document.getElementById('arAzimuth');
    const altEl = document.getElementById('arAltitude');
    if(!marker || !wrapper) return;

    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;

    if(smoothX === 0 && smoothY === 0){
        smoothX = width/2;
        smoothY = height/2;
    }

    // ================= HEADING (FIX) =================
    let heading;
    if(alpha !== null){
        heading = alpha;
    } else {
        heading = 360 - alpha;
    }

    heading = (heading + headingOffset + declinationGlobal) % 360;

    const pitch = beta || 0;
    const roll  = gamma || 0;

    // ================= AZIMUTH (FIX BESAR) =================
    let deltaAz = ((hilalData.azi - heading + 540) % 360) - 180;

    // ================= ALTITUDE (FIX) =================
    let deviceAlt = pitch * Math.cos(roll * Math.PI/180);
    let deltaAlt = hilalData.alt - deviceAlt;

    // 🔹 koreksi horizon kamera
    deltaAlt -= 1.5;

    // ================= BATAS =================
    deltaAz  = Math.max(-60, Math.min(60, deltaAz));
    deltaAlt = Math.max(-45, Math.min(45, deltaAlt));

    // ================= PROYEKSI REALISTIS =================
    const fov = 60;

    let targetX = width/2 + (deltaAz / fov) * width + roll*0.3;
    let targetY = height/2 - (deltaAlt / fov) * height - pitch*0.2;

    targetX = Math.max(30, Math.min(width-30, targetX));
    targetY = Math.max(40, Math.min(height-40, targetY));

    // ================= SMOOTHING (TETAP DIPAKAI) =================
    smoothX += (targetX - smoothX) * 0.12;
    smoothY += (targetY - smoothY) * 0.1;

    marker.style.left = smoothX + "px";
    marker.style.top  = smoothY + "px";

    // ================= ERROR & FEEDBACK =================
    const error = Math.sqrt(deltaAz*deltaAz + deltaAlt*deltaAlt);

    if(error < 5){
        marker.style.color = "lime";
        if(!beepCooldown){
            playBeep(1200, 200);
            navigator.vibrate && navigator.vibrate(150);
            beepCooldown = true;
            setTimeout(()=> beepCooldown = false, 1000);
        }
    } else if(error < 15){
        marker.style.color = "yellow";
    } else {
        marker.style.color = "red";
    }

    // ================= INFO UI =================
    if(azEl) azEl.innerText = `Azimuth: ${hilalData.azi.toFixed(2)}°`;
    if(altEl) altEl.innerText = `Tinggi: ${hilalData.alt.toFixed(2)}°`;

    // ================= PATH HILAL (FIX JUGA) =================
    if(Date.now() - lastPathUpdate > 2000){
        lastPathUpdate = Date.now();
        const path = generateHilalPath(currentLat, currentLon);

        path.forEach(p=>{
            const dot = document.createElement("div");
            dot.className = "hilal-path-dot";

            let dx = ((p.azi - heading + 540) % 360) - 180;
            let dy = p.alt - deviceAlt;

            const fov = 60;

            dot.style.left = (width/2 + (dx/fov)*width) + "px";
            dot.style.top  = (height/2 - (dy/fov)*height) + "px";

            wrapper.appendChild(dot);
            setTimeout(()=>dot.remove(),1500);
        });
    }
}

// ================= KALIBRASI KOMPAS =================
function calibrateCompass(){
  calibrating = true;
  let samples = [];

  const handler = (e)=>{
    samples.push(e.alpha);

    if(samples.length > 20){
      let avg = samples.reduce((a,b)=>a+b)/samples.length;
      headingOffset = (360 - avg) % 360;
      calibrating = false;
      window.removeEventListener("deviceorientation", handler);

      alert("Gerakkan perangkat anda dengan membentuk pola angka 8 di udara ✅");
    }
  };

  window.addEventListener("deviceorientation", handler);
}

// ================= AUDIO =================
function playBeep(freq=800, duration=100){
  if(!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  osc.start();
  osc.stop(audioCtx.currentTime + duration/1000);
}

// ================= CAMERA =================
function startCam(){
  const video = document.getElementById('cam');
  const status = document.getElementById('arStatus');

  if(!video) return;

  // tampilkan status loading
  if(status){
    status.innerText = "Mengaktifkan kamera...";
  }

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false
  })
  .then(stream => {
    video.srcObject = stream;

    video.onloadedmetadata = () => {
      video.play();

      // 🔥 update status saat kamera siap
      if(status){
        status.innerText = "📷 Kamera aktif";
      }
    };
  })
  .catch(err => {
    console.error(err);

    if(status){
      status.innerText = "❌ Kamera gagal";
    }

    alert("Izin kamera diperlukan");
  });
}

// ================= NOTIF =================
function showNotif(judul,pesan){
  if(Notification.permission==="granted"){
    new Notification(judul,{body:pesan,icon:"assets/icon-192.png"});
  }
}
