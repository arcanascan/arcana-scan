"use strict";


/* ============================================================
   ARCANA SCAN
   SCRIPT.JS — HOME

   REGRAS:

   NYX
   NYX │ CAPA → CAPA → CAPA

   ELARA
   CAPA → CAPA → CAPA │ ELARA

   LUCIEN
   LUCIEN │ CAPA → CAPA → CAPA

   COBY — MAIS LIDAS
   CAPA → CAPA → CAPA │ COBY

   ATUALIZAÇÕES:
   - mais recentes primeiro
   - sem "Hoje"
   - sem "Ontem"
   - sem "há X dias"
   - sem datas visíveis
   - capa + título + último capítulo
   ============================================================ */



/* ============================================================
   MENU
   ============================================================ */

const menuButton =
    document.getElementById("menuButton");

const menuClose =
    document.getElementById("menuClose");

const sideMenu =
    document.getElementById("sideMenu");

const menuOverlay =
    document.getElementById("menuOverlay");


function openMenu() {

    if (
        !menuButton ||
        !sideMenu ||
        !menuOverlay
    ) {
        return;
    }


    sideMenu.classList.add("open");

    menuOverlay.classList.add("visible");


    sideMenu.setAttribute(
        "aria-hidden",
        "false"
    );


    menuButton.setAttribute(
        "aria-expanded",
        "true"
    );


    document.body.style.overflow =
        "hidden";

}


function closeMenu() {

    if (
        !menuButton ||
        !sideMenu ||
        !menuOverlay
    ) {
        return;
    }


    sideMenu.classList.remove("open");

    menuOverlay.classList.remove("visible");


    sideMenu.setAttribute(
        "aria-hidden",
        "true"
    );


    menuButton.setAttribute(
        "aria-expanded",
        "false"
    );


    document.body.style.overflow =
        "";

}


if (menuButton) {

    menuButton.addEventListener(
        "click",
        openMenu
    );

}


if (menuClose) {

    menuClose.addEventListener(
        "click",
        closeMenu
    );

}


if (menuOverlay) {

    menuOverlay.addEventListener(
        "click",
        closeMenu
    );

}


document.addEventListener(
    "keydown",
    event => {

        if (event.key === "Escape") {

            closeMenu();

        }

    }
);


/* Fecha o menu quando uma opção é escolhida */

if (sideMenu) {

    sideMenu
        .querySelectorAll("a")
        .forEach(link => {

            link.addEventListener(
                "click",
                closeMenu
            );

        });

}



/* ============================================================
   DADOS DE DEMONSTRAÇÃO

   POR ENQUANTO:
   estes dados servem apenas para montar visualmente a HOME.

   FUTURAMENTE:
   eles virão do banco de dados / Painel ARCANA.
   ============================================================ */



/* ============================================================
   GRANDE ACERVO
   ============================================================ */

const archiveWorks = [

    [
        "Grimório de Cinzas",
        286
    ],

    [
        "Ecos do Abismo",
        268
    ],

    [
        "Coroa de Espinhos",
        340
    ],

    [
        "Jardim do Eclipse",
        275
    ],

    [
        "Estrelas Caídas",
        225
    ],

    [
        "Noite Sagrada",
        295
    ],

    [
        "Lua Partida",
        255
    ],

    [
        "Sombras do Rei",
        220
    ],

    [
        "Entre Mundos",
        245
    ],

    [
        "Votos de Sangue",
        335
    ]

];



/* ============================================================
   OBRAS MAIS LIDAS

   TOP 10 MAIS LIDAS DO SITE.
   COBY REPRESENTA OS LEITORES.
   ============================================================ */

const popularWorks = [

    [
        "Sombras do Rei",
        220
    ],

    [
        "Sangue & Ferro",
        28
    ],

    [
        "Feitiço Oculto",
        290
    ],

    [
        "Entre Mundos",
        245
    ],

    [
        "Noite Sagrada",
        295
    ],

    [
        "Lua Partida",
        255
    ],

    [
        "Ecos do Abismo",
        268
    ],

    [
        "Votos de Sangue",
        335
    ],

    [
        "Estrelas Caídas",
        225
    ],

    [
        "Coroa de Espinhos",
        340
    ]

];



