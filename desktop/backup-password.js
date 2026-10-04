document.getElementById("form").addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.getElementById("password").value;
  if (password !== document.getElementById("confirm").value) {
    document.getElementById("error").textContent = "The passwords do not match.";
    return;
  }
  await window.backup.submit(password);
});
