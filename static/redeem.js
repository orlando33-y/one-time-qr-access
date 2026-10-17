const page = document.querySelector(".redeem-shell");
const result = document.querySelector("#result");
const token = page.dataset.token;

fetch(`/api/redeem/${encodeURIComponent(token)}`, { method: "POST", headers: { "bypass-tunnel-reminder": "1" } })
  .then(async (response) => {
    const data = await response.json();
    if (response.ok) {
      result.className = "result-panel result-accepted";
      result.innerHTML = '<span class="result-symbol" aria-hidden="true">&#10003;</span><p class="eyebrow">KÒD LA VALIDE</p><h1>Ou antre.</h1><p class="result-copy">Kòd sa a valide. Li pap mache ankò.</p><p class="person-label"></p>';
      result.querySelector(".person-label").textContent = data.label;
      return;
    }
    const used = data.status === "used";
    result.className = `result-panel result-${used ? "used" : "invalid"}`;
    result.innerHTML = used
      ? '<span class="result-symbol" aria-hidden="true">&times;</span><p class="eyebrow">KÒD LA FÈMEN</p><h1>Deja itilize.</h1><p class="result-copy">Yon lòt moun deja sèvi ak kòd sa a.</p>'
      : '<span class="result-symbol" aria-hidden="true">!</span><p class="eyebrow">KÒD PA VALAB</p><h1>Nou pa jwenn li.</h1><p class="result-copy">Kòd sa a pa egziste oswa li pa valab.</p>';
  })
  .catch(() => {
    result.className = "result-panel result-invalid";
    result.innerHTML = '<span class="result-symbol" aria-hidden="true">!</span><p class="eyebrow">PWOBLÈM KONEKSYON</p><h1>Eseye ankò.</h1><p class="result-copy">Nou pa t kapab verifye kòd la. Louvri lyen an ankò lè koneksyon an retounen.</p>';
  });