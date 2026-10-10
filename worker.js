
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
// BIBLIOTECA DE OBRAS — VALIDAÇÕES
// ==========================================

const WORK_TYPES = new Set([
    "manga", "manhwa", "manhua", "webtoon"
]);
const STORY_STATUSES = new Set([
    "ongoing", "completed", "hiatus", "cancelled"
]);
const DECENSOR_TYPES = new Set([
    "none", "official", "arcana"
]);
const READING_STYLES = new Set([
    "vertical", "horizontal"
]);

function workError(message, status = 400) {
    return json({ ok: false, error: message }, status);
}

function cleanRequiredText(value, maxLength) {
    if (typeof value !== "string") return null;
    const cleaned = value.trim();
    return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function cleanOptionalText(value, maxLength) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") return undefined;
    const cleaned = value.trim();
    return cleaned.length <= maxLength ? (cleaned || null) : undefined;
}

function createWorkSlug(title) {
    return title.normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .replace(/-+$/g, "");
}

function parseNewWork(body) {
    const allowedFields = new Set([
        "title", "alternative_title", "slug", "synopsis",
        "work_type", "story_status", "release_year", "author",
        "artist", "scan_name", "age_rating", "is_adult",
        "is_one_shot", "decensor_type", "expected_chapters",
        "update_days", "reading_style", "image_gap",
        "seo_title", "seo_description"
    ]);

    for (const field of Object.keys(body)) {
        if (!allowedFields.has(field)) {
            return { error: "Campo não permitido: " + field };
        }
    }

    const title = cleanRequiredText(body.title, 200);
    if (!title) return { error: "Informe um título válido (até 200 caracteres)." };

    let slug;
    if (body.slug === undefined || body.slug === null || body.slug === "") {
        slug = createWorkSlug(title);
    } else if (typeof body.slug === "string") {
        slug = body.slug.trim().toLowerCase();
    } else {
        return { error: "Endereço da obra inválido." };
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
        return { error: "Endereço inválido. Use letras minúsculas, números e hífens (até 80 caracteres)." };
    }

    const textFields = {
        alternative_title: 200, synopsis: 4000, author: 200,
        artist: 200, scan_name: 200, age_rating: 40,
        update_days: 100, seo_title: 200, seo_description: 350
    };
    const values = { title, slug };
    for (const [field, limit] of Object.entries(textFields)) {
        const cleaned = cleanOptionalText(body[field], limit);
        if (cleaned === undefined) {
            return { error: "Texto inválido no campo: " + field };
        }
        values[field] = cleaned;
    }

    const enums = {
        work_type: [WORK_TYPES, "manhwa"],
        story_status: [STORY_STATUSES, "ongoing"],
        decensor_type: [DECENSOR_TYPES, "none"],
        reading_style: [READING_STYLES, "vertical"]
    };
    for (const [field, [choices, fallback]] of Object.entries(enums)) {
        const value = body[field] === undefined ? fallback : body[field];
        if (!choices.has(value)) {
            return { error: "Valor inválido no campo: " + field };
        }
        values[field] = value;
    }

    for (const field of ["is_adult", "is_one_shot"]) {
        const value = body[field] === undefined ? false : body[field];
        if (typeof value !== "boolean") {
            return { error: "Use verdadeiro ou falso no campo: " + field };
        }
        values[field] = value ? 1 : 0;
    }

    const year = body.release_year;
    if (year !== undefined && year !== null &&
        (!Number.isInteger(year) || year < 1800 || year > 2200)) {
        return { error: "Ano de lançamento inválido." };
    }
    values.release_year = year ?? null;

    const expected = body.expected_chapters;
    if (expected !== undefined && expected !== null &&
        (!Number.isInteger(expected) || expected < 0 || expected > 100000)) {
        return { error: "Quantidade prevista de capítulos inválida." };
    }
    values.expected_chapters = expected ?? null;

    const gap = body.image_gap === undefined ? 0 : body.image_gap;
    if (!Number.isInteger(gap) || gap < 0 || gap > 500) {
        return { error: "Espaçamento de imagens inválido." };
    }
    values.image_gap = gap;

    // Nunca aceitar publication_status, cover_key ou banner_key do cliente.
    // Publicação e arquivos exigirão fluxos próprios e protegidos.
    values.publication_status = "draft";
    return { values };
}

// ==========================================
// BIBLIOTECA DE OBRAS — ROTAS PROTEGIDAS
// ==========================================

