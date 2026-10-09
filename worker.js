
"use strict";

// ==========================================
// FORJA ARCANA — CONFIGURAÇÕES
// ==========================================

const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
};

const SESSION_COOKIE = "__Host-forja_session";
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 20;

// ==========================================
// RESPOSTAS JSON
// ==========================================

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
// FUNÇÕES DE SEGURANÇA
// ==========================================

function toHex(buffer) {
    return Array.from(
        new Uint8Array(buffer),
        byte => byte.toString(16).padStart(2, "0")
    ).join("");
}

function hexToBytes(hex) {
    return Uint8Array.from(
        hex.match(/.{2}/g),
        pair => parseInt(pair, 16)
    );
}

function randomHex(bytes = 32) {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return toHex(buffer);
}

function constantTimeEqual(a, b) {
    const encoder = new TextEncoder();
    const left = encoder.encode(a);
    const right = encoder.encode(b);

    const length = Math.max(
        left.length,
        right.length
    );

    let difference = left.length ^ right.length;

    for (let i = 0; i < length; i++) {
        difference |=
            (left[i] || 0) ^ (right[i] || 0);
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

// ==========================================
// PROTEÇÃO E VERIFICAÇÃO DA SENHA
// ==========================================

// Esta função é compatível com o algoritmo
// usado na criação da conta principal.
//
// IMPORTANTE:
// FORJA_AUTH_SECRET deve continuar sendo
// preservada nas variáveis secretas do Worker.

async function pepperPassword(password, authSecret) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(authSecret),
        {
            name: "HMAC",
            hash: "SHA-256"
        },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(password)
    );

    return new Uint8Array(signature);
}

async function derivePasswordHash(
    password,
    authSecret,
    salt,
    iterations
) {
    const pepperedPassword = await pepperPassword(
        password,
        authSecret
    );

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        pepperedPassword,
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: hexToBytes(salt),
            iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );

    return toHex(derived);
}

async function verifyPassword(
    password,
    storedHash,
    authSecret
) {
    if (typeof storedHash !== "string") {
        return false;
    }

    const parts = storedHash.split("$");

    if (parts.length !== 4) {
        return false;
    }

    const [
        algorithm,
        iterationsText,
        salt,
        expectedHash
    ] = parts;

    if (
        algorithm !== "pbkdf2_sha256_hmacpepper_v1" ||
        iterationsText !== "100000" ||
        !/^[a-f0-9]{32}$/.test(salt) ||
        !/^[a-f0-9]{64}$/.test(expectedHash)
    ) {
        return false;
    }

    const calculatedHash = await derivePasswordHash(
        password,
        authSecret,
        salt,
        100000
    );

    return constantTimeEqual(
        calculatedHash,
        expectedHash
    );
}

// ==========================================
// PROTEÇÃO DE ORIGEM
// ==========================================

function isSameOrigin(request) {
    const origin = request.headers.get("Origin");
    const expectedOrigin = new URL(request.url).origin;

    return origin === expectedOrigin;
}

// ==========================================
// LEITURA SEGURA DO JSON
// ==========================================

async function readJsonBody(request) {
    const contentType =
        request.headers.get("Content-Type") || "";

    if (
        !contentType.toLowerCase().startsWith(
            "application/json"
        )
    ) {
        return {
            ok: false,
            status: 415,
            error: "Formato inválido."
        };
    }

    const contentLength = Number(
        request.headers.get("Content-Length") || 0
    );

    if (
        !Number.isFinite(contentLength) ||
        contentLength > 8192
    ) {
        return {
            ok: false,
            status: 413,
            error: "Dados muito grandes."
        };
    }

    try {
        const raw = await request.text();

        if (raw.length > 8192) {
            return {
                ok: false,
                status: 413,
                error: "Dados muito grandes."
            };
        }

        const body = JSON.parse(raw);

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return {
                ok: false,
                status: 400,
                error: "Dados inválidos."
            };
        }

        return {
            ok: true,
            body
        };
    } catch {
        return {
            ok: false,
            status: 400,
            error: "Dados inválidos."
        };
    }
}

