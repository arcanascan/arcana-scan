
const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: JSON_HEADERS
    });
}

function randomHex(bytes = 16) {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);

    return Array.from(buffer, byte =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer), byte =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

function constantTimeEqual(a, b) {
    const encoder = new TextEncoder();
    const left = encoder.encode(a);
    const right = encoder.encode(b);

    const length = Math.max(left.length, right.length);
    let difference = left.length ^ right.length;

    for (let i = 0; i < length; i++) {
        difference |=
            (left[i] || 0) ^ (right[i] || 0);
    }

    return difference === 0;
}

async function hashPassword(password) {
    const salt = randomHex(16);
    const iterations = 600000;

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: Uint8Array.from(
                salt.match(/.{2}/g),
                hex => parseInt(hex, 16)
            ),
            iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );

    return `pbkdf2_sha256$${iterations}$${salt}$${toHex(derived)}`;
}

async function createOwner(request, env) {
    if (request.method !== "POST") {
        return json(
            { ok: false, error: "Método não permitido." },
            405
        );
    }

    if (!env.DB || !env.FORJA_SETUP_SECRET) {
        return json(
            { ok: false, error: "Configuração indisponível." },
            503
        );
    }

    const origin = request.headers.get("Origin");
    const expectedOrigin = new URL(request.url).origin;

    if (origin !== expectedOrigin) {
        return json(
            { ok: false, error: "Origem não autorizada." },
            403
        );
    }

    const contentType =
        request.headers.get("Content-Type") || "";

    if (!contentType.toLowerCase().startsWith(
        "application/json"
    )) {
        return json(
            { ok: false, error: "Formato inválido." },
            415
        );
    }

    const contentLength = Number(
        request.headers.get("Content-Length") || 0
    );

    if (contentLength > 8192) {
        return json(
            { ok: false, error: "Dados muito grandes." },
            413
        );
    }

    let body;

    try {
        const raw = await request.text();

        if (raw.length > 8192) {
            return json(
                { ok: false, error: "Dados muito grandes." },
                413
            );
        }

        body = JSON.parse(raw);
    } catch {
        return json(
            { ok: false, error: "Dados inválidos." },
            400
        );
    }

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        return json(
            { ok: false, error: "Dados inválidos." },
            400
        );
    }

    const {
        name,
        email,
        username,
        password,
        setupSecret
    } = body;

    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof username !== "string" ||
        typeof password !== "string" ||
        typeof setupSecret !== "string"
    ) {
        return json(
            { ok: false, error: "Preencha todos os campos." },
            400
        );
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    if (
        cleanName.length < 2 ||
        cleanName.length > 100 ||
        cleanEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
        !/^[a-zA-Z0-9_]{3,32}$/.test(cleanUsername) ||
        password.length < 12 ||
        password.length > 128
    ) {
        return json(
            {
                ok: false,
                error: "Confira nome, e-mail, usuário e senha."
            },
            400
        );
    }

    if (
        !constantTimeEqual(
            setupSecret,
            env.FORJA_SETUP_SECRET
        )
    ) {
        return json(
            { ok: false, error: "Não autorizado." },
            403
        );
    }

    try {
        const existing = await env.DB.prepare(
            "SELECT id FROM forja_users WHERE role = 'owner' LIMIT 1"
        ).first();

        if (existing) {
            return json(
                {
                    ok: false,
                    error: "A conta principal já foi criada."
                },
                409
            );
        }

        const id = crypto.randomUUID();
        const passwordHash = await hashPassword(password);

        await env.DB.prepare(
            `INSERT INTO forja_users
                (id, name, email, username, password_hash, role, status)
             VALUES (?, ?, ?, ?, ?, 'owner', 'active')`
        ).bind(
            id,
            cleanName,
            cleanEmail,
            cleanUsername,
            passwordHash
        ).run();

        return json(
            {
                ok: true,
                message: "Conta principal criada com sucesso."
            },
            201
        );
    } catch (error) {
        console.error(
            "FORJA owner setup failed:",
            error instanceof Error ? error.name : "Unknown"
        );

        return json(
            {
                ok: false,
                error: "Não foi possível concluir o cadastro."
            },
            500
        );
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === "/api/health") {
            return json({
                ok: true,
                service: "ARCANA SCAN",
                status: "online"
            });
        }

        if (
            url.pathname === "/api/forja/db-check" &&
            request.method === "GET"
        ) {
            try {
                const result = await env.DB
                    .prepare("SELECT 1 AS connected")
                    .first();

                if (result?.connected !== 1) {
                    throw new Error("Database unavailable");
                }

                return json({
                    ok: true,
                    database: "connected"
                });
            } catch {
                return json(
                    {
                        ok: false,
                        error: "Database unavailable"
                    },
                    503
                );
            }
        }

        if (
            url.pathname === "/api/forja/setup-owner"
        ) {
            return createOwner(request, env);
        }

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

        return json(
            {
                ok: false,
                error: "Not Found"
            },
            404
        );
    }
};