async function worksApi(request, env) {
    if (request.method !== "GET" && request.method !== "POST") {
        return workError("Método não permitido.", 405);
    }
    if (!env.DB) {
        return workError("Configuração indisponível.", 503);
    }
    if (request.method === "POST" && !isSameOrigin(request)) {
        return workError("Origem não autorizada.", 403);
    }

    try {
        const session = await findSession(request, env);
        if (!session) return workError("Não autenticado.", 401);

        if (!["owner", "admin", "moderator"].includes(session.role)) {
            return workError("Permissão insuficiente.", 403);
        }

        if (request.method === "GET") {
            const result = await env.DB.prepare(
                `SELECT id, title, alternative_title, slug, synopsis,
                        work_type, story_status, publication_status,
                        release_year, author, artist, scan_name,
                        age_rating, is_adult, is_one_shot, decensor_type,
                        expected_chapters, update_days, reading_style,
                        image_gap, seo_title, seo_description,
                        created_at, updated_at
                 FROM forja_works
                 ORDER BY created_at DESC, id DESC
                 LIMIT 50`
            ).all();
            return json({ ok: true, works: result.results || [] });
        }

        const parsed = await readJsonBody(request);
        if (!parsed.ok) return workError(parsed.error, parsed.status);

        const checked = parseNewWork(parsed.body);
        if (checked.error) return workError(checked.error);
        const w = checked.values;
        const workId = crypto.randomUUID();

        const insert = env.DB.prepare(
            `INSERT INTO forja_works (
                id, title, alternative_title, slug, synopsis,
                work_type, story_status, publication_status,
                release_year, author, artist, scan_name, age_rating,
                is_adult, is_one_shot, decensor_type, expected_chapters,
                update_days, reading_style, image_gap, seo_title,
                seo_description, created_by, updated_by
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )`
        ).bind(
            workId, w.title, w.alternative_title, w.slug, w.synopsis,
            w.work_type, w.story_status, w.publication_status,
            w.release_year, w.author, w.artist, w.scan_name,
            w.age_rating, w.is_adult, w.is_one_shot, w.decensor_type,
            w.expected_chapters, w.update_days, w.reading_style,
            w.image_gap, w.seo_title, w.seo_description,
            session.user_id, session.user_id
        );

        const audit = env.DB.prepare(
            `INSERT INTO forja_audit_logs
                (user_id, action, entity_type, entity_id, description, details)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
            session.user_id,
            "work.create",
            "work",
            workId,
            "Obra cadastrada como rascunho.",
            JSON.stringify({ title: w.title, slug: w.slug, publication_status: "draft" })
        );

        // D1 executa batch de escrita como transação: obra e auditoria juntas.
        await env.DB.batch([insert, audit]);
        return json({
            ok: true,
            message: "Obra cadastrada como rascunho.",
            work: {
                id: workId,
                title: w.title,
                slug: w.slug,
                publication_status: "draft"
            }
        }, 201);
    } catch (error) {
        // Não revelar SQL nem detalhes internos ao navegador.
        const message = String(error instanceof Error ? error.message : "");
        if (/UNIQUE constraint failed: forja_works.slug/i.test(message)) {
            return workError("Este endereço de obra já está em uso.", 409);
        }
        console.error("FORJA works API failed:", error instanceof Error ? error.name : "Unknown");
        return workError("Não foi possível processar as obras neste momento.", 500);
    }
}

// ==========================================
// CONSELHO DA EQUIPE — GESTÃO EXCLUSIVA OWNER
// ==========================================

function userError(message, status = 400) {
    return json({ ok: false, error: message }, status);
}

function validateNewUser(body) {
    const allowed = new Set(["name", "username", "email", "password", "role"]);
    if (Object.keys(body).some(field => !allowed.has(field))) {
        return { error: "Campos não permitidos no cadastro." };
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = body.password;
    const role = body.role;

    if (name.length < 2 || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) {
        return { error: "Nome inválido (2 a 120 caracteres)." };
    }
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        return { error: "Usuário inválido: 3 a 32 letras, números ou _." };
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "E-mail inválido." };
    }
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
        return { error: "Senha deve conter de 12 a 128 caracteres." };
    }
    if (role !== "admin" && role !== "moderator") {
        return { error: "Somente administrador ou moderador podem ser cadastrados." };
    }
    return { values: { name, username, email, password, role } };
}

async function usersApi(request, env, userId = null) {
    const method = request.method;
    if (userId === null && method !== "GET" && method !== "POST") {
        return userError("Método não permitido.", 405);
    }
    if (userId !== null && method !== "PATCH") {
        return userError("Método não permitido.", 405);
    }
    if (!env.DB || !env.FORJA_AUTH_SECRET) {
        return userError("Configuração indisponível.", 503);
    }
    if (method !== "GET" && !isSameOrigin(request)) {
        return userError("Origem não autorizada.", 403);
    }

    try {
        const session = await findSession(request, env);
        if (!session) return userError("Não autenticado.", 401);
        if (session.role !== "owner") {
            return userError("Apenas a administração principal pode gerenciar contas.", 403);
        }

        if (method === "GET") {
            const result = await env.DB.prepare(
                `SELECT id, name, username, email, role, status, created_at, updated_at
                 FROM forja_users
                 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                          created_at ASC, id ASC
                 LIMIT 200`
            ).all();
            return json({ ok: true, users: result.results || [] });
        }

        const parsed = await readJsonBody(request);
        if (!parsed.ok) return userError(parsed.error, parsed.status);

        if (method === "POST") {
            const validated = validateNewUser(parsed.body);
            if (validated.error) return userError(validated.error);
            const { name, username, email, password, role } = validated.values;
            const salt = randomHex(16);
            const hash = await derivePasswordHash(password, env.FORJA_AUTH_SECRET, salt, 100000);
            const storedHash = `pbkdf2_sha256_hmacpepper_v1$100000$${salt}$${hash}`;
            const id = crypto.randomUUID();

            const insert = env.DB.prepare(
                `INSERT INTO forja_users
                 (id, name, username, email, password_hash, role, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'active')`
            ).bind(id, name, username, email, storedHash, role);
            const audit = env.DB.prepare(
                `INSERT INTO forja_audit_logs
                 (user_id, action, entity_type, entity_id, description, details)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(session.user_id, "user.create", "user", id,
                "Conta da equipe criada.", JSON.stringify({ username, role }));
            await env.DB.batch([insert, audit]);
            return json({ ok: true, message: "Conta criada com sucesso.",
                user: { id, name, username, email, role, status: "active" } }, 201);
        }

        // Alteração de cargo ou bloqueio; a conta owner jamais pode ser alterada aqui.
        if (!/^[0-9a-f-]{36}$/i.test(userId)) {
            return userError("Identificador inválido.", 400);
        }
        const body = parsed.body;
        if (!Object.keys(body).length || Object.keys(body).some(k => !["role", "status"].includes(k))) {
            return userError("Informe apenas cargo e/ou situação.");
        }
        if (body.role !== undefined && !["admin", "moderator"].includes(body.role)) {
            return userError("Cargo inválido.");
        }
        if (body.status !== undefined && !["active", "disabled"].includes(body.status)) {
            return userError("Situação inválida.");
        }
        const target = await env.DB.prepare(
            `SELECT id, username, role, status FROM forja_users WHERE id = ? LIMIT 1`
        ).bind(userId).first();
        if (!target) return userError("Conta não encontrada.", 404);
        if (target.role === "owner" || target.id === session.user_id) {
            return userError("A conta principal não pode ser alterada aqui.", 403);
        }
        const nextRole = body.role ?? target.role;
        const nextStatus = body.status ?? target.status;
        if (nextRole === target.role && nextStatus === target.status) {
            return json({ ok: true, message: "Nenhuma alteração necessária." });
        }
        const update = env.DB.prepare(
            `UPDATE forja_users SET role = ?, status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND role IN ('admin', 'moderator')`
        ).bind(nextRole, nextStatus, userId);
        const audit = env.DB.prepare(
            `INSERT INTO forja_audit_logs
             (user_id, action, entity_type, entity_id, description, details)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(session.user_id, "user.update", "user", userId,
            "Permissão ou situação de conta alterada.",
            JSON.stringify({ username: target.username, previous_role: target.role,
                role: nextRole, previous_status: target.status, status: nextStatus }));
        const actions = [update, audit];
        // Alterações de cargo também encerram sessões antigas, para atualizar permissões.
        if (nextStatus === "disabled" || nextRole !== target.role) {
            actions.push(env.DB.prepare(
                `UPDATE forja_sessions SET revoked_at = CURRENT_TIMESTAMP
                 WHERE user_id = ? AND revoked_at IS NULL`
            ).bind(userId));
        }
        await env.DB.batch(actions);
        return json({ ok: true, message: "Conta atualizada.",
            user: { id: userId, role: nextRole, status: nextStatus } });
    } catch (error) {
        const message = String(error instanceof Error ? error.message : "");
        if (/UNIQUE constraint failed: forja_users\.(username|email)/i.test(message)) {
            return userError("Nome de usuário ou e-mail já cadastrado.", 409);
        }
        console.error("FORJA users API failed:", error instanceof Error ? error.name : "Unknown");
        return userError("Não foi possível gerenciar a equipe neste momento.", 500);
    }
}

// ================================================================
// CONTAS DOS LEITORES — ISOLADAS DAS CONTAS ADMINISTRATIVAS
// ================================================================
const READER_COOKIE = "__Host-arcana_reader";
const READER_SESSION_SECONDS = 30 * 24 * 60 * 60;

function readerCookie(token) {
    return [
        `${READER_COOKIE}=${token}`,
        "Path=/", "HttpOnly", "Secure", "SameSite=Lax",
        `Max-Age=${READER_SESSION_SECONDS}`
    ].join("; ");
}

function clearReaderCookie() {
    return [
        `${READER_COOKIE}=`, "Path=/", "HttpOnly", "Secure",
        "SameSite=Lax", "Max-Age=0"
    ].join("; ");
}

function readReaderToken(request) {
    const header = request.headers.get("Cookie") || "";
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        if (part.slice(0, index).trim() !== READER_COOKIE) continue;
        const token = part.slice(index + 1).trim();
        return /^[a-f0-9]{64}$/.test(token) ? token : null;
    }
    return null;
}

async function readerSession(request, env) {
    const token = readReaderToken(request);
    if (!token) return null;
    const tokenHash = await sha256Hex(token);
    return await env.DB.prepare(
        `SELECT s.id AS session_id, u.id, u.username, u.email
         FROM reader_sessions s JOIN reader_users u ON u.id = s.reader_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL
           AND datetime(s.expires_at) > datetime('now')
           AND u.status = 'active' LIMIT 1`
    ).bind(tokenHash).first();
}

function readerError(message, status = 400) {
    return json({ ok: false, error: message }, status);
}

async function readerRateLimit(db, ipHash, action, identity = "") {
    const result = await db.prepare(
        `SELECT COUNT(*) AS total FROM reader_auth_attempts
         WHERE ip_hash = ? AND action = ? AND (action = 'register' OR success = 0)
           AND attempted_at >= datetime('now', '-15 minutes')`
    ).bind(ipHash, action).first();
    const limit = action === "register" ? 5 : 20;
    if (Number(result?.total || 0) >= limit) return true;
    if (action === "login") {
        const targeted = await db.prepare(
            `SELECT COUNT(*) AS total FROM reader_auth_attempts
             WHERE ip_hash = ? AND action = 'login' AND identity = ?
               AND success = 0
               AND attempted_at >= datetime('now', '-15 minutes')`
        ).bind(ipHash, identity).first();
        if (Number(targeted?.total || 0) >= 5) return true;
    }
    return false;
}

async function readerAttempt(db, ipHash, action, identity, success) {
    await db.prepare(
        `INSERT INTO reader_auth_attempts(ip_hash, identity, action, success)
         VALUES (?, ?, ?, ?)`
    ).bind(ipHash, identity, action, success ? 1 : 0).run();
}

async function readerApi(request, env, action) {
    const method = request.method;
    const expected = action === "me" ? "GET" : "POST";
    if (method !== expected) return readerError("Método não permitido.", 405);
    if (!env.DB || !env.FORJA_AUTH_SECRET) {
        return readerError("Serviço temporariamente indisponível.", 503);
    }
    if (method === "POST" && !isSameOrigin(request)) {
        return readerError("Origem não autorizada.", 403);
    }

    try {
        if (action === "me") {
            const session = await readerSession(request, env);
            if (!session) return readerError("Não autenticado.", 401);
            return json({ ok: true, reader: {
                id: session.id, username: session.username, email: session.email
            }});
        }
        if (action === "logout") {
            const token = readReaderToken(request);
            if (token) {
                await env.DB.prepare(
                    `UPDATE reader_sessions SET revoked_at = CURRENT_TIMESTAMP
                     WHERE token_hash = ? AND revoked_at IS NULL`
                ).bind(await sha256Hex(token)).run();
            }
            return json({ ok: true, message: "Sessão encerrada." }, 200, {
                "Set-Cookie": clearReaderCookie()
            });
        }

        const parsed = await readJsonBody(request);
        if (!parsed.ok) return readerError(parsed.error, parsed.status);
        const body = parsed.body;
        const ipHash = await getIpHash(request, env.FORJA_AUTH_SECRET);
        if (!ipHash) return readerError("Origem indisponível.", 403);

        if (action === "register") {
            if (Object.keys(body).some(k => ![
                "username", "email", "password", "acceptTerms"
            ].includes(k))) return readerError("Campos inválidos.");

            const username = typeof body.username === "string"
                ? body.username.trim().toLowerCase() : "";
            const email = typeof body.email === "string"
                ? body.email.trim().toLowerCase() : "";
            const password = body.password;
            if (!/^[a-z0-9_]{3,32}$/.test(username)) {
                return readerError("Usuário: 3 a 32 letras, números ou _. ");
            }
            if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return readerError("E-mail inválido.");
            }
            if (typeof password !== "string" || password.length < 8 || password.length > 128) {
                return readerError("A senha deve ter de 8 a 128 caracteres.");
            }
            if (body.acceptTerms !== true) {
                return readerError("É necessário aceitar os termos e a política de privacidade.");
            }
            if (await readerRateLimit(env.DB, ipHash, "register", username)) {
                return readerError("Muitas tentativas. Aguarde 15 minutos.", 429);
            }
            const existing = await env.DB.prepare(
                `SELECT id FROM reader_users
                 WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE LIMIT 1`
            ).bind(username, email).first();
            if (existing) {
                await readerAttempt(env.DB, ipHash, "register", username, false);
                return readerError("Usuário ou e-mail já cadastrado.", 409);
            }
            const salt = randomHex(16);
            const hash = await derivePasswordHash(
                "reader:v1:" + password, env.FORJA_AUTH_SECRET, salt, 100000
            );
            const storedHash = `pbkdf2_sha256_hmacpepper_v1$100000$${salt}$${hash}`;
            const id = crypto.randomUUID();
            try {
                await env.DB.prepare(
                    `INSERT INTO reader_users(id,username,email,password_hash)
                     VALUES(?,?,?,?)`
                ).bind(id, username, email, storedHash).run();
            } catch (e) {
                if (/UNIQUE constraint failed/i.test(String(e?.message || ""))) {
                    return readerError("Usuário ou e-mail já cadastrado.", 409);
                }
                throw e;
            }
            try { await readerAttempt(env.DB, ipHash, "register", username, true); }
            catch { console.error("Reader registration log failed"); }
            return json({ ok: true, message: "Conta criada. Faça seu login." }, 201);
        }

        if (action === "login") {
            if (Object.keys(body).some(k => !["identity", "password"].includes(k))) {
                return readerError("Campos inválidos.");
            }
            const identity = typeof body.identity === "string"
                ? body.identity.trim().toLowerCase() : "";
            const password = body.password;
            if (!identity || identity.length > 254 ||
                typeof password !== "string" || password.length > 128) {
                return readerError("Usuário ou senha inválidos.", 401);
            }
            if (await readerRateLimit(env.DB, ipHash, "login", identity)) {
                return readerError("Muitas tentativas. Aguarde 15 minutos.", 429);
            }
            const reader = await env.DB.prepare(
                `SELECT id,username,email,password_hash,status FROM reader_users
                 WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE LIMIT 1`
            ).bind(identity, identity).first();
            const valid = !!reader && reader.status === "active" &&
                await verifyPassword("reader:v1:" + password,
                    reader.password_hash, env.FORJA_AUTH_SECRET);
            if (!valid) {
                await readerAttempt(env.DB, ipHash, "login", identity, false);
                return readerError("Usuário ou senha inválidos.", 401);
            }
            const token = randomHex(32);
            const expiresAt = new Date(
                Date.now() + READER_SESSION_SECONDS * 1000
            ).toISOString();
            await env.DB.prepare(
                `INSERT INTO reader_sessions(id,reader_id,token_hash,expires_at)
                 VALUES(?,?,?,?)`
            ).bind(crypto.randomUUID(), reader.id,
                await sha256Hex(token), expiresAt).run();
            return json({ ok: true, reader: {
                id: reader.id, username: reader.username, email: reader.email
            }}, 200, { "Set-Cookie": readerCookie(token) });
        }
        return readerError("Rota não encontrada.", 404);
    } catch (error) {
        console.error("Reader API failed:", error instanceof Error ? error.name : "Unknown");
        return readerError("Não foi possível concluir a operação.", 500);
    }
}

// ================================================================
// FORJA — EDIÇÃO DE OBRAS, ESTADO EDITORIAL E AUDITORIA
// ================================================================
const WORK_EDIT_FIELDS = [
    "title", "alternative_title", "slug", "synopsis", "work_type",
    "story_status", "release_year", "author", "artist", "scan_name",
    "age_rating", "is_adult", "is_one_shot", "decensor_type",
    "expected_chapters", "update_days", "reading_style", "image_gap",
    "seo_title", "seo_description"
];

async function workDetailApi(request, env, workId, statusRoute = false) {
    const method = request.method;
    if (!/^[0-9a-f-]{36}$/i.test(workId)) return workError("ID inválido.");
    if (statusRoute ? method !== "POST" : !["GET", "PATCH"].includes(method)) {
        return workError("Método não permitido.", 405);
    }
    if (!env.DB) return workError("Serviço indisponível.", 503);
    if (method !== "GET" && !isSameOrigin(request)) {
        return workError("Origem não autorizada.", 403);
    }
    try {
        const session = await findSession(request, env);
        if (!session) return workError("Não autenticado.", 401);
        if (!["owner", "admin", "moderator"].includes(session.role)) {
            return workError("Acesso negado.", 403);
        }
        const work = await env.DB.prepare(
            `SELECT id,title,alternative_title,slug,synopsis,work_type,
                story_status,publication_status,release_year,author,artist,
                scan_name,age_rating,is_adult,is_one_shot,decensor_type,
                expected_chapters,update_days,reading_style,image_gap,
                seo_title,seo_description,created_at,updated_at
             FROM forja_works WHERE id = ? LIMIT 1`
        ).bind(workId).first();
        if (!work) return workError("Obra não encontrada.", 404);
        if (method === "GET") return json({ ok: true, work });
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return workError(parsed.error, parsed.status);

        if (statusRoute) {
            if (!["owner", "admin"].includes(session.role)) {
                return workError("Somente a administração pode alterar a publicação.", 403);
            }
            const keys = Object.keys(parsed.body);
            const status = parsed.body.publication_status;
            if (keys.length !== 1 || !["draft", "upcoming", "published"].includes(status)) {
                return workError("Situação editorial inválida.");
            }
            const update = env.DB.prepare(
                `UPDATE forja_works SET publication_status = ?,
                    updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).bind(status, session.user_id, workId);
            const audit = env.DB.prepare(
                `INSERT INTO forja_audit_logs
                    (user_id,action,entity_type,entity_id,description,details)
                 VALUES(?,?,?,?,?,?)`
            ).bind(session.user_id, "work.status", "work", workId,
                "Situação editorial alterada.",
                JSON.stringify({ before: work.publication_status, after: status }));
            await env.DB.batch([update, audit]);
            return json({ ok: true, publication_status: status });
        }

        const changes = parsed.body;
        const keys = Object.keys(changes);
        if (!keys.length || keys.some(k => !WORK_EDIT_FIELDS.includes(k))) {
            return workError("Informe somente campos editáveis da obra.");
        }
        const merged = {};
        for (const key of WORK_EDIT_FIELDS) {
            merged[key] = Object.hasOwn(changes, key) ? changes[key] : work[key];
        }
        for (const key of ["is_adult", "is_one_shot"]) {
            if (!Object.hasOwn(changes, key)) merged[key] = work[key] === 1;
        }
        const checked = parseNewWork(merged);
        if (checked.error) return workError(checked.error);
        const w = checked.values;
        const update = env.DB.prepare(
            `UPDATE forja_works SET
              title=?,alternative_title=?,slug=?,synopsis=?,work_type=?,
              story_status=?,release_year=?,author=?,artist=?,scan_name=?,
              age_rating=?,is_adult=?,is_one_shot=?,decensor_type=?,
              expected_chapters=?,update_days=?,reading_style=?,image_gap=?,
              seo_title=?,seo_description=?,updated_by=?,updated_at=CURRENT_TIMESTAMP
             WHERE id=?`
        ).bind(
            w.title,w.alternative_title,w.slug,w.synopsis,w.work_type,
            w.story_status,w.release_year,w.author,w.artist,w.scan_name,
            w.age_rating,w.is_adult,w.is_one_shot,w.decensor_type,
            w.expected_chapters,w.update_days,w.reading_style,w.image_gap,
            w.seo_title,w.seo_description,session.user_id,workId
        );
        const audit = env.DB.prepare(
            `INSERT INTO forja_audit_logs
                (user_id,action,entity_type,entity_id,description,details)
             VALUES(?,?,?,?,?,?)`
        ).bind(session.user_id,"work.update","work",workId,
            "Dados da obra atualizados.",JSON.stringify({ fields: keys }));
        await env.DB.batch([update,audit]);
        return json({ ok: true, message: "Obra atualizada.", work: {
            id: workId, title: w.title, slug: w.slug,
            publication_status: work.publication_status
        }});
    } catch (error) {
        if (/UNIQUE constraint failed: forja_works.slug/i.test(String(error?.message || ""))) {
            return workError("Este endereço de obra já está em uso.", 409);
        }
        console.error("Work detail failed:", error instanceof Error ? error.name : "Unknown");
        return workError("Não foi possível atualizar a obra.", 500);
    }
}

