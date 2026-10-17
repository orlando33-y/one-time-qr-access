const createForm = document.querySelector("#create-form");
const formMessage = document.querySelector("#form-message");
const toast = document.querySelector("#toast");
const codeRows = document.querySelector("#code-rows");
const codesTable = document.querySelector("#codes-table");
const emptyState = document.querySelector("#empty-state");
let csrfToken = "";

function makeCell(className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  return cell;
}

function renderCode(code) {
  const row = document.createElement("tr");
  row.dataset.codeToken = code.token;

  const qrCell = makeCell();
  const qrLink = document.createElement("a");
  qrLink.className = "qr-download";
  qrLink.href = `/qr/${encodeURIComponent(code.token)}.svg`;
  qrLink.download = `qr-${code.label.replace(/\s+/g, "-")}.svg`;
  qrLink.title = `Telechaje QR pou ${code.label}`;
  const image = document.createElement("img");
  image.src = qrLink.href;
  image.alt = `QR pou ${code.label}`;
  image.width = 72;
  image.height = 72;
  image.loading = "lazy";
  const downloadLabel = document.createElement("span");
  downloadLabel.textContent = "Telechaje";
  qrLink.append(image, downloadLabel);
  qrCell.append(qrLink);

  const personCell = makeCell("person-cell");
  personCell.textContent = code.label;

  const statusCell = makeCell();
  const status = document.createElement("span");
  status.className = `status ${code.used_at ? "status-used" : "status-ready"}`;
  const dot = document.createElement("span");
  const statusText = document.createElement("span");
  statusText.textContent = code.used_at ? "Itilize" : "Disponib";
  status.append(dot, statusText);
  statusCell.append(status);

  const dateCell = makeCell("date-cell");
  dateCell.textContent = code.created_at.slice(0, 10);

  const linkCell = makeCell();
  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.type = "button";
  copyButton.dataset.copy = code.url;
  copyButton.setAttribute("aria-label", `Kopye lyen pou ${code.label}`);
  copyButton.title = "Kopye lyen";
  copyButton.append(document.createTextNode("Kopye "));
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  copyButton.append(arrow);
  linkCell.append(copyButton);

  row.append(qrCell, personCell, statusCell, dateCell, linkCell);
  return row;
}

function updateCounts(codes) {
  document.querySelector("#total-count").textContent = codes.length;
  document.querySelector("#available-count").textContent = codes.filter((code) => !code.used_at).length;
  document.querySelector("#used-count").textContent = codes.filter((code) => code.used_at).length;
}

async function loadCodes() {
  const response = await fetch("/api/codes", {
    credentials: "same-origin",
    headers: { "X-CSRF-Token": csrfToken },
    cache: "no-store",
  });
  if (response.status === 401) {
    window.location.replace("/login");
    return;
  }
  if (!response.ok) throw new Error("Lis kòd yo pa t kapab chaje.");
  const { codes } = await response.json();
  codeRows.replaceChildren(...codes.map(renderCode));
  updateCounts(codes);
  codesTable.hidden = codes.length === 0;
  emptyState.hidden = codes.length !== 0;
}

async function startDashboard() {
  const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    window.location.replace("/login");
    return;
  }
  csrfToken = (await response.json()).csrfToken;
  await loadCodes();
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const labels = document.querySelector("#labels").value.split(/\r?\n/).map((label) => label.trim()).filter(Boolean);
  if (!labels.length) return;
  const button = createForm.querySelector("button[type='submit']");
  button.disabled = true;
  formMessage.textContent = "Ap kreye kòd yo...";
  formMessage.className = "form-message";
  try {
    const response = await fetch("/api/codes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ labels }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Kòd yo pa t kapab kreye.");
    formMessage.textContent = "Kòd yo kreye.";
    document.querySelector("#labels").value = "";
    await loadCodes();
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.classList.add("is-error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#logout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await fetch("/api/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-CSRF-Token": csrfToken },
  });
  window.location.replace("/login");
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    toast.textContent = "Lyen an kopye.";
  } catch {
    toast.textContent = "Navigatè a pa kite kopye lyen an.";
  }
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
});

document.querySelector("#print-button").addEventListener("click", () => window.print());

startDashboard().catch((error) => {
  formMessage.textContent = error.message;
  formMessage.classList.add("is-error");
});