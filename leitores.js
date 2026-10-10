/* ARCANA SCAN — Autenticação real dos leitores (separada da Forja) */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const loginForm = $("loginForm");
  const registerForm = $("registerForm");
  const gateway = document.querySelector(".reader-gateway");
  if (!loginForm || !registerForm || !gateway) return;

  const loginButton = loginForm.querySelector('button.profile-submit');
  const registerButton = registerForm.querySelector('button.profile-submit');
  loginButton.type = "submit";
  registerButton.type = "submit";

  function notice(form) {
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    message.style.cssText = "margin:14px 0;color:#e4d0fa;font-size:14px;line-height:1.5;";
    form.append(message);
    return message;
  }
  const loginMessage = notice(loginForm);
  const registerMessage = notice(registerForm);

  async function api(action, payload) {
    const options = {
      method: payload ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: payload ? { "Content-Type": "application/json" } : {}
    };
    if (payload) options.body = JSON.stringify(payload);
    const response = await fetch("/api/reader/" + action, options);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Não foi possível concluir a operação.");
    }
    return data;
  }

  function showProfile(reader) {
    gateway.querySelectorAll(".login-panel,.register-panel").forEach(el => {
      el.hidden = true;
      el.style.display = "none";
    });
    const existing = $("readerLoggedCard");
    if (existing) existing.remove();
    const card = document.createElement("article");
    card.id = "readerLoggedCard";
    card.className = "reader-panel";
    card.style.cssText = "grid-column:1/-1;max-width:650px;width:100%;margin:0 auto;text-align:center;";

    const heading = document.createElement("h2");
    heading.textContent = "✨ Bem-vindo(a) à ARCANA, " + reader.username + "!";
    const description = document.createElement("p");
    description.className = "panel-description";
    description.textContent = "Sua conta de leitor está conectada. " +
      "O acervo está esperando por você.";
    const email = document.createElement("p");
    email.style.cssText = "color:#cbb4df;overflow-wrap:anywhere;margin:18px 0;";
    email.textContent = reader.email;
    const home = document.createElement("a");
    home.href = "/index.html";
    home.textContent = "📚 Ir para a biblioteca";
    home.className = "profile-submit";
    home.style.cssText = "display:block;text-align:center;text-decoration:none;padding:15px;margin:15px 0;";
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "profile-submit";
    logout.textContent = "Sair da conta";
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try {
        await api("logout", {});
        location.reload();
      } catch (error) {
        alert(error.message);
        logout.disabled = false;
      }
    });
    card.append(heading, description, email, home, logout);
    gateway.prepend(card);
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginMessage.textContent = "";
    loginButton.disabled = true;
    loginButton.textContent = "Entrando...";
    try {
      const data = await api("login", {
        identity: $("loginIdentity").value.trim(),
        password: $("loginPassword").value
      });
      $("loginPassword").value = "";
      showProfile(data.reader);
    } catch (error) {
      loginMessage.textContent = "⚠️ " + error.message;
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Entrar na ARCANA";
    }
  });

  registerForm.addEventListener("submit", async event => {
    event.preventDefault();
    registerMessage.textContent = "";
    const password = $("registerPassword").value;
    if (password !== $("registerPasswordConfirm").value) {
      registerMessage.textContent = "⚠️ As senhas não coincidem.";
      return;
    }
    if (password.length < 12) {
      registerMessage.textContent = "⚠️ A senha precisa ter pelo menos 12 caracteres.";
      return;
    }
    registerButton.disabled = true;
    registerButton.textContent = "Criando conta...";
    try {
      await api("register", {
        username: $("registerUsername").value.trim(),
        email: $("registerEmail").value.trim(),
        password,
        acceptTerms: $("acceptTerms").checked
      });
      registerForm.reset();
      registerMessage.textContent = "✨ Conta criada! Agora entre usando o formulário à esquerda.";
      loginMessage.textContent = "Sua conta está pronta para o primeiro acesso.";
      $("registerPassword").value = "";
      $("registerPasswordConfirm").value = "";
    } catch (error) {
      registerMessage.textContent = "⚠️ " + error.message;
    } finally {
      registerButton.disabled = false;
      registerButton.textContent = "Criar minha conta";
    }
  });

  const forgot = document.querySelector(".forgot-password");
  if (forgot) {
    forgot.addEventListener("click", event => {
      event.preventDefault();
      loginMessage.textContent = "A recuperação de senha por e-mail ainda não está disponível. Entre em contato com a equipe da ARCANA.";
    });
  }

  api("me").then(data => showProfile(data.reader)).catch(() => {});
})();