async function auditApi(request, env) {
    if (request.method !== "GET") return workError("Método não permitido.", 405);
    if (!env.DB) return workError("Serviço indisponível.", 503);
    try {
        const session = await findSession(request, env);
        if (!session) return workError("Não autenticado.", 401);
        if (!["owner", "admin", "moderator"].includes(session.role)) {
            return workError("Acesso negado.", 403);
        }
        const rows = await env.DB.prepare(
            `SELECT a.id,a.user_id,u.username,a.action,a.entity_type,
                    a.entity_id,a.description,a.details,a.created_at
             FROM forja_audit_logs a
             LEFT JOIN forja_users u ON u.id=a.user_id
             ORDER BY a.created_at DESC,a.id DESC LIMIT 100`
        ).all();
        return json({ ok: true, logs: rows.results || [] });
    } catch (error) {
        console.error("Audit failed:", error instanceof Error ? error.name : "Unknown");
        return workError("Não foi possível consultar a auditoria.", 500);
    }
}

// ================================================================
// FORJA — GÊNEROS, TAGS, CAPÍTULOS (METADADOS), PUBLICAÇÕES (RASCUNHOS)
// ================================================================
async function taxonomyApi(request, env, type) {
    const table = type === "genres" ? "forja_genres" : "forja_tags";
    if (!["GET", "POST"].includes(request.method)) return workError("Método não permitido.", 405);
    if (!env.DB) return workError("Serviço indisponível.", 503);
    if (request.method === "POST" && !isSameOrigin(request)) return workError("Origem não autorizada.", 403);
    try {
        const session = await findSession(request, env);
        if (!session) return workError("Não autenticado.", 401);
        if (!["owner", "admin", "moderator"].includes(session.role)) return workError("Acesso negado.", 403);
        if (request.method === "GET") {
            const rows = await env.DB.prepare(`SELECT id,name,slug,created_at FROM ${table} ORDER BY name LIMIT 500`).all();
            return json({ ok: true, items: rows.results || [] });
        }
        if (!["owner", "admin"].includes(session.role)) return workError("Somente a administração pode cadastrar.", 403);
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return workError(parsed.error, parsed.status);
        if (Object.keys(parsed.body).some(k => k !== "name")) return workError("Campos inválidos.");
        const name = cleanRequiredText(parsed.body.name, 80);
        if (!name) return workError("Informe o nome.");
        const slug = createWorkSlug(name);
        if (!slug) return workError("Nome inválido.");
        const id = crypto.randomUUID();
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO ${table}(id,name,slug) VALUES(?,?,?)`).bind(id,name,slug),
            env.DB.prepare(`INSERT INTO forja_audit_logs(user_id,action,entity_type,entity_id,description,details) VALUES(?,?,?,?,?,?)`)
                .bind(session.user_id,`${type}.create`,type,id,"Categoria cadastrada.",JSON.stringify({ name }))
        ]);
        return json({ ok: true, item: { id,name,slug } }, 201);
    } catch (error) {
        if (/UNIQUE constraint failed/i.test(String(error?.message || ""))) return workError("Nome já cadastrado.",409);
        console.error("Taxonomy failed:",error instanceof Error ? error.name : "Unknown");
        return workError("Não foi possível processar.",500);
    }
}

async function chaptersApi(request, env) {
    if (!["GET", "POST"].includes(request.method)) return workError("Método não permitido.", 405);
    if (!env.DB) return workError("Serviço indisponível.", 503);
    if (request.method === "POST" && !isSameOrigin(request)) return workError("Origem não autorizada.", 403);
    try {
        const session = await findSession(request, env);
        if (!session) return workError("Não autenticado.", 401);
        if (!["owner", "admin", "moderator"].includes(session.role)) return workError("Acesso negado.", 403);
        if (request.method === "GET") {
            const rows = await env.DB.prepare(`SELECT c.id,c.work_id,w.title AS work_title,
                c.chapter_number,c.chapter_title AS title,c.publication_status AS status,
                c.created_at,c.updated_at FROM forja_chapters c
                JOIN forja_works w ON w.id=c.work_id
                ORDER BY c.created_at DESC,c.id DESC LIMIT 100`).all();
            return json({ok:true,chapters:rows.results||[]});
        }
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return workError(parsed.error,parsed.status);
        const b=parsed.body;
        if (Object.keys(b).some(k=>!["work_id","chapter_number","title"].includes(k))) return workError("Campos inválidos.");
        if (typeof b.work_id!=="string" || !/^[0-9a-f-]{36}$/i.test(b.work_id)) return workError("Obra inválida.");
        if (typeof b.chapter_number!=="number" || !Number.isFinite(b.chapter_number) || b.chapter_number<0 || b.chapter_number>100000) return workError("Número inválido.");
        const number=String(b.chapter_number);
        const title=cleanOptionalText(b.title,200);
        if (title===undefined) return workError("Título inválido.");
        const chapterTitle=title||`Capítulo ${number}`;
        const work=await env.DB.prepare(`SELECT id FROM forja_works WHERE id=? LIMIT 1`).bind(b.work_id).first();
        if (!work) return workError("Obra não encontrada.",404);
        const id=crypto.randomUUID();
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO forja_chapters(id,work_id,chapter_number,chapter_title,publication_status,created_by,updated_by) VALUES(?,?,?,?,'draft',?,?)`).bind(id,b.work_id,number,chapterTitle,session.user_id,session.user_id),
            env.DB.prepare(`INSERT INTO forja_audit_logs(user_id,action,entity_type,entity_id,description,details) VALUES(?,?,?,?,?,?)`).bind(session.user_id,"chapter.create","chapter",id,"Capítulo criado como rascunho.",JSON.stringify({work_id:b.work_id,chapter_number:number}))
        ]);
        return json({ok:true,chapter:{id,work_id:b.work_id,chapter_number:number,title:chapterTitle,status:"draft"}},201);
    } catch(error) {
        if (/UNIQUE constraint failed/i.test(String(error?.message||""))) return workError("Este capítulo já está cadastrado para a obra.",409);
        console.error("Chapters failed:",error instanceof Error?error.name:"Unknown");
        return workError("Não foi possível processar o capítulo.",500);
    }
}