/* ============================================================
   RELÍQUIAS EM DESTAQUE

   10 OBRAS MENOS LIDAS DA SEMANA.

   LUCIEN, COMO ARQUIVISTA,
   REAPRESENTA ESSAS OBRAS AO LEITOR.
   ============================================================ */

const relicWorks = [

    [
        "Canção de Vidro",
        272
    ],

    [
        "O Jardim Morto",
        330
    ],

    [
        "Lua Escarlate",
        350
    ],

    [
        "O Último Oráculo",
        280
    ],

    [
        "O Reino Submerso",
        215
    ],

    [
        "Entre Espinhos",
        320
    ],

    [
        "Eco de Prata",
        250
    ],

    [
        "A Última Chama",
        15
    ],

    [
        "Silêncio Carmesim",
        340
    ],

    [
        "Entre Ruínas",
        265
    ]

];



/* ============================================================
   CONTINUAR MERGULHANDO

   DADOS:
   0 = título
   1 = capítulo
   2 = progresso
   3 = cor provisória da capa
   ============================================================ */

const continueWorks = [

    [
        "A Torre da Neblina",
        "Capítulo 34",
        80,
        275
    ],

    [
        "Prisma Negro",
        "Capítulo 18",
        45,
        290
    ],

    [
        "Votos de Sangue",
        "Capítulo 07",
        63,
        335
    ],

    [
        "Lua Partida",
        "Capítulo 16",
        26,
        255
    ]

];



/* ============================================================
   HOSPEDAGENS

   Obras de outras SCANs publicadas dentro da ARCANA.
   ============================================================ */

const hostingWorks = [

    [
        "Fever",
        "Scan Convidada",
        340
    ],

    [
        "Don't Say...",
        "Scan Convidada",
        55
    ],

    [
        "Angel Kiss",
        "Scan Convidada",
        278
    ],

    [
        "Overrun",
        "Scan Convidada",
        22
    ],

    [
        "Jackpot",
        "Scan Convidada",
        220
    ],

    [
        "Shoot My Shot",
        "Scan Convidada",
        345
    ]

];



/* ============================================================
   ATUALIZAÇÕES RECENTES

   daysAgo:
   serve SOMENTE para o sistema saber qual obra
   foi atualizada mais recentemente.

   ESSA INFORMAÇÃO NÃO APARECE NA HOME.

   order:
   organiza obras atualizadas no mesmo período.

   FUTURAMENTE:
   isso será substituído pela data/hora real
   registrada pelo Painel ARCANA.
   ============================================================ */

const updates = [

    {
        daysAgo: 0,
        order: 1,
        title: "Estrelas Caídas",
        chapter: "Capítulo 02",
        hue: 225
    },

    {
        daysAgo: 0,
        order: 2,
        title: "Lâmina Prateada",
        chapter: "Capítulo 14",
        hue: 260
    },

    {
        daysAgo: 0,
        order: 3,
        title: "Jardim do Eclipse",
        chapter: "Capítulo 28",
        hue: 275
    },

    {
        daysAgo: 0,
        order: 4,
        title: "Entre Mundos",
        chapter: "Capítulo 09",
        hue: 245
    },

    {
        daysAgo: 0,
        order: 5,
        title: "Votos de Sangue",
        chapter: "Capítulo 08",
        hue: 335
    },

    {
        daysAgo: 0,
        order: 6,
        title: "Prisma Negro",
        chapter: "Capítulo 19",
        hue: 290
    },

    {
        daysAgo: 1,
        order: 1,
        title: "Grimório de Cinzas",
        chapter: "Capítulo 43",
        hue: 286
    },

    {
        daysAgo: 1,
        order: 2,
        title: "Ecos do Abismo",
        chapter: "Capítulo 13",
        hue: 268
    },

    {
        daysAgo: 1,
        order: 3,
        title: "Coroa de Espinhos",
        chapter: "Capítulo 90",
        hue: 340
    },

    {
        daysAgo: 1,
        order: 4,
        title: "Sombras do Rei",
        chapter: "Capítulo 34",
        hue: 220
    },

    {
        daysAgo: 2,
        order: 1,
        title: "Noite Sagrada",
        chapter: "Capítulo 52",
        hue: 295
    },

    {
        daysAgo: 2,
        order: 2,
        title: "Lua Partida",
        chapter: "Capítulo 17",
        hue: 255
    },

    {
        daysAgo: 3,
        order: 1,
        title: "A Flor de Aço",
        chapter: "Capítulo 21",
        hue: 350
    },

    {
        daysAgo: 3,
        order: 2,
        title: "O Último Acorde",
        chapter: "Capítulo 17",
        hue: 310
    },

    {
        daysAgo: 4,
        order: 1,
        title: "Feitiço Oculto",
        chapter: "Capítulo 37",
        hue: 290
    },

    {
        daysAgo: 5,
        order: 1,
        title: "Entre Espinhos",
        chapter: "Capítulo 11",
        hue: 320
    },

    {
        daysAgo: 6,
        order: 1,
        title: "Eco de Prata",
        chapter: "Capítulo 24",
        hue: 250
    },

    {
        daysAgo: 6,
        order: 2,
        title: "O Jardim Morto",
        chapter: "Capítulo 08",
        hue: 330
    }

];



