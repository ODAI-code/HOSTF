// HOSTFind administrator login.

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const submitButton = loginForm?.querySelector('button[type="submit"]');

  if (!loginForm || !message || !submitButton) {
    console.error("HOSTFind admin login elements were not found.");
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    message.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          username: document.getElementById("username").value,
          password: document.getElementById("password").value
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        window.location.assign("/admin");
        return;
      }

      message.textContent = result.error || "Login failed.";
    } catch (error) {
      console.error("HOSTFind login request failed:", error);
      message.textContent =
        "Unable to connect to the server. Please try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Sign in";
    }
  });
});