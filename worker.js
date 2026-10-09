
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
        difference |= (left[i] || 0) ^ (right[i] || 0);
    }

    return difference === 0;
}

async function sha256Hex(value) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
    );

    return toHex(digest);
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

    const saltBytes = Uint8Array.from(
        salt.match(/.{2}/g),
        hex => parseInt(hex, 16)
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: saltBytes,
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
        password.length > 128 ||
        setupSecret.length > 256
    ) {
        return json(
            {
                ok: false,
                error: "Confira os dados informados."
            },
            400
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

        const ip = request.headers.get("CF-Connecting-IP");

        if (!ip) {
            return json(
                { ok: false, error: "Origem indisponível." },
                403
            );
        }

        const ipHash = await sha256Hex(
            env.FORJA_SETUP_SECRET + ":" + ip
        );

        const attempts = await env.DB.prepare(
            `SELECT COUNT(*) AS total
             FROM forja_setup_attempts
             WHERE ip_hash = ?
               AND success = 0
               AND attempted_at >= datetime('now', '-30 minutes')`
        ).bind(ipHash).first();

        if ((attempts?.total || 0) >= 5) {
            return json(
                {
                    ok: false,
                    error: "Muitas tentativas. Aguarde 30 minutos."
                },
                429,
                { "Retry-After": "1800" }
            );
        }

        if (!constantTimeEqual(
            setupSecret,
            env.FORJA_SETUP_SECRET
        )) {
            await env.DB.prepare(
                `INSERT INTO forja_setup_attempts
                    (ip_hash, success)
                 VALUES (?, 0)`
            ).bind(ipHash).run();

            return json(
                { ok: false, error: "Não autorizado." },
                403
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

        await env.DB.prepare(
            `INSERT INTO forja_setup_attempts
                (ip_hash, success)
             VALUES (?, 1)`
        ).bind(ipHash).run();

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

        // ==========================================
        // ARCANA SCAN — STATUS
        // ==========================================

        if (url.pathname === "/api/health") {
            return json({
                ok: true,
                service: "ARCANA SCAN",
                status: "online"
            });
        }

        // ==========================================
        // FORJA ARCANA — CADASTRO INICIAL
        // ==========================================

        if (url.pathname === "/api/forja/setup-owner") {
            return createOwner(request, env);
        }

        // ==========================================
        // FORJA ARCANA — ROTAS PROTEGIDAS
        // ==========================================

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
