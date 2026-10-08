
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
        // FORJA ARCANA — TESTE TEMPORÁRIO DO D1
        // ==============================================

        if (
            url.pathname === "/api/forja/db-check" &&
            request.method === "GET"
        ) {
            try {
                if (!env.DB) {
                    throw new Error("D1 binding unavailable");
                }

                const result = await env.DB
                    .prepare("SELECT 1 AS connected")
                    .first();

                if (result?.connected !== 1) {
                    throw new Error("D1 query failed");
                }

                return Response.json(
                    {
                        ok: true,
                        database: "connected"
                    },
                    {
                        headers: {
                            "Cache-Control": "no-store"
                        }
                    }
                );
            } catch (error) {
                console.error("FORJA D1 check failed");

                return Response.json(
                    {
                        ok: false,
                        error: "Database unavailable"
                    },
                    {
                        status: 503,
                        headers: {
                            "Cache-Control": "no-store"
                        }
                    }
                );
            }
        }

        // ==============================================
        // FORJA ARCANA — ROTAS FECHADAS
        // ==============================================

        if (
            url.pathname === "/api/forja" ||
            url.pathname.startsWith("/api/forja/")
        ) {
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
