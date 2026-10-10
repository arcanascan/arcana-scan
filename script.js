
"use strict";

/* ============================================================
   ARCANA SCAN — SCRIPT.JS COMPLETO
   Home, menus, carrosséis, atualizações e tema claro/escuro.
   ============================================================ */

/* MENU LATERAL */
const menuButton = document.getElementById("menuButton");
const menuClose = document.getElementById("menuClose");
const sideMenu = document.getElementById("sideMenu");
const menuOverlay = document.getElementById("menuOverlay");

function openMenu() {
    if (!menuButton || !sideMenu || !menuOverlay) return;

    sideMenu.classList.add("open");
    menuOverlay.classList.add("visible");

    sideMenu.setAttribute("aria-hidden", "false");
    menuButton.setAttribute("aria-expanded", "true");

    document.body.style.overflow = "hidden";
}

function closeMenu() {
    if (!menuButton || !sideMenu || !menuOverlay) return;

    sideMenu.classList.remove("open");
    menuOverlay.classList.remove("visible");

    sideMenu.setAttribute("aria-hidden", "true");
    menuButton.setAttribute("aria-expanded", "false");

    document.body.style.overflow = "";
}

if (menuButton) {
    menuButton.addEventListener("click", openMenu);
}

if (menuClose) {
    menuClose.addEventListener("click", closeMenu);
}

if (menuOverlay) {
    menuOverlay.addEventListener("click", closeMenu);
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeMenu();
    }
});

if (sideMenu) {
    sideMenu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", closeMenu);
    });
}


/* ============================================================
   DADOS DE DEMONSTRAÇÃO DA HOME

   Futuramente serão carregados do banco de dados da ARCANA.
   ============================================================ */

/* GRANDE ACERVO — NYX À ESQUERDA */

const archiveWorks = [];


/* OBRAS MAIS LIDAS — COBY À DIREITA */

const popularWorks = [];


/* RELÍQUIAS EM DESTAQUE — LUCIEN À ESQUERDA */

const relicWorks = [];


/* CONTINUAR MERGULHANDO */

const continueWorks = [];


/* HOSPEDAGENS — OBRAS DE OUTRAS SCANS */

const hostingWorks = [];


/* ATUALIZAÇÕES — DATAS NÃO APARECEM NA TELA */

const updates = [];


/* FORJA — OBRAS ATUALIZADAS HOJE */

const forgeWorks = updates
    .filter(item => item.daysAgo === 0)
    .map(item => [item.title, item.hue]);


/* ============================================================
   CARD PADRÃO DAS OBRAS
   ============================================================ */

function workCard(title, hue) {
    return `
        <article class="work-card">
            <div class="cover-art" style="--h:${hue};">
                <span>${title}</span>
            </div>

            <h3>${title}</h3>
        </article>
    `;
}


/* ============================================================
   CARROSSEIS INFINITOS

   As posições de Nyx, Elara, Lucien e Coby ficam no CSS.
   ============================================================ */

function buildInfiniteCarousel(elementId, works, options = {}) {
    const track = document.getElementById(elementId);

    if (!track || !works || works.length === 0) {
        return;
    }

    const direction = options.direction || "right";
    const duration = options.duration || 45;

    const cards = works
        .map(work => workCard(work[0], work[1]))
        .join("");

    track.innerHTML = `
        <div class="carousel-set">
            ${cards}
        </div>

        <div class="carousel-set" aria-hidden="true">
            ${cards}
        </div>
    `;

    const animationName = direction === "left"
        ? "arcanaCarouselLeft"
        : "arcanaCarouselRight";

    track.style.animation =
        `${animationName} ${duration}s linear infinite`;

    track.addEventListener("mouseenter", () => {
        track.style.animationPlayState = "paused";
    });

    track.addEventListener("mouseleave", () => {
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            track.style.animationPlayState = "running";
        }
    });

    track.addEventListener("focusin", () => {
        track.style.animationPlayState = "paused";
    });

    track.addEventListener("focusout", () => {
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            track.style.animationPlayState = "running";
        }
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        track.style.animation = "none";
    }
}


/* GRANDE ACERVO — NYX */

buildInfiniteCarousel("archiveTrack", archiveWorks, {
    direction: "right",
    duration: 48
});


/* FORJA — ELARA */

buildInfiniteCarousel("forgeTrack", forgeWorks, {
    direction: "right",
    duration: 44
});


/* OBRAS MAIS LIDAS — COBY */

buildInfiniteCarousel("popularTrack", popularWorks, {
    direction: "right",
    duration: 52
});


/* RELÍQUIAS — LUCIEN */

buildInfiniteCarousel("relicsTrack", relicWorks, {
    direction: "right",
    duration: 48
});


/* ANIMAÇÕES DOS CARROSSEIS */

const carouselStyle = document.createElement("style");

carouselStyle.textContent = `
    @keyframes arcanaCarouselRight {
        from { transform: translateX(-50%); }
        to   { transform: translateX(0); }
    }

    @keyframes arcanaCarouselLeft {
        from { transform: translateX(0); }
        to   { transform: translateX(-50%); }
    }

    @media (prefers-reduced-motion: reduce) {
        .carousel-track {
            animation: none !important;
        }
    }
`;

document.head.appendChild(carouselStyle);


/* ============================================================
   CONTINUAR MERGULHANDO
   ============================================================ */

const continueTrack = document.getElementById("continueTrack");

if (continueTrack) {
    continueTrack.innerHTML = continueWorks.map(work => `
        <article class="continue-card">

            <div
                class="continue-cover"
                style="--h:${work[3]};"
            ></div>

            <h3>${work[0]}</h3>

            <p>${work[1]}</p>

            <div
                class="progress"
                aria-label="${work[2]}% do capítulo lido"
            >
                <span style="width:${work[2]}%;"></span>
            </div>

        </article>
    `).join("");
}


