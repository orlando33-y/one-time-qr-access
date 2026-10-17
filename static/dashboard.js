const createForm = document.querySelector("#create-form");
const formMessage = document.querySelector("#form-message");
const toast = document.querySelector("#toast");
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const labels = document.querySelector("#labels").value.split(/\r?\n/).map((label) => label.trim()).filter(Boolean);
  if (!labels.length) return;
  const button = createForm.querySelector("button[type='submit']");
  button.disabled = true;
  formMessage.textContent = "Ap kreye kòd yo...";
  formMessage.className = "form-message";
  try {
    const response = await fetch("/api/codes", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "bypass-tunnel-reminder": "1" }, body: JSON.stringify({ labels }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Kòd yo pa t kapab kreye.");
    window.location.reload();
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.classList.add("is-error");
    button.disabled = false;
  }
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast.textContent = "Lyen an kopye.";
      toast.classList.add("is-visible");
      window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
    } catch {
      toast.textContent = "Navigatè a pa kite kopye lyen an.";
      toast.classList.add("is-visible");
      window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
    }
  });
});

document.querySelector("#print-button").addEventListener("click", () => window.print());