const scannerElement = document.querySelector("#qr-reader");
const startScannerButton = document.querySelector("#start-scanner");
const stopScannerButton = document.querySelector("#stop-scanner");
const scanResult = document.querySelector("#scan-result");
const scanState = scanResult.querySelector(".scan-result-state");
const scanLabel = scanResult.querySelector(".scan-result-label");

let scanner;
let scannerRunning = false;
let scanInProgress = false;
let lastScannedToken = null;

function showScanResult(type, state, label) {
  scanResult.className = `scan-result is-${type}`;
  scanState.textContent = state;
  scanLabel.textContent = label;
}

function getToken(decodedText) {
  try {
    const url = new URL(decodedText, window.location.origin);
    const match = url.pathname.match(/^\/redeem\/([A-Za-z0-9_-]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return null;
}

function updateCodeRow(token, label) {
  const row = [...document.querySelectorAll("tr[data-code-token]")]
    .find((item) => item.dataset.codeToken === token);
  if (!row) return;
  const statusCell = row.querySelector("td:nth-child(3)");
  statusCell.innerHTML = '<span class="status status-used"><span></span>Itilize</span>';
  row.querySelector(".person-cell").textContent = label;
}

function updateCounts() {
  const availableCount = document.querySelector("#available-count");
  const usedCount = document.querySelector("#used-count");
  availableCount.textContent = Math.max(0, Number(availableCount.textContent) - 1);
  usedCount.textContent = Number(usedCount.textContent) + 1;
}

async function handleScan(decodedText) {
  const token = getToken(decodedText);
  const scanIdentity = token || decodedText;
  if (scanInProgress || scanIdentity === lastScannedToken) return;
  scanInProgress = true;
  lastScannedToken = scanIdentity;
  await scanner.pause(true);
  if (!token) {
    showScanResult("invalid", "INVALID", "QR sa a pa soti nan sistèm sa a.");
    window.setTimeout(async () => {
      if (scannerRunning) {
        scanInProgress = false;
        await scanner.resume();
      }
    }, 1800);
    return;
  }
  showScanResult("pending", "Ap verifye kòd la...", "Yon ti moman.");

  try {
    const response = await fetch(`/api/redeem/${encodeURIComponent(token)}`, { method: "POST", headers: { "bypass-tunnel-reminder": "1" } });
    const result = await response.json();
    if (response.ok && result.status === "accepted") {
      showScanResult("valid", "VALID", result.label);
      updateCodeRow(token, result.label);
      updateCounts();
    } else if (result.status === "used") {
      showScanResult("invalid", "INVALID", "Kòd sa a deja itilize.");
    } else {
      showScanResult("invalid", "INVALID", "Kòd sa a pa valab.");
    }
  } catch {
    showScanResult("error", "Pa gen koneksyon", "Eseye eskane kòd la ankò.");
  }

  window.setTimeout(async () => {
    if (scannerRunning) {
      scanInProgress = false;
      await scanner.resume();
    }
  }, 1800);
}

async function startScanner() {
  if (!window.Html5Qrcode) {
    showScanResult("error", "Eskanè a pa disponib", "Verifye koneksyon entènèt la epi rechaje paj la.");
    return;
  }
  try {
    scanner = new Html5Qrcode("qr-reader");
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
      handleScan,
      () => {
        if (!scanInProgress) lastScannedToken = null;
      },
    );
    scannerRunning = true;
    startScannerButton.hidden = true;
    stopScannerButton.hidden = false;
    showScanResult("ready", "Pare pou eskane", "Mete QR la devan kamera a.");
  } catch {
    scannerRunning = false;
    showScanResult("error", "Kamera a pa ouvri", "Pèmèt aksè kamera a nan navigatè a, oswa itilize yon adrès HTTPS.");
  }
}

async function stopScanner() {
  if (!scannerRunning) return;
  scannerRunning = false;
  scanInProgress = false;
  await scanner.stop();
  scanner.clear();
  startScannerButton.hidden = false;
  stopScannerButton.hidden = true;
  showScanResult("ready", "Pare pou eskane", "Louvri kamera a pou eskane yon lòt kòd.");
}

startScannerButton.addEventListener("click", startScanner);
stopScannerButton.addEventListener("click", stopScanner);