/* ============================================================
   ACABARAM DE SAIR DA FORJA

   IMPORTANTE:

   Não precisamos cadastrar as obras da Forja
   novamente.

   A Forja pega AUTOMATICAMENTE as obras
   atualizadas hoje dentro de "updates".

   No sistema real isso será automático pelo banco.
   ============================================================ */

const forgeWorks = updates

    .filter(
        item =>
            item.daysAgo === 0
    )

    .map(
        item => [

            item.title,
            item.hue

        ]
    );



/* ============================================================
   CARD PADRÃO DAS OBRAS
   ============================================================ */

function workCard(
    title,
    hue
) {

    return `

        <article class="work-card">

            <div
                class="cover-art"
                style="--h:${hue};"
            >

                <span>
                    ${title}
                </span>

            </div>


            <h3>
                ${title}
            </h3>

        </article>

    `;

}



/* ============================================================
   CARROSSEL INFINITO

   O CSS É RESPONSÁVEL POR LIMITAR A ÁREA VISÍVEL.

   Assim:

   NYX
   não terá capas atrás ou à esquerda dela.

   ELARA
   não terá capas passando para a direita dela.

   LUCIEN
   não terá capas atrás ou à esquerda dele.

   COBY
   ficará no final das Obras Mais Lidas.
   ============================================================ */

function buildInfiniteCarousel(
    elementId,
    works,
    options = {}
) {

    const track =
        document.getElementById(
            elementId
        );


    if (
        !track ||
        !works ||
        works.length === 0
    ) {

        return;

    }


    const direction =
        options.direction || "right";


    const duration =
        options.duration || 45;


    const cards =
        works

            .map(
                work =>
                    workCard(
                        work[0],
                        work[1]
                    )
            )

            .join("");


    /*
       Duplicamos o conjunto para criar
       movimento contínuo sem interrupção.
    */

    track.innerHTML = `

        <div class="carousel-set">

            ${cards}

        </div>


        <div
            class="carousel-set"
            aria-hidden="true"
        >

            ${cards}

        </div>

    `;


    const animationName =

        direction === "left"

            ? "arcanaCarouselLeft"

            : "arcanaCarouselRight";


    track.style.animation = `

        ${animationName}
        ${duration}s
        linear
        infinite

    `;


    /* Pausa quando o mouse está sobre as obras */

    track.addEventListener(
        "mouseenter",
        () => {

            track.style.animationPlayState =
                "paused";

        }
    );


    track.addEventListener(
        "mouseleave",
        () => {

            if (
                !window.matchMedia(
                    "(prefers-reduced-motion: reduce)"
                ).matches
            ) {

                track.style.animationPlayState =
                    "running";

            }

        }
    );


    /* Também pausa ao navegar pelo teclado */

    track.addEventListener(
        "focusin",
        () => {

            track.style.animationPlayState =
                "paused";

        }
    );


    track.addEventListener(
        "focusout",
        () => {

            if (
                !window.matchMedia(
                    "(prefers-reduced-motion: reduce)"
                ).matches
            ) {

                track.style.animationPlayState =
                    "running";

            }

        }
    );


    /* Respeita usuários que preferem menos movimento */

    if (
        window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches
    ) {

        track.style.animation =
            "none";

    }

}



