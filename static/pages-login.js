const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginButton = loginForm.querySelector("button[type='submit']");

fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
  .then((response) => {
    if (response.ok) window.location.replace("/");
  })
  .catch(() => {});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginError.hidden = true;
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginForm.elements.password.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Koneksyon an pa t mache.");
    window.location.replace("/");
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
    loginButton.disabled = false;
  }
});