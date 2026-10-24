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
    const avatarSection=document.createElement('section');
    avatarSection.style.cssText='text-align:left;margin:22px 0;padding:18px;border:1px solid #77558b;border-radius:15px;background:#21142d;';
    const title=document.createElement('h3');title.textContent='📸 Minha foto de perfil';avatarSection.append(title);
    const current=document.createElement('img');current.alt='Sua foto de perfil';current.style.cssText='width:100px;height:100px;border-radius:50%;object-fit:cover;object-position:center;border:3px solid #e9c77e;display:block;margin:12px 0';
    const refresh=()=>{current.src=reader.photo_url?'/api/reader/photo?t='+Date.now():'/AVATAR-'+(reader.avatar||'nyx').toUpperCase()+'.webp'};refresh();avatarSection.append(current);
    const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:15px 0';
    for(const name of ['lucien','nyx','elara','coby']){const b=document.createElement('button');b.type='button';b.style.cssText='background:#30203f;border:1px solid #9e7ab6;color:#fff;border-radius:12px;padding:8px;cursor:pointer;';const img=document.createElement('img');img.src='/AVATAR-'+name.toUpperCase()+'.webp';img.alt=name;img.style.cssText='width:100%;aspect-ratio:1;object-fit:cover;object-position:center;border-radius:50%;display:block';const caption=document.createElement('span');caption.textContent=name[0].toUpperCase()+name.slice(1);b.append(img,caption);b.addEventListener('click',async()=>{b.disabled=true;try{const d=await api('profile',{avatar:name});reader.avatar=d.profile.avatar;reader.photo_url=null;refresh();photoStatus.textContent='✨ Avatar atualizado.'}catch(e){photoStatus.textContent='⚠️ '+e.message}finally{b.disabled=false}});grid.append(b)}avatarSection.append(grid);
    const uploadLabel=document.createElement('label');uploadLabel.textContent='Ou selecione sua própria foto (JPG, PNG ou WebP, até 3 MB):';uploadLabel.style.display='block';
    const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.style.cssText='display:block;width:100%;margin:10px 0';uploadLabel.append(file);avatarSection.append(uploadLabel);
    const upload=document.createElement('button');upload.type='button';upload.className='profile-submit';upload.textContent='📷 Usar minha foto';
    const remove=document.createElement('button');remove.type='button';remove.className='profile-submit';remove.textContent='Remover foto personalizada';
    const photoStatus=document.createElement('p');photoStatus.setAttribute('role','status');photoStatus.style.color='#f3d8a6';
    upload.addEventListener('click',async()=>{const f=file.files[0];if(!f){photoStatus.textContent='Escolha uma foto primeiro.';return}if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>3*1024*1024){photoStatus.textContent='Use JPG, PNG ou WebP com até 3 MB.';return}upload.disabled=true;try{const r=await fetch('/api/reader/photo',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':f.type},body:f});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Falha ao enviar.');reader.photo_url=d.photo_url;refresh();file.value='';photoStatus.textContent='✨ Sua foto foi salva!'}catch(e){photoStatus.textContent='⚠️ '+e.message}finally{upload.disabled=false}});
    remove.addEventListener('click',async()=>{remove.disabled=true;try{const r=await fetch('/api/reader/photo',{method:'DELETE',credentials:'same-origin'});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Falha ao remover.');reader.photo_url=null;refresh();photoStatus.textContent='Foto removida.'}catch(e){photoStatus.textContent='⚠️ '+e.message}finally{remove.disabled=false}});
    avatarSection.append(upload,remove,photoStatus);
    const links=document.createElement('p');links.style.cssText='display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';for(const [name,url] of [['💜 Favoritos','/favoritos.html'],['📚 Minhas Listas','/minhas-listas.html']]){const a=document.createElement('a');a.href=url;a.textContent=name;links.append(a)}
    card.append(heading, description, email, avatarSection, links, home, logout);
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
    if (password.length < 8) {
  registerMessage.textContent = "⚠️ A senha precisa ter pelo menos 8 caracteres.";
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