/* ============================================================
   GRANDE ACERVO — NYX

   NYX │ CAPA → CAPA → CAPA

   A posição exata da Nyx e o recorte do carrossel
   são controlados pelo CSS.
   ============================================================ */

buildInfiniteCarousel(

    "archiveTrack",

    archiveWorks,

    {
        direction: "right",
        duration: 48
    }

);



/* ============================================================
   FORJA — ELARA

   CAPA → CAPA → CAPA │ ELARA

   As capas caminham em direção à Elara.
   ============================================================ */

buildInfiniteCarousel(

    "forgeTrack",

    forgeWorks,

    {
        direction: "right",
        duration: 44
    }

);



/* ============================================================
   OBRAS MAIS LIDAS — COBY

   CAPA → CAPA → CAPA │ COBY

   São exatamente as 10 obras mais lidas.
   ============================================================ */

buildInfiniteCarousel(

    "popularTrack",

    popularWorks,

    {
        direction: "right",
        duration: 52
    }

);



/* ============================================================
   RELÍQUIAS — LUCIEN

   LUCIEN │ CAPA → CAPA → CAPA

   São as 10 obras menos lidas da semana.
   ============================================================ */

buildInfiniteCarousel(

    "relicsTrack",

    relicWorks,

    {
        direction: "right",
        duration: 48
    }

);



/* ============================================================
   ANIMAÇÕES DOS CARROSSEIS
   ============================================================ */

const carouselStyle =
    document.createElement(
        "style"
    );


carouselStyle.textContent = `

    @keyframes arcanaCarouselRight {

        from {

            transform:
                translateX(-50%);

        }


        to {

            transform:
                translateX(0);

        }

    }


    @keyframes arcanaCarouselLeft {

        from {

            transform:
                translateX(0);

        }


        to {

            transform:
                translateX(-50%);

        }

    }


    @media (prefers-reduced-motion: reduce) {

        .carousel-track {

            animation:
                none !important;

        }

    }

`;


document.head.appendChild(
    carouselStyle
);



/* ============================================================
   CONTINUAR MERGULHANDO

   COBY FICA NO TÍTULO PELO HTML/CSS.

   Aqui montamos somente as obras
   que o leitor estava lendo.
   ============================================================ */

const continueTrack =
    document.getElementById(
        "continueTrack"
    );


if (continueTrack) {

    continueTrack.innerHTML =

        continueWorks

            .map(
                work => `

                    <article
                        class="continue-card"
                    >

                        <div
                            class="continue-cover"
                            style="
                                --h:${work[3]};
                            "
                        ></div>


                        <h3>

                            ${work[0]}

                        </h3>


                        <p>

                            ${work[1]}

                        </p>


                        <div
                            class="progress"
                            aria-label="
                                ${work[2]}% do capítulo lido
                            "
                        >

                            <span
                                style="
                                    width:${work[2]}%;
                                "
                            ></span>

                        </div>

                    </article>

                `
            )

            .join("");

}



/* ============================================================
   HOSPEDAGENS
   ============================================================ */

const hostingTrack =
    document.getElementById(
        "hostingTrack"
    );


if (hostingTrack) {

    hostingTrack.innerHTML =

        hostingWorks

            .map(
                work => `

                    <article
                        class="hosting-card"
                    >

                        <div
                            class="hosting-cover"
                            style="
                                --h:${work[2]};
                            "
                        ></div>


                        <small>

                            ${work[1]}

                        </small>


                        <h3>

                            ${work[0]}

                        </h3>

                    </article>

                `
            )

            .join("");

}



/* ============================================================
   ATUALIZAÇÕES RECENTES

   REGRA DEFINITIVA DA HOME:

   NÃO MOSTRAR:

   - Hoje
   - Ontem
   - há 2 dias
   - há 3 dias
   - data
   - hora da atualização

   MOSTRAR SOMENTE:

   - capa
   - título
   - último capítulo

   ORDEM:

   atualização mais recente
             ↓
   atualização mais antiga

   A informação temporal existe apenas
   internamente para organizar as obras.
   ============================================================ */

const PAGE_SIZE =
    12;


let currentPage =
    1;



/* ============================================================
   ORGANIZA AS ATUALIZAÇÕES

   Menor daysAgo = mais recente.
   ============================================================ */