/* ============================================================
   HOSPEDAGENS
   ============================================================ */

const hostingTrack = document.getElementById("hostingTrack");

if (hostingTrack) {
    hostingTrack.innerHTML = hostingWorks.map(work => `
        <article class="hosting-card">

            <div
                class="hosting-cover"
                style="--h:${work[2]};"
            ></div>

            <small>${work[1]}</small>

            <h3>${work[0]}</h3>

        </article>
    `).join("");
}


/* ============================================================
   ATUALIZAÇÕES RECENTES

   Mais recentes primeiro.
   Nunca exibir datas ou dias.
   ============================================================ */

const PAGE_SIZE = 12;

let currentPage = 1;


function getOrderedUpdates() {
    return [...updates].sort((a, b) => {
        if (a.daysAgo !== b.daysAgo) {
            return a.daysAgo - b.daysAgo;
        }

        return a.order - b.order;
    });
}


function updateCard(item) {
    return `
        <article class="update-card">

            <div
                class="update-cover"
                style="--h:${item.hue};"
            ></div>

            <h4>${item.title}</h4>

            <span>${item.chapter}</span>

        </article>
    `;
}


function renderUpdates(page = 1) {
    const container = document.getElementById("updatesContainer");

    if (!container) {
        return;
    }

    const orderedUpdates = getOrderedUpdates();

    const start = (page - 1) * PAGE_SIZE;

    const pageItems = orderedUpdates.slice(
        start,
        start + PAGE_SIZE
    );

    container.innerHTML = `
        <div class="updates-grid">
            ${pageItems.map(updateCard).join("")}
        </div>
    `;

    renderPagination(orderedUpdates.length);
}


/* PAGINAÇÃO */

function renderPagination(totalItems) {
    const pagination = document.getElementById("updatesPagination");

    if (!pagination) {
        return;
    }

    const totalPages = Math.ceil(totalItems / PAGE_SIZE);

    if (totalPages <= 1) {
        pagination.innerHTML = "";
        return;
    }

    let html = "";

    for (let i = 1; i <= totalPages; i++) {
        const activeClass = i === currentPage
            ? "active"
            : "";

        const currentAttribute = i === currentPage
            ? 'aria-current="page"'
            : "";

        html += `
            <button
                type="button"
                class="${activeClass}"
                data-page="${i}"
                aria-label="Ir para a página ${i} das Atualizações Recentes"
                ${currentAttribute}
            >
                ${i}
            </button>
        `;
    }

    pagination.innerHTML = html;

    pagination.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            currentPage = Number(button.dataset.page);

            renderUpdates(currentPage);

            const updatesSection =
                document.getElementById("atualizacoes");

            if (updatesSection) {
                const reducedMotion = window.matchMedia(
                    "(prefers-reduced-motion: reduce)"
                ).matches;

                updatesSection.scrollIntoView({
                    behavior: reducedMotion ? "auto" : "smooth",
                    block: "start"
                });
            }
        });
    });
}


/* PRIMEIRA RENDERIZAÇÃO */

renderUpdates();


/* ============================================================
   TEMA CLARO / ESCURO — NOVO

   - Escuro é o padrão da ARCANA.
   - Salva a escolha do leitor neste navegador.
   - Alterna o ícone entre lua e sol.
   - O CSS definirá as cores do modo claro.
   ============================================================ */

const themeButton = document.getElementById("themeButton");

const THEME_STORAGE_KEY = "arcana-theme";


/* LÊ A PREFERÊNCIA SALVA */

function readSavedTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY) === "light"
            ? "light"
            : "dark";
    } catch (error) {
        return "dark";
    }
}


/* SALVA A PREFERÊNCIA */

function saveTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
        // O botão continua funcionando se o navegador
        // bloquear o armazenamento.
    }
}


/* APLICA O TEMA E ATUALIZA O BOTÃO */

function applyTheme(theme) {
    const isLight = theme === "light";

    document.documentElement.setAttribute(
        "data-theme",
        isLight ? "light" : "dark"
    );

    // Compatibilidade com o CSS existente
    // e com os novos estilos do modo claro.

    document.body.classList.toggle(
        "soft-light-mode",
        isLight
    );

    document.body.classList.toggle(
        "light-mode",
        isLight
    );

    if (themeButton) {
        const icon = themeButton.querySelector("i");

        if (icon) {
            icon.className = isLight
                ? "fa-solid fa-sun"
                : "fa-regular fa-moon";
        }

        const label = isLight
            ? "Ativar modo escuro"
            : "Ativar modo claro";

        themeButton.setAttribute(
            "aria-label",
            label
        );

        themeButton.setAttribute(
            "title",
            label
        );

        themeButton.setAttribute(
            "aria-pressed",
            String(isLight)
        );
    }
}


/* RESTAURA A PREFERÊNCIA AO ABRIR A HOME */

applyTheme(readSavedTheme());


/* CLIQUE NO BOTÃO */

if (themeButton) {
    themeButton.addEventListener("click", () => {
        const currentTheme =
            document.documentElement.getAttribute("data-theme");

        const nextTheme = currentTheme === "light"
            ? "dark"
            : "light";

        applyTheme(nextTheme);

        saveTheme(nextTheme);
    });
}


/* SINCRONIZA O TEMA ENTRE ABAS DO NAVEGADOR */

window.addEventListener("storage", event => {
    if (event.key === THEME_STORAGE_KEY) {
        applyTheme(
            event.newValue === "light" ? "light" : "dark"
        );
    }
});
