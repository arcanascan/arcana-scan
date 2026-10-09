
const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
};

function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...JSON_HEADERS,
            ...extraHeaders
        }
    });
}

// ==========================================
// ARCANA SCAN — WORKER PRINCIPAL
// ==========================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // ==========================================
        // STATUS DO SERVIDOR
        // ==========================================

        if (url.pathname === "/api/health") {
            return json({
                ok: true,
                service: "ARCANA SCAN",
                status: "online"
            });
        }

        // ==========================================
        // FORJA ARCANA — CADASTRO ENCERRADO
        // ==========================================

        // O cadastro inicial da administradora
        // principal foi concluído.
        //
        // Esta rota não aceita mais requisições
        // de criação de contas, mesmo que alguém
        // tente acessá-la diretamente.

        if (url.pathname === "/api/forja/setup-owner") {
            return json(
                {
                    ok: false,
                    error: "Cadastro inicial encerrado."
                },
                410
            );
        }

        // ==========================================
        // FORJA ARCANA — ÁREA PROTEGIDA
        // ==========================================

        // Até a implementação do login, todas
        // as demais rotas administrativas
        // continuam bloqueadas.

        if (
            url.pathname === "/api/forja" ||
            url.pathname.startsWith("/api/forja/")
        ) {
            return json(
                {
                    ok: false,
                    error: "Não autenticado."
                },
                401
            );
        }

        // ==========================================
        // ROTAS DESCONHECIDAS
        // ==========================================

        return json(
            {
                ok: false,
                error: "Not Found"
            },
            404
        );
    }
};