async function publicationsApi(request,env) {
    if (!["GET","POST"].includes(request.method)) return workError("Método não permitido.",405);
    if (!env.DB) return workError("Serviço indisponível.",503);
    if (request.method === "POST" && !isSameOrigin(request)) return workError("Origem não autorizada.",403);
    try {
        const session = await findSession(request,env);
        if (!session) return workError("Não autenticado.",401);
        if (!["owner","admin","moderator"].includes(session.role)) return workError("Acesso negado.",403);
        if (request.method === "GET") {
            const rows = await env.DB.prepare(
                `SELECT id,title,caption,platform,status,created_at,updated_at
                 FROM forja_publications ORDER BY created_at DESC,id DESC LIMIT 100`
            ).all();
            return json({ok:true,publications:rows.results||[]});
        }
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return workError(parsed.error,parsed.status);
        const b = parsed.body;
        if (Object.keys(b).some(k => !["title","caption","platform"].includes(k))) return workError("Campos inválidos.");
        const title = cleanRequiredText(b.title,200);
        const caption = cleanOptionalText(b.caption,4000);
        if (!title || caption === undefined || !["instagram","telegram","both"].includes(b.platform)) return workError("Preencha título, texto e plataforma corretamente.");
        const id = crypto.randomUUID();
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO forja_publications(id,title,caption,platform,created_by) VALUES(?,?,?,?,?)`)
                .bind(id,title,caption,b.platform,session.user_id),
            env.DB.prepare(`INSERT INTO forja_audit_logs(user_id,action,entity_type,entity_id,description,details) VALUES(?,?,?,?,?,?)`)
                .bind(session.user_id,"publication.create","publication",id,"Publicação salva como rascunho.",JSON.stringify({title,platform:b.platform}))
        ]);
        return json({ok:true,publication:{id,title,platform:b.platform,status:"draft"}},201);
    } catch (error) {
        console.error("Publications failed:",error instanceof Error?error.name:"Unknown");
        return workError("Não foi possível salvar a publicação.",500);
    }
}

async function preferencesApi(request, env) {
    if (!["GET","PATCH"].includes(request.method)) return workError("Método não permitido.",405);
    if (!env.DB) return workError("Serviço indisponível.",503);
    if (request.method === "PATCH" && !isSameOrigin(request)) return workError("Origem não autorizada.",403);
    try {
        const session = await findSession(request,env);
        if (!session) return workError("Não autenticado.",401);
        if (!["owner","admin","moderator"].includes(session.role)) return workError("Acesso negado.",403);
        if (request.method === "GET") {
            const rows = await env.DB.prepare(`SELECT key,value,updated_at FROM forja_preferences ORDER BY key LIMIT 100`).all();
            return json({ok:true,preferences:rows.results||[]});
        }
        if (!["owner","admin"].includes(session.role)) return workError("Somente a administração pode alterar configurações.",403);
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return workError(parsed.error,parsed.status);
        const b = parsed.body;
        if (Object.keys(b).length !== 2 || typeof b.key !== "string" ||
            !/^(catalog|social)\.[a-z_]{1,40}$/.test(b.key) ||
            typeof b.value !== "string" || b.value.length > 1000) {
            return workError("Chave ou valor inválido.");
        }
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO forja_preferences(key,value,updated_by) VALUES(?,?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value,
                updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
                .bind(b.key,b.value,session.user_id),
            env.DB.prepare(`INSERT INTO forja_audit_logs(user_id,action,entity_type,entity_id,description,details) VALUES(?,?,?,?,?,?)`)
                .bind(session.user_id,"preferences.update","preferences",b.key,"Preferência atualizada.",JSON.stringify({key:b.key}))
        ]);
        return json({ok:true,message:"Preferência salva."});
    } catch (error) {
        console.error("Preferences failed:",error instanceof Error?error.name:"Unknown");
        return workError("Não foi possível salvar as configurações.",500);
    }
}

// ==========================================
// WORKER PRINCIPAL — ARCANA SCAN
// ==========================================


// ================================================================
// FORJA — MÍDIAS DE OBRAS (R2 PRIVADO) E CLASSIFICAÇÃO
// ================================================================
const WORK_MEDIA_KINDS = new Set(["cover", "banner", "background"]);
const MAX_WORK_IMAGE_BYTES = 8 * 1024 * 1024;

function validImageSignature(bytes, mime) {
    if (mime === "image/png") return bytes.length >= 8 &&
        [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    if (mime === "image/jpeg") return bytes.length >= 3 &&
        bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    if (mime === "image/webp") return bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(0,4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
    return false;
}

async function workMediaApi(request, env, workId, kind) {
    if (!["GET","PUT"].includes(request.method)) return workError("Método não permitido.",405);
    if (!WORK_MEDIA_KINDS.has(kind) || !/^[0-9a-f-]{36}$/i.test(workId)) return workError("Endereço inválido.",400);
    if (!env.DB || !env.MEDIA) return workError("Armazenamento não configurado.",503);
    if (request.method==="PUT" && !isSameOrigin(request)) return workError("Origem não autorizada.",403);
    try {
        const session=await findSession(request,env);
        if (!session) return workError("Não autenticado.",401);
        if (!["owner","admin","moderator"].includes(session.role)) return workError("Acesso negado.",403);
        const work=await env.DB.prepare("SELECT id FROM forja_works WHERE id=? LIMIT 1").bind(workId).first();
        if (!work) return workError("Obra não encontrada.",404);
        const existing=await env.DB.prepare("SELECT r2_key,content_type FROM forja_work_images WHERE work_id=? AND kind=? LIMIT 1").bind(workId,kind).first();
        if (request.method==="GET") {
            if (!existing) return workError("Imagem não encontrada.",404);
            const obj=await env.MEDIA.get(existing.r2_key);
            if (!obj) return workError("Arquivo não encontrado.",404);
            return new Response(obj.body,{headers:{"Content-Type":existing.content_type,
                "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
                "Content-Disposition":"inline"}});
        }
        const mime=(request.headers.get("Content-Type")||"").split(";")[0].toLowerCase();
        if (!["image/jpeg","image/png","image/webp"].includes(mime)) return workError("Use JPG, PNG ou WebP.",415);
        const size=Number(request.headers.get("Content-Length"));
        if (!Number.isSafeInteger(size) || size<12 || size>MAX_WORK_IMAGE_BYTES) return workError("Imagem deve ter até 8 MB.",413);
        const body=await request.arrayBuffer();
        if (body.byteLength!==size || body.byteLength>MAX_WORK_IMAGE_BYTES) return workError("Tamanho de imagem inválido.",413);
        const bytes=new Uint8Array(body);
        if (!validImageSignature(bytes,mime)) return workError("Arquivo de imagem inválido.",415);
        const extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[mime];
        const key=`works/${workId}/${kind}/${crypto.randomUUID()}.${extension}`;
        await env.MEDIA.put(key,body,{httpMetadata:{contentType:mime}});
        try {
            await env.DB.batch([
                env.DB.prepare(`INSERT INTO forja_work_images(work_id,kind,r2_key,content_type,byte_size,updated_by)
                  VALUES(?,?,?,?,?,?) ON CONFLICT(work_id,kind) DO UPDATE SET
                  r2_key=excluded.r2_key,content_type=excluded.content_type,
                  byte_size=excluded.byte_size,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
                  .bind(workId,kind,key,mime,size,session.user_id),
                env.DB.prepare(`INSERT INTO forja_audit_logs(user_id,action,entity_type,entity_id,description,details)
                  VALUES(?,?,?,?,?,?)`).bind(session.user_id,"work.media.update","work",workId,
                  "Imagem da obra atualizada.",JSON.stringify({kind,bytes:size}))
            ]);
        } catch(e) {await env.MEDIA.delete(key).catch(()=>{});throw e;}
        if (existing?.r2_key && existing.r2_key!==key) {
            await env.MEDIA.delete(existing.r2_key).catch(()=>console.error("Old media cleanup failed"));
        }
        return json({ok:true,kind,message:"Imagem salva no R2."});
    } catch(error) {
        console.error("Work media failed:",error instanceof Error?error.name:"Unknown");
        return workError("Não foi possível processar a imagem.",500);
    }
}

async function workTaxonomyApi(request,env,workId) {
    if (!["GET","PUT"].includes(request.method)) return workError("Método não permitido.",405);
    if (!env.DB) return workError("Banco indisponível.",503);
    if (!/^[0-9a-f-]{36}$/i.test(workId)) return workError("Obra inválida.",400);
    if (request.method==="PUT" && !isSameOrigin(request)) return workError("Origem não autorizada.",403);
    try {
        const session=await findSession(request,env);
        if (!session) return workError("Não autenticado.",401);
        if (!["owner","admin","moderator"].includes(session.role)) return workError("Acesso negado.",403);
        const work=await env.DB.prepare("SELECT id FROM forja_works WHERE id=? LIMIT 1").bind(workId).first();
        if (!work) return workError("Obra não encontrada.",404);
        if (request.method==="GET") {
            const [genres,tags,images]=await Promise.all([
                env.DB.prepare("SELECT genre_id AS id FROM forja_work_genres WHERE work_id=?").bind(workId).all(),
                env.DB.prepare("SELECT tag_id AS id FROM forja_work_tags WHERE work_id=?").bind(workId).all(),
                env.DB.prepare("SELECT kind FROM forja_work_images WHERE work_id=?").bind(workId).all()
            ]);
            return json({ok:true,genres:(genres.results||[]).map(x=>x.id),
                tags:(tags.results||[]).map(x=>x.id),images:(images.results||[]).map(x=>x.kind)});
        }
        const parsed=await readJsonBody(request);
        if (!parsed.ok) return workError(parsed.error,parsed.status);
        const b=parsed.body;
        if (Object.keys(b).some(k=>!["genres","tags"].includes(k)) ||
            !Array.isArray(b.genres)||!Array.isArray(b.tags)) return workError("Seleção inválida.");
        for(const ids of [b.genres,b.tags]) {
            if(ids.length>50 || new Set(ids).size!==ids.length ||
                ids.some(id=>typeof id!=="string" || !/^[0-9a-f-]{36}$/i.test(id))) return workError("Seleção inválida.");
        }
        // Verificar os IDs antes de executar a transação de substituição.
        for(const [ids,table] of [[b.genres,"forja_genres"],[b.tags,"forja_tags"]]) {
            if(ids.length) {
                const placeholders=ids.map(()=>"?").join(",");
                const result=await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).first();
                if(Number(result?.total)!==ids.length) return workError("Há gêneros ou tags inexistentes.",400);
            }
        }
        const queries=[
            env.DB.prepare("DELETE FROM forja_work_genres WHERE work_id=?").bind(workId),
            env.DB.prepare("DELETE FROM forja_work_tags WHERE work_id=?").bind(workId)
        ];
        for(const id of b.genres) queries.push(env.DB.prepare("INSERT INTO forja_work_genres(work_id,genre_id) VALUES(?,?)").bind(workId,id));
        for(const id of b.tags) queries.push(env.DB.prepare("INSERT INTO forja_work_tags(work_id,tag_id) VALUES(?,?)").bind(workId,id));
        queries.push(env.DB.prepare(`INSERT INTO forja_audit_logs(user_id,action,entity_type,entity_id,description,details) VALUES(?,?,?,?,?,?)`)
            .bind(session.user_id,"work.taxonomy.update","work",workId,"Classificação da obra atualizada.",JSON.stringify({genre_count:b.genres.length,tag_count:b.tags.length})));
        await env.DB.batch(queries);
        return json({ok:true,message:"Gêneros e tags salvos."});
    } catch(error) {
        console.error("Work taxonomy failed:",error instanceof Error?error.name:"Unknown");
        return workError("Não foi possível salvar a classificação.",500);
    }
}

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
        // BIBLIOTECA DE OBRAS
        // ======================================

        // Mídias e classificação do cadastro completo (rotas específicas antes de works/:id)
        const mediaMatch=url.pathname.match(/^\/api\/forja\/works\/([0-9a-f-]{36})\/media\/(cover|banner|background)$/i);
        if (mediaMatch) return workMediaApi(request,env,mediaMatch[1],mediaMatch[2]);
        const taxMatch=url.pathname.match(/^\/api\/forja\/works\/([0-9a-f-]{36})\/taxonomy$/i);
        if (taxMatch) return workTaxonomyApi(request,env,taxMatch[1]);

        if (url.pathname === "/api/forja/works") {
            return worksApi(request, env);
        }

        // ======================================
        // CONSELHO DA EQUIPE — SOMENTE OWNER
        // ======================================

        if (url.pathname === "/api/forja/users") {
            return usersApi(request, env);
        }
        const userMatch = url.pathname.match(/^\/api\/forja\/users\/([0-9a-f-]{36})$/i);
        if (userMatch) {
            return usersApi(request, env, userMatch[1]);
        }

        // ======================================
        // LEITORES — SESSÕES SEPARADAS DA FORJA
        // ======================================
        const readerMatch = url.pathname.match(/^\/api\/reader\/(register|login|me|logout)$/);
        if (readerMatch) return readerApi(request, env, readerMatch[1]);

        // ======================================
        // FORJA — EDIÇÃO E PUBLICAÇÃO CONTROLADA
        // ======================================
        const statusMatch = url.pathname.match(/^\/api\/forja\/works\/([0-9a-f-]{36})\/status$/i);
        if (statusMatch) return workDetailApi(request, env, statusMatch[1], true);
        const detailMatch = url.pathname.match(/^\/api\/forja\/works\/([0-9a-f-]{36})$/i);
        if (detailMatch) return workDetailApi(request, env, detailMatch[1]);
        if (url.pathname === "/api/forja/audit") return auditApi(request, env);
        if (url.pathname === "/api/forja/genres") return taxonomyApi(request, env, "genres");
        if (url.pathname === "/api/forja/tags") return taxonomyApi(request, env, "tags");
        if (url.pathname === "/api/forja/chapters") return chaptersApi(request, env);
        if (url.pathname === "/api/forja/publications") return publicationsApi(request, env);
        if (url.pathname === "/api/forja/preferences") return preferencesApi(request, env);
        if (url.pathname.startsWith("/api/reader/")) {
            return readerError("Rota não encontrada.", 404);
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

        // Entrega os arquivos HTML, CSS, JS e imagens
        // do site através do Cloudflare Assets.
        if (env.ASSETS) {
            return env.ASSETS.fetch(request);
        }

        return json(
            {
                ok: false,
                error: "Arquivos do site indisponíveis."
            },
            503
        );
    }
};
