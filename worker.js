
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
        // BIBLIOTECA DE OBRAS
        // ======================================

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
