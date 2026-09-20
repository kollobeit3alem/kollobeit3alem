import { getCorsHeaders, corsHeaders } from './utils.js';

// ============================================================================
// إعدادات التشفير
// ============================================================================
const JWT_ALGORITHM = { name: "HMAC", hash: "SHA-256" };

// ============================================================================
// دالة مساعدة لتوليد توكن JWT
// ============================================================================
async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    JWT_ALGORITHM,
    false,
    ["sign"]
  );

  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "");
  const data = btoa(JSON.stringify(payload)).replace(/=/g, "");

  const signatureBuffer = await crypto.subtle.sign(
    JWT_ALGORITHM,
    key,
    encoder.encode(`${header}.${data}`)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${header}.${data}.${signature}`;
}

// ============================================================================
// دالة مساعدة للتحقق من توكن JWT
// ============================================================================
async function verifyJWT(token, secret) {
  try {
    const [header, data, signature] = token.split(".");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      JWT_ALGORITHM,
      false,
      ["verify"]
    );

    const signatureBytes = new Uint8Array(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => c.charCodeAt(0))
    );

    const isValid = await crypto.subtle.verify(
      JWT_ALGORITHM,
      key,
      signatureBytes,
      encoder.encode(`${header}.${data}`)
    );

    if (!isValid) return null;

    return JSON.parse(atob(data));
  } catch (e) {
    return null;
  }
}

// ============================================================================
// التحقق من Google JWT محلياً
// نجلب مفاتيح Google العامة من KV لو موجودة، لو لأ نجيبها من Google مباشرة
// ونخزنها في KV لـ 6 ساعات عشان منطلبش Google في كل تسجيل دخول
// ============================================================================
async function verifyGoogleTokenLocally(token, env) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');

    const headerB64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');

    const header = JSON.parse(atob(headerB64));
    const payload = JSON.parse(atob(payloadB64));

    const CLIENT_ID = "543687035134-d64j2ncr5bcfuv7s9e61psp7qb2dj276.apps.googleusercontent.com";

    if (payload.aud !== CLIENT_ID) throw new Error('Invalid audience');
    if (payload.exp <= Date.now() / 1000) throw new Error('Token expired');
    if (String(payload.email_verified) !== 'true') throw new Error('Email not verified');

    let jwks = null;
    if (env.COURSES_CACHE) {
      const cached = await env.COURSES_CACHE.get('google_jwks', { type: 'json' });
      if (cached) jwks = cached;
    }

    if (!jwks) {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      jwks = await res.json();
      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put('google_jwks', JSON.stringify(jwks), { expirationTtl: 21600 });
      }
    }

    const jwk = jwks.keys.find(k => k.kid === header.kid);
    const cryptoKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );

    const encoder = new TextEncoder();
    const signedData = encoder.encode(`${parts[0]}.${parts[1]}`);
    const sigB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const sigBytes = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));

    const isValid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, sigBytes, signedData);
    if (!isValid) throw new Error('Invalid signature');

    return payload;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// دالة توليد Session ID آمن
// نستخدم crypto.randomUUID بدل Math.random عشان نضمن عشوائية حقيقية
// Math.random مش مناسب للأمان لأن ممكن يتوقع
// ============================================================================
function generateSecureSessionId() {
  const uuid1 = crypto.randomUUID().replace(/-/g, '');
  const uuid2 = crypto.randomUUID().replace(/-/g, '');
  return uuid1 + uuid2;
}

// ============================================================================
// دالة Rate Limiting الداخلية للمصادقة
// منفصلة عن الـ rate limiter في _worker.js عشان نتحكم فيها بشكل أدق
// بتحسب عدد المحاولات لكل IP أو لكل email في نافذة زمنية محددة
// ============================================================================
async function checkAuthRateLimit(env, identifier, maxAttempts, windowSeconds) {
  if (!env.COURSES_CACHE) {
    return { allowed: true };
  }

  try {
    const key = `auth_rl:${identifier}`;
    const currentValue = await env.COURSES_CACHE.get(key);
    const currentCount = currentValue ? parseInt(currentValue) : 0;

    if (currentCount >= maxAttempts) {
      return { allowed: false, retryAfter: windowSeconds, attempts: currentCount };
    }

    if (currentCount === 0) {
      await env.COURSES_CACHE.put(key, "1", { expirationTtl: windowSeconds });
    } else {
      await env.COURSES_CACHE.put(key, String(currentCount + 1), { expirationTtl: windowSeconds });
    }

    return { allowed: true, remaining: maxAttempts - currentCount - 1 };
  } catch (e) {
    console.error("[AuthRateLimit] KV Error:", e.message);
    return { allowed: true };
  }
}

// ============================================================================
// دالة تسجيل محاولات تسجيل الدخول الفاشلة
// بنسجل في KV عشان نقدر نراقب ونحلل الهجمات
// ============================================================================
async function logFailedLoginAttempt(env, ip, email, reason) {
  if (!env.COURSES_CACHE) return;

  try {
    const timestamp = new Date().toISOString();
    const logKey = `failed_login:${ip}:${timestamp}`;
    const logData = JSON.stringify({ ip, email: email || 'unknown', reason, timestamp });
    // نحتفظ بالسجل لمدة ساعة واحدة
    await env.COURSES_CACHE.put(logKey, logData, { expirationTtl: 3600 });
  } catch (e) {
    // لو فشل التسجيل مش مشكلة، الأهم إن الـ rate limit شغال
  }
}

// ============================================================================
// التحقق من صلاحيات الإدارة
// بيجيب التوكن من الـ Authorization header أو من الـ Cookie
// بيتحقق من الـ KV أولاً عشان يتجنب query على DB في كل طلب
// ============================================================================
export async function verifyAdmin(request, env) {
  let token = null;
  const authHeader = request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else {
    const cookieHeader = request.headers.get("Cookie") || "";
    const tokenCookie = cookieHeader.split("; ").find(row => row.startsWith("auth_token="));
    if (tokenCookie) token = tokenCookie.split("=")[1];
  }

  if (!token) return null;

  try {
    const sessionData = await verifyJWT(token, env.JWT_SECRET);
    if (!sessionData || sessionData.exp < Date.now()) return null;

    // نحاول نجيب البيانات من KV أولاً عشان نوفر query على DB
    if (env.COURSES_CACHE) {
      const cached = await env.COURSES_CACHE.get(`session:${sessionData.userId}`, { type: 'json' });
      if (cached && cached.sessionId === sessionData.sessionId) {
        if (['admin', 'instructor', 'assistant'].includes(cached.role)) {
          return { id: sessionData.userId, role: cached.role };
        }
        return null;
      }
    }

    // لو مش في KV نروح للـ DB ونحدث KV
    const user = await env.DB.prepare("SELECT id, role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();
    if (!user || user.session_id !== sessionData.sessionId) return null;

    if (['admin', 'instructor', 'assistant'].includes(user.role)) {
      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put(
          `session:${user.id}`,
          JSON.stringify({ sessionId: user.session_id, role: user.role }),
          { expirationTtl: 86400 }
        );
      }
      return user;
    }

    return null;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// التحقق من جلسة الطالب
// نفس منطق verifyAdmin بس للطلاب العاديين
// بترجع userId و role لو الجلسة صحيحة
// بترجع error object لو فيه مشكلة مع السبب
// ============================================================================
export async function verifyStudentSession(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return { error: "Unauthorized", status: 401 };

  try {
    const token = authHeader.split(" ")[1];
    const sessionData = await verifyJWT(token, env.JWT_SECRET);

    if (!sessionData || sessionData.exp < Date.now()) return { error: "Session Expired", status: 401 };

    // نحاول نجيب البيانات من KV أولاً عشان نوفر query على DB
    if (env.COURSES_CACHE) {
      const cached = await env.COURSES_CACHE.get(`session:${sessionData.userId}`, { type: 'json' });
      if (cached && cached.sessionId === sessionData.sessionId) {
        return { userId: sessionData.userId, role: cached.role };
      }
      if (cached && cached.sessionId !== sessionData.sessionId) {
        // الجلسة اتغيرت — يعني الطالب سجل دخول من جهاز تاني
        return { error: "تم تسجيل الدخول من جهاز آخر.", status: 403, invalidSession: true };
      }
    }

    // لو مش في KV نروح للـ DB
    const user = await env.DB.prepare("SELECT role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();
    if (!user || user.session_id !== sessionData.sessionId) {
      return { error: "تم تسجيل الدخول من جهاز آخر.", status: 403, invalidSession: true };
    }

    // نحدث KV عشان المرة الجاية متروحش للـ DB
    if (env.COURSES_CACHE) {
      await env.COURSES_CACHE.put(
        `session:${sessionData.userId}`,
        JSON.stringify({ sessionId: user.session_id, role: user.role }),
        { expirationTtl: 86400 }
      );
    }

    return { userId: sessionData.userId, role: user.role };
  } catch (e) {
    return { error: "Invalid Token", status: 401 };
  }
}

// ============================================================================
// موجه مسارات المصادقة
// ============================================================================
export async function handleAuthRoutes(request, env, path, url) {
  const ch = getCorsHeaders(request, env);

  // --------------------------------------------------------------------------
  // مسار تسجيل الدخول بـ Google
  // --------------------------------------------------------------------------
  if (path === "/api/auth/google" && request.method === "POST") {

    // نجيب الـ IP عشان نطبق rate limit على مستوى المصادقة أيضاً
    // (فوق الـ rate limit العام اللي في _worker.js)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Rate limit على مستوى IP — 10 محاولات في الدقيقة لكل IP
    // هذا الحد الثاني بعد الحد العام في _worker.js — طبقة حماية إضافية
    const ipRateCheck = await checkAuthRateLimit(env, `ip:${clientIP}`, 10, 60);
    if (!ipRateCheck.allowed) {
      await logFailedLoginAttempt(env, clientIP, null, 'IP rate limit exceeded');
      return new Response(
        JSON.stringify({ error: "محاولات تسجيل دخول كتير من نفس الجهاز، استنى دقيقة وحاول تاني." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(ipRateCheck.retryAfter),
            ...ch
          }
        }
      );
    }

    // نقرأ الـ body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "طلب غير صحيح، تأكد من إرسال البيانات بشكل صحيح." }),
        { status: 400, headers: { "Content-Type": "application/json", ...ch } }
      );
    }

    const googleToken = body.credential;

    if (!googleToken) {
      return new Response(
        JSON.stringify({ error: "التوكن مطلوب" }),
        { status: 400, headers: { "Content-Type": "application/json", ...ch } }
      );
    }

    // نتحقق من صحة التوكن مع Google
    const payload = await verifyGoogleTokenLocally(googleToken, env);
    if (!payload) {
      await logFailedLoginAttempt(env, clientIP, null, 'Invalid Google token');
      return new Response(
        JSON.stringify({ error: "فشل التحقق من هوية جوجل" }),
        { status: 401, headers: { "Content-Type": "application/json", ...ch } }
      );
    }

    // Rate limit إضافي على مستوى الـ email — 5 محاولات في الدقيقة لكل email
    // ده بيمنع حد يجرب يسجل دخول بنفس الـ email من IPs مختلفة
    const emailRateCheck = await checkAuthRateLimit(env, `email:${payload.email}`, 5, 60);
    if (!emailRateCheck.allowed) {
      await logFailedLoginAttempt(env, clientIP, payload.email, 'Email rate limit exceeded');
      return new Response(
        JSON.stringify({ error: "محاولات كتير على هذا الحساب، استنى دقيقة وحاول تاني." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(emailRateCheck.retryAfter),
            ...ch
          }
        }
      );
    }

    // نولد Session ID آمن باستخدام crypto.randomUUID بدل Math.random
    const newSessionId = generateSecureSessionId();

    // نجيب المستخدم من DB أو ننشئه لو مش موجود
    let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(payload.email).first();

    if (!user) {
      // مستخدم جديد — ننشئ حساب له
      const insertInfo = await env.DB.prepare(
        "INSERT INTO users (google_id, name, email, avatar_url, session_id) VALUES (?, ?, ?, ?, ?) RETURNING *"
      ).bind(payload.sub, payload.name, payload.email, payload.picture, newSessionId).first();
      user = insertInfo;
    } else {
      // مستخدم موجود — نحدث الـ session ID
      await env.DB.prepare("UPDATE users SET session_id = ? WHERE id = ?").bind(newSessionId, user.id).run();
      user.session_id = newSessionId;
    }

    // نحدث KV بالجلسة الجديدة
    if (env.COURSES_CACHE) {
      await env.COURSES_CACHE.put(
        `session:${user.id}`,
        JSON.stringify({ sessionId: newSessionId, role: user.role }),
        { expirationTtl: 86400 }
      );
    }

    // نولد JWT token للمستخدم
    const sessionToken = await signJWT(
      {
        userId: user.id,
        role: user.role,
        sessionId: newSessionId,
        exp: Date.now() + 86400000
      },
      env.JWT_SECRET
    );

    return new Response(
      JSON.stringify({ success: true, token: sessionToken, user }),
      {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `auth_token=${sessionToken}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly; Secure`,
          ...ch
        }
      }
    );
  }

  // --------------------------------------------------------------------------
  // مسار تسجيل الخروج
  // بيمسح الجلسة من KV ومن DB عشان نمنع استخدام التوكن القديم
  // --------------------------------------------------------------------------
  if (path === "/api/auth/logout" && request.method === "POST") {
    try {
      const authHeader = request.headers.get("Authorization");

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        const sessionData = await verifyJWT(token, env.JWT_SECRET);

        if (sessionData && sessionData.userId) {
          // نمسح الجلسة من KV
          if (env.COURSES_CACHE) {
            await env.COURSES_CACHE.delete(`session:${sessionData.userId}`);
          }

          // نمسح الـ session_id من DB عشان نبطل أي توكن قديم
          await env.DB.prepare("UPDATE users SET session_id = NULL WHERE id = ?")
            .bind(sessionData.userId)
            .run();
        }
      }
    } catch (e) {
      // حتى لو حصل خطأ نرجع success — الأهم إن الكوكي اتمسح من المتصفح
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          "Content-Type": "application/json",
          // نمسح الكوكي من المتصفح بتحديد Max-Age=0
          "Set-Cookie": "auth_token=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure",
          ...ch
        }
      }
    );
  }

  // --------------------------------------------------------------------------
  // مسار التحقق من صحة الجلسة الحالية
  // الفرونت ممكن يستخدمه عشان يتأكد إن التوكن لسه شغال من غير ما يعمل طلب تاني
  // --------------------------------------------------------------------------
  if (path === "/api/auth/verify" && request.method === "GET") {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ valid: false, error: "No token provided" }),
        { status: 401, headers: { "Content-Type": "application/json", ...ch } }
      );
    }

    try {
      const token = authHeader.split(" ")[1];
      const sessionData = await verifyJWT(token, env.JWT_SECRET);

      if (!sessionData || sessionData.exp < Date.now()) {
        return new Response(
          JSON.stringify({ valid: false, error: "Token expired" }),
          { status: 401, headers: { "Content-Type": "application/json", ...ch } }
        );
      }

      // نتحقق من الجلسة في KV أولاً
      if (env.COURSES_CACHE) {
        const cached = await env.COURSES_CACHE.get(`session:${sessionData.userId}`, { type: 'json' });
        if (cached && cached.sessionId === sessionData.sessionId) {
          return new Response(
            JSON.stringify({ valid: true, userId: sessionData.userId, role: cached.role }),
            { headers: { "Content-Type": "application/json", ...ch } }
          );
        }
        if (cached && cached.sessionId !== sessionData.sessionId) {
          return new Response(
            JSON.stringify({ valid: false, error: "Session invalidated", invalidSession: true }),
            { status: 403, headers: { "Content-Type": "application/json", ...ch } }
          );
        }
      }

      // لو مش في KV نروح للـ DB
      const user = await env.DB.prepare("SELECT id, role, session_id FROM users WHERE id = ?")
        .bind(sessionData.userId)
        .first();

      if (!user || user.session_id !== sessionData.sessionId) {
        return new Response(
          JSON.stringify({ valid: false, error: "Session invalidated", invalidSession: true }),
          { status: 403, headers: { "Content-Type": "application/json", ...ch } }
        );
      }

      // نحدث KV
      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put(
          `session:${user.id}`,
          JSON.stringify({ sessionId: user.session_id, role: user.role }),
          { expirationTtl: 86400 }
        );
      }

      return new Response(
        JSON.stringify({ valid: true, userId: user.id, role: user.role }),
        { headers: { "Content-Type": "application/json", ...ch } }
      );

    } catch (e) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...ch } }
      );
    }
  }

  return null;
}