// ==========================================
// COOKIES DE SESSÃO
// ==========================================

function createSessionCookie(token) {
    return [
        `${SESSION_COOKIE}=${token}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        `Max-Age=${SESSION_SECONDS}`
    ].join("; ");
}

function clearSessionCookie() {
    return [
        `${SESSION_COOKIE}=`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Max-Age=0"
    ].join("; ");
}

function readSessionToken(request) {
    const cookieHeader =
        request.headers.get("Cookie") || "";

    const cookies = cookieHeader.split(";");

    for (const cookie of cookies) {
        const separator = cookie.indexOf("=");

        if (separator === -1) {
            continue;
        }

        const name = cookie
            .slice(0, separator)
            .trim();

        if (name !== SESSION_COOKIE) {
            continue;
        }

        const token = cookie
            .slice(separator + 1)
            .trim();

        if (/^[a-f0-9]{64}$/.test(token)) {
            return token;
        }

        return null;
    }

    return null;
}

// ==========================================
// IDENTIFICAÇÃO DA ORIGEM
// ==========================================

async function getIpHash(request, authSecret) {
    const ip = request.headers.get(
        "CF-Connecting-IP"
    );

    if (!ip) {
        return null;
    }

    return sha256Hex(
        authSecret + ":forja-login:" + ip
    );
}

// ==========================================
// CONTROLE DE TENTATIVAS
// ==========================================

async function getLoginLimits(
    db,
    username,
    ipHash
) {
    const result = await db.prepare(
        `SELECT
            COUNT(*) AS ip_total,
            SUM(
                CASE
                    WHEN username = ? COLLATE NOCASE
                    THEN 1
                    ELSE 0
                END
            ) AS user_total
         FROM forja_login_attempts
         WHERE ip_hash = ?
           AND success = 0
           AND attempted_at >=
               datetime('now', '-15 minutes')`
    ).bind(
        username,
        ipHash
    ).first();

    return {
        ipTotal: Number(
            result?.ip_total || 0
        ),
        userTotal: Number(
            result?.user_total || 0
        )
    };
}

async function recordLoginAttempt(
    db,
    username,
    ipHash,
    success
) {
    await db.prepare(
        `INSERT INTO forja_login_attempts
            (username, ip_hash, success)
         VALUES (?, ?, ?)`
    ).bind(
        username,
        ipHash,
        success ? 1 : 0
    ).run();
}

// ==========================================
// LOGIN ADMINISTRATIVO
// ==========================================

async function login(request, env) {
    if (request.method !== "POST") {
        return json(
            {
                ok: false,
                error: "Método não permitido."
            },
            405
        );
    }

    if (
        !env.DB ||
        !env.FORJA_AUTH_SECRET
    ) {
        return json(
            {
                ok: false,
                error: "Configuração indisponível."
            },
            503
        );
    }

    if (!isSameOrigin(request)) {
        return json(
            {
                ok: false,
                error: "Origem não autorizada."
            },
            403
        );
    }

    const parsed = await readJsonBody(request);

    if (!parsed.ok) {
        return json(
            {
                ok: false,
                error: parsed.error
            },
            parsed.status
        );
    }

    const { username, password } = parsed.body;

    if (
        typeof username !== "string" ||
        typeof password !== "string"
    ) {
        return json(
            {
                ok: false,
                error: "Usuário ou senha inválidos."
            },
            400
        );
    }

    const cleanUsername = username.trim();

    if (
        !/^[a-zA-Z0-9_]{3,32}$/.test(cleanUsername) ||
        password.length < 12 ||
        password.length > 128
    ) {
        return json(
            {
                ok: false,
                error: "Usuário ou senha inválidos."
            },
            401
        );
    }

    try {
        const ipHash = await getIpHash(
            request,
            env.FORJA_AUTH_SECRET
        );

        if (!ipHash) {
            return json(
                {
                    ok: false,
                    error: "Origem indisponível."
                },
                403
            );
        }

        const limits = await getLoginLimits(
            env.DB,
            cleanUsername,
            ipHash
        );

        if (
            limits.userTotal >= MAX_LOGIN_ATTEMPTS ||
            limits.ipTotal >= MAX_IP_ATTEMPTS
        ) {
            return json(
                {
                    ok: false,
                    error:
                        "Muitas tentativas de acesso. " +
                        "Aguarde 15 minutos."
                },
                429,
                {
                    "Retry-After": "900"
                }
            );
        }

        const user = await env.DB.prepare(
            `SELECT
                id,
                name,
                username,
                password_hash,
                role,
                status
             FROM forja_users
             WHERE username = ? COLLATE NOCASE
             LIMIT 1`
        ).bind(
            cleanUsername
        ).first();

        let passwordValid = false;

        if (
            user &&
            user.status === "active" &&
            ["owner", "admin", "moderator"].includes(
                user.role
            )
        ) {
            passwordValid = await verifyPassword(
                password,
                user.password_hash,
                env.FORJA_AUTH_SECRET
            );
        }

        if (!passwordValid) {
            await recordLoginAttempt(
                env.DB,
                cleanUsername,
                ipHash,
                false
            );

            return json(
                {
                    ok: false,
                    error: "Usuário ou senha inválidos."
                },
                401
            );
        }

        // Token aleatório de 256 bits.
        // O token original nunca é salvo no D1.

        const token = randomHex(32);
        const tokenHash = await sha256Hex(token);

        const sessionId = crypto.randomUUID();

        const expiresAt = new Date(
            Date.now() +
            SESSION_SECONDS * 1000
        ).toISOString();

        await env.DB.prepare(
            `INSERT INTO forja_sessions
                (
                    id,
                    user_id,
                    token_hash,
                    expires_at
                )
             VALUES (?, ?, ?, ?)`
        ).bind(
            sessionId,
            user.id,
            tokenHash,
            expiresAt
        ).run();

        // A sessão já foi criada.
        // Um problema no registro auxiliar
        // não deve invalidar o login.

        try {
            await recordLoginAttempt(
                env.DB,
                cleanUsername,
                ipHash,
                true
            );
        } catch {
            console.error(
                "FORJA login success log failed"
            );
        }

        return json(
            {
                ok: true,
                message: "Acesso autorizado.",
                user: {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    role: user.role
                }
            },
            200,
            {
                "Set-Cookie": createSessionCookie(
                    token
                )
            }
        );
    } catch (error) {
        console.error(
            "FORJA login failed:",
            error instanceof Error
                ? error.name
                : "Unknown"
        );

        return json(
            {
                ok: false,
                error:
                    "Não foi possível realizar " +
                    "o login neste momento."
            },
            500
        );
    }
}

// ==========================================
// CONSULTA DA SESSÃO
// ==========================================

async function findSession(request, env) {
    const token = readSessionToken(request);

    if (!token) {
        return null;
    }

    const tokenHash = await sha256Hex(token);

    const session = await env.DB.prepare(
        `SELECT
            s.id AS session_id,
            u.id AS user_id,
            u.name,
            u.username,
            u.role
         FROM forja_sessions s
         INNER JOIN forja_users u
            ON u.id = s.user_id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND datetime(s.expires_at) >
               datetime('now')
           AND u.status = 'active'
           AND u.role IN (
               'owner',
               'admin',
               'moderator'
           )
         LIMIT 1`
    ).bind(
        tokenHash
    ).first();

    return session || null;
}

async function getCurrentUser(request, env) {
    if (request.method !== "GET") {
        return json(
            {
                ok: false,
                error: "Método não permitido."
            },
            405
        );
    }

    if (!env.DB) {
        return json(
            {
                ok: false,
                error: "Configuração indisponível."
            },
            503
        );
    }

    try {
        const session = await findSession(
            request,
            env
        );

        if (!session) {
            return json(
                {
                    ok: false,
                    error: "Não autenticado."
                },
                401
            );
        }

        await env.DB.prepare(
            `UPDATE forja_sessions
             SET last_used_at = CURRENT_TIMESTAMP
             WHERE id = ?`
        ).bind(
            session.session_id
        ).run();

        return json({
            ok: true,
            user: {
                id: session.user_id,
                name: session.name,
                username: session.username,
                role: session.role
            }
        });
    } catch (error) {
        console.error(
            "FORJA session check failed:",
            error instanceof Error
                ? error.name
                : "Unknown"
        );

        return json(
            {
                ok: false,
                error: "Erro ao verificar a sessão."
            },
            500
        );
    }
}

// ==========================================
// ENCERRAMENTO DA SESSÃO
// ==========================================

async function logout(request, env) {
    if (request.method !== "POST") {
        return json(
            {
                ok: false,
                error: "Método não permitido."
            },
            405
        );
    }

    if (!isSameOrigin(request)) {
        return json(
            {
                ok: false,
                error: "Origem não autorizada."
            },
            403
        );
    }

    if (!env.DB) {
        return json(
            {
                ok: false,
                error: "Configuração indisponível."
            },
            503
        );
    }

    try {
        const token = readSessionToken(request);

        if (token) {
            const tokenHash = await sha256Hex(
                token
            );

            await env.DB.prepare(
                `UPDATE forja_sessions
                 SET revoked_at = CURRENT_TIMESTAMP
                 WHERE token_hash = ?
                   AND revoked_at IS NULL`
            ).bind(
                tokenHash
            ).run();
        }

        return json(
            {
                ok: true,
                message: "Sessão encerrada."
            },
            200,
            {
                "Set-Cookie": clearSessionCookie()
            }
        );
    } catch (error) {
        console.error(
            "FORJA logout failed:",
            error instanceof Error
                ? error.name
                : "Unknown"
        );

        return json(
            {
                ok: false,
                error: "Não foi possível sair."
            },
            500
        );
    }
}

// ==========================================
// WORKER PRINCIPAL — ARCANA SCAN
// ==========================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // ======================================
        // STATUS DO SERVIDOR
        // ======================================

        if (url.pathname === "/api/health") {
            return json({
                ok: true,
                service: "ARCANA SCAN",
                status: "online"
            });
        }

        // ======================================
        // CADASTRO INICIAL ENCERRADO
        // ======================================

        if (
            url.pathname ===
            "/api/forja/setup-owner"
        ) {
            return json(
                {
                    ok: false,
                    error: "Cadastro inicial encerrado."
                },
                410
            );
        }

        // ======================================
        // LOGIN
        // ======================================

        if (
            url.pathname === "/api/forja/login"
        ) {
            return login(request, env);
        }

        // ======================================
        // CONSULTAR SESSÃO
        // ======================================

        if (
            url.pathname === "/api/forja/me"
        ) {
            return getCurrentUser(
                request,
                env
            );
        }

        // ======================================
        // LOGOUT
        // ======================================

        if (
            url.pathname === "/api/forja/logout"
        ) {
            return logout(request, env);
        }

        // ======================================
        // DEMAIS ROTAS ADMINISTRATIVAS
        // ======================================

        // Nenhuma função de gerenciamento
        // está liberada nesta etapa.

        if (
            url.pathname === "/api/forja" ||
            url.pathname.startsWith(
                "/api/forja/"
            )
        ) {
            return json(
                {
                    ok: false,
                    error: "Não autenticado."
                },
                401
            );
        }

        // ======================================
        // ROTAS DESCONHECIDAS
        // ======================================

        return json(
            {
                ok: false,
                error: "Not Found"
            },
            404
        );
    }
};
