// ---- Realtime pose-classifier test client -------------------------------
// Opens the webcam, streams JPEG frames to the backend over WebSocket, and
// draws back whatever the AI "sees" (skeleton + predicted class).

const $ = (id) => document.getElementById(id);
const wsUrlInput = $("wsUrl");
const connectBtn = $("connectBtn");
const camBtn = $("camBtn");
const statusEl = $("status");
const labelEl = $("label");
const confEl = $("conf");
const barsEl = $("bars");
const metaEl = $("meta");
const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

// default WS URL based on how the page is served
const proto = location.protocol === "https:" ? "wss" : "ws";
const host = location.hostname || "localhost";
wsUrlInput.value = `${proto}://${host}:8000/ws`;

let ws = null;
let classes = [];
let edges = [];
let latest = null;        // last result from server
let streaming = false;    // camera on + ws open
let inflight = 0;         // frames sent but not yet answered
const MAX_INFLIGHT = 2;   // pipeline depth: overlap network RTT with server compute
                          // (1 = strict ping-pong; higher = more fps, a touch more lag)
const SEND_W = 360;       // width of frames sent to server

// hidden canvas used to grab + compress frames
const grab = document.createElement("canvas");
const gctx = grab.getContext("2d");

// ---- WebSocket ----------------------------------------------------------
connectBtn.onclick = () => (ws ? disconnect() : connect());

function connect() {
  ws = new WebSocket(wsUrlInput.value.trim());
  ws.binaryType = "arraybuffer";
  setStatus("connecting…", false);

  ws.onopen = () => {
    setStatus("connected", true);
    connectBtn.textContent = "Disconnect";
    camBtn.disabled = false;
    maybeStartStreaming();
  };
  ws.onclose = () => { setStatus("disconnected", false); cleanupWs(); };
  ws.onerror = () => setStatus("error (see console)", false);
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
}

function disconnect() { if (ws) ws.close(); }

function cleanupWs() {
  ws = null;
  streaming = false;
  inflight = 0;
  connectBtn.textContent = "Connect";
  camBtn.disabled = true;
}

function onMessage(msg) {
  if (msg.type === "init") {
    classes = msg.classes;
    edges = msg.edges;
    buildBars();
    return;
  }
  // result
  latest = msg;
  updatePanel(msg);
  inflight = Math.max(0, inflight - 1);
  pump();   // keep the pipeline full (uses the spare server CPU during network RTT)
}

// ---- Camera -------------------------------------------------------------
camBtn.onclick = async () => {
  if (video.srcObject) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" }, audio: false,
    });
    video.srcObject = stream;
    await video.play();
    camBtn.textContent = "Camera on";
    camBtn.disabled = true;
    requestAnimationFrame(render);
    maybeStartStreaming();
  } catch (e) {
    alert("เปิดกล้องไม่ได้: " + e.message);
  }
};

function maybeStartStreaming() {
  if (ws && ws.readyState === WebSocket.OPEN && video.srcObject && !streaming) {
    streaming = true;
    pump();   // kick off the pipelined loop
  }
}

// Keep up to MAX_INFLIGHT frames in flight so the server never idles waiting for
// the next frame to arrive over the network.
function pump() {
  while (streaming && ws && ws.readyState === WebSocket.OPEN
         && video.videoWidth && inflight < MAX_INFLIGHT) {
    inflight++;
    sendFrame();
  }
}

function sendFrame() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !video.videoWidth) {
    inflight = Math.max(0, inflight - 1);
    return;
  }
  const w = SEND_W;
  const h = Math.round(w * video.videoHeight / video.videoWidth);
  grab.width = w; grab.height = h;
  gctx.drawImage(video, 0, 0, w, h);
  grab.toBlob((blob) => {
    if (blob && ws && ws.readyState === WebSocket.OPEN)
      blob.arrayBuffer().then((b) => ws.send(b));
    else
      inflight = Math.max(0, inflight - 1);   // send failed -> free the slot
  }, "image/jpeg", 0.6);
}

// ---- Drawing ------------------------------------------------------------
function render() {
  if (video.videoWidth) {
    // fit canvas to the video aspect ratio
    const aspect = video.videoHeight / video.videoWidth;
    canvas.height = Math.round(canvas.width * aspect);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (latest && latest.detected && latest.landmarks) drawSkeleton(latest.landmarks);
    if (latest) drawLabel(latest);
  }
  if (video.srcObject) requestAnimationFrame(render);
}

function drawSkeleton(lms) {
  const W = canvas.width, H = canvas.height;
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 3;
  for (const [a, b] of edges) {
    if (lms[a][2] < 0.5 || lms[b][2] < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(lms[a][0] * W, lms[a][1] * H);
    ctx.lineTo(lms[b][0] * W, lms[b][1] * H);
    ctx.stroke();
  }
  ctx.fillStyle = "#ff3d7f";
  for (const l of lms) {
    if (l[2] < 0.5) continue;
    ctx.beginPath();
    ctx.arc(l[0] * W, l[1] * H, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLabel(msg) {
  const txt = msg.detected ? `${msg.label}  ${(msg.confidence * 100).toFixed(0)}%`
                           : "no pose";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, 34);
  ctx.fillStyle = msg.detected ? "#9f9" : "#f99";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText(txt, 10, 24);
}

// ---- Panel (label + probability bars) -----------------------------------
function buildBars() {
  barsEl.innerHTML = "";
  for (const c of classes) {
    const row = document.createElement("div");
    row.className = "bar";
    row.id = "bar-" + c;
    row.innerHTML =
      `<span class="name">${c}</span>` +
      `<span class="track"><span class="fill"></span></span>` +
      `<span class="pct">0%</span>`;
    barsEl.appendChild(row);
  }
}

function updatePanel(msg) {
  if (msg.detected) {
    labelEl.textContent = msg.label;
    confEl.textContent = (msg.confidence * 100).toFixed(1) + "%";
  } else {
    labelEl.textContent = "no pose";
    confEl.textContent = "";
  }
  metaEl.textContent = `infer ${msg.infer_ms} ms`;

  if (!msg.probs) return;
  for (const c of classes) {
    const row = $("bar-" + c);
    if (!row) continue;
    const p = msg.probs[c] || 0;
    row.querySelector(".fill").style.width = (p * 100).toFixed(1) + "%";
    row.querySelector(".pct").textContent = (p * 100).toFixed(0) + "%";
    row.classList.toggle("top", msg.detected && c === msg.label);
  }
}

function setStatus(text, on) {
  statusEl.textContent = text;
  statusEl.className = "status " + (on ? "on" : "off");
}