function getOrderedUpdates() {

    return [...updates]

        .sort(
            (a, b) => {

                /*
                   Primeiro:
                   organiza pelo tempo de atualização.
                */

                if (
                    a.daysAgo !==
                    b.daysAgo
                ) {

                    return (
                        a.daysAgo -
                        b.daysAgo
                    );

                }


                /*
                   Se duas obras forem do mesmo período,
                   usa a ordem interna.
                */

                return (
                    a.order -
                    b.order
                );

            }
        );

}



/* ============================================================
   CARD DAS ATUALIZAÇÕES

   CAPA + TÍTULO + CAPÍTULO

   NENHUMA DATA.
   ============================================================ */

function updateCard(
    item
) {

    return `

        <article
            class="update-card"
        >

            <div
                class="update-cover"
                style="
                    --h:${item.hue};
                "
            ></div>


            <h4>

                ${item.title}

            </h4>


            <span>

                ${item.chapter}

            </span>

        </article>

    `;

}



/* ============================================================
   RENDERIZA AS ATUALIZAÇÕES

   NÃO EXISTE MAIS AGRUPAMENTO POR DIA.

   É UMA ÚNICA SEQUÊNCIA.
   ============================================================ */

function renderUpdates(
    page = 1
) {

    const container =
        document.getElementById(
            "updatesContainer"
        );


    if (!container) {

        return;

    }


    const orderedUpdates =
        getOrderedUpdates();


    const start =
        (
            page - 1
        )
        *
        PAGE_SIZE;


    const pageItems =
        orderedUpdates.slice(

            start,

            start +
            PAGE_SIZE

        );


    /*
       UMA ÚNICA GRADE.

       Nada de:

       <h3>Hoje</h3>
       <h3>Ontem</h3>
       <h3>2 dias atrás</h3>
    */

    container.innerHTML = `

        <div
            class="updates-grid"
        >

            ${pageItems

                .map(
                    updateCard
                )

                .join("")
            }

        </div>

    `;


    renderPagination(
        orderedUpdates.length
    );

}



/* ============================================================
   PAGINAÇÃO
   ============================================================ */

function renderPagination(
    totalItems
) {

    const pagination =
        document.getElementById(
            "updatesPagination"
        );


    if (!pagination) {

        return;

    }


    const totalPages =
        Math.ceil(

            totalItems
            /
            PAGE_SIZE

        );


    /*
       Se houver apenas uma página,
       não precisamos mostrar paginação.
    */

    if (
        totalPages <= 1
    ) {

        pagination.innerHTML =
            "";

        return;

    }


    let html =
        "";


    for (
        let i = 1;
        i <= totalPages;
        i++
    ) {

        const activeClass =

            i === currentPage

                ? "active"

                : "";


        const currentAttribute =

            i === currentPage

                ? 'aria-current="page"'

                : "";


        html += `

            <button

                type="button"

                class="${activeClass}"

                data-page="${i}"

                aria-label="
                    Ir para a página ${i}
                    das Atualizações Recentes
                "

                ${currentAttribute}

            >

                ${i}

            </button>

        `;

    }


    pagination.innerHTML =
        html;



    /* ========================================================
       CLIQUE NAS PÁGINAS
       ======================================================== */

    pagination

        .querySelectorAll(
            "button"
        )

        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        currentPage =
                            Number(
                                button.dataset.page
                            );


                        renderUpdates(
                            currentPage
                        );


                        const updatesSection =
                            document.getElementById(
                                "atualizacoes"
                            );


                        if (
                            updatesSection
                        ) {

                            const reducedMotion =

                                window.matchMedia(
                                    "(prefers-reduced-motion: reduce)"
                                ).matches;


                            updatesSection
                                .scrollIntoView({

                                    behavior:
                                        reducedMotion
                                            ? "auto"
                                            : "smooth",

                                    block:
                                        "start"

                                });

                        }

                    }
                );

            }
        );

}



/* ============================================================
   PRIMEIRA RENDERIZAÇÃO DAS ATUALIZAÇÕES
   ============================================================ */

renderUpdates();



/* ============================================================
   TEMA
   ============================================================ */

const themeButton =
    document.getElementById(
        "themeButton"
    );


if (themeButton) {

    themeButton.addEventListener(
        "click",
        () => {

            document.body
                .classList
                .toggle(
                    "soft-light-mode"
                );

        }
    );

}