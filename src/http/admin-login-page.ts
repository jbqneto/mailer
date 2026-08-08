export function adminLoginPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Email Gateway · Admin login</title>
    <style>
      :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #172033; }
      * { box-sizing: border-box; }
      body { display: grid; min-height: 100vh; margin: 0; place-items: center; background: #eef1f5; }
      main { width: min(390px, calc(100% - 32px)); padding: 28px; border: 1px solid #dce2eb; border-radius: 12px; background: #fff; box-shadow: 0 8px 30px #17203314; }
      h1 { margin: 0 0 8px; font-size: 21px; }
      p { color: #68758a; font-size: 13px; line-height: 1.5; }
      label { display: block; margin: 16px 0 7px; color: #526078; font-size: 12px; font-weight: 700; }
      input { width: 100%; padding: 10px; border: 1px solid #cbd3df; border-radius: 7px; font: inherit; }
      button { width: 100%; margin-top: 20px; padding: 11px; border: 0; border-radius: 7px; background: #356ee8; color: #fff; cursor: pointer; font-weight: 700; }
      #error { min-height: 18px; color: #b42318; }
    </style>
  </head>
  <body>
    <main>
      <h1>Email Gateway</h1>
      <p>Sign in with the administrator credentials configured for this deployment.</p>
      <form id="login">
        <label for="username">Username</label>
        <input id="username" autocomplete="username" required />
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="current-password" required />
        <button type="submit">Sign in</button>
        <p id="error"></p>
      </form>
    </main>
    <script>
      document.getElementById('login').addEventListener('submit', async (event) => {
        event.preventDefault();
        const error = document.getElementById('error');
        error.textContent = '';
        const response = await fetch('/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value
          })
        });
        if (response.ok) {
          window.location.href = '/preview';
          return;
        }
        error.textContent = 'Invalid administrator credentials.';
      });
    </script>
  </body>
</html>`;
}
