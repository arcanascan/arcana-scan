export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // =====================================================
        // ARCANA SCAN — BACKEND
        // =====================================================

        // Rota simples para confirmar que o backend está ativo.
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

        // Qualquer rota que não seja um arquivo estático
        // e não pertença à API retorna 404.
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
