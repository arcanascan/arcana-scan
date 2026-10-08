
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // ==============================================
        // ARCANA SCAN — BACKEND
        // ==============================================

        if (url.pathname === "/api/health") {
            return Response.json(
                {
                    ok: true,
                    service: "ARCANA SCAN",
                    status: "online"
                },
                {
                    status: 200,
                    headers: {
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        // ==============================================
        // FORJA ARCANA — ÁREA ADMINISTRATIVA
        // ==============================================

        if (
            url.pathname === "/api/forja" ||
            url.pathname.startsWith("/api/forja/")
        ) {
            // A autenticação será implementada
            // nas próximas etapas.

            // Até lá, nenhuma rota administrativa
            // deve permitir acesso.

            return Response.json(
                {
                    ok: false,
                    error: "Não autenticado."
                },
                {
                    status: 401,
                    headers: {
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        // ==============================================
        // ROTAS DESCONHECIDAS
        // ==============================================

        return Response.json(
            {
                ok: false,
                error: "Not Found"
            },
            {
                status: 404,
                headers: {
                    "Cache-Control": "no-store"
                }
            }
        );
    }
};
