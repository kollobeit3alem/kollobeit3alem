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
// التحسين 1: التحقق من Google JWT محلياً بدون طلب HTTP خارجي في كل لوجن
// المفاتيح العامة تُكاش في KV لمدة 6 ساعات — طلب HTTP واحد فقط كل 6 ساعات
// ============================================================================
async function verifyGoogleTokenLocally(token, env) {
  try {
    // فك تشفير الـ header لجلب الـ kid
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');

    const headerB64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');

    const header = JSON.parse(atob(headerB64));
    const payload = JSON.parse(atob(payloadB64));

    // التحقق السريع من البيانات الأساسية أولاً (بدون طلب HTTP)
    const CLIENT_ID = "543687035134-d64j2ncr5bcfuv7s9e61psp7qb2dj276.apps.googleusercontent.com";

    if (payload.aud !== CLIENT_ID) {
      throw new Error('Invalid audience');
    }
    if (payload.exp <= Date.now() / 1000) {
      throw new Error('Token expired');
    }
    if (String(payload.email_verified) !== 'true') {
      throw new Error('Email not verified');
    }
    if (!payload.email || !payload.sub) {
      throw new Error('Missing required fields');
    }

    // جلب مفاتيح جوجل العامة من KV أولاً (مجاني)، وإذا لم توجد نجلبها من جوجل مرة واحدة
    let jwks = null;
    if (env.COURSES_CACHE) {
      const cached = await env.COURSES_CACHE.get('google_jwks', { type: 'json' });
      if (cached) {
        jwks = cached;
      }
    }

    if (!jwks) {
      // طلب HTTP لجوجل مرة واحدة فقط كل 6 ساعات لكل المستخدمين
      const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      if (!res.ok) throw new Error('Failed to fetch Google public keys');
      jwks = await res.json();
      // نخزنهم في KV لمدة 6 ساعات (21600 ثانية)
      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put('google_jwks', JSON.stringify(jwks), { expirationTtl: 21600 });
      }
    }

    // إيجاد المفتاح المناسب بالـ kid
    const jwk = jwks.keys ? jwks.keys.find(k => k.kid === header.kid) : null;
    if (!jwk) {
      // لو المفتاح مش موجود ربما تحدّثت المفاتيح، نجدد الكاش ونحاول مرة أخرى
      const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      if (!res.ok) throw new Error('Failed to refresh Google public keys');
      jwks = await res.json();
      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put('google_jwks', JSON.stringify(jwks), { expirationTtl: 21600 });
      }
      const refreshedJwk = jwks.keys ? jwks.keys.find(k => k.kid === header.kid) : null;
      if (!refreshedJwk) throw new Error('Key not found even after refresh');
      jwks = { keys: [refreshedJwk] };
    }

    const targetJwk = jwks.keys ? jwks.keys.find(k => k.kid === header.kid) : jwks;

    // التحقق من التوقيع الرقمي باستخدام Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      targetJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const encoder = new TextEncoder();
    const signedData = encoder.encode(`${parts[0]}.${parts[1]}`);
    const sigB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const sigBytes = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));

    const isValid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      cryptoKey,
      sigBytes,
      signedData
    );

    if (!isValid) throw new Error('Invalid signature');

    return payload;
  } catch (e) {
    console.error('Google token local verification failed:', e.message);
    return null;
  }
}

// ============================================================================
// التحسين 2: التحقق من الجلسة من KV بدلاً من D1
// يوفر ملايين الـ SELECT على قاعدة البيانات يومياً
// ============================================================================

// دالة للتحقق من صلاحيات الإدارة
export async function verifyAdmin(request, env) {
  let token = null;
  const authHeader = request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else {
    const cookieHeader = request.headers.get("Cookie") || "";
    const tokenCookie = cookieHeader.split("; ").find(row => row.startsWith("auth_token="));
    if (tokenCookie) {
      token = tokenCookie.split("=")[1];
    }
  }

  if (!token) return null;

  try {
    const sessionData = await verifyJWT(token, env.JWT_SECRET);
    if (!sessionData || sessionData.exp < Date.now()) return null;

    // التحسين: نقرأ من KV أولاً — أسرع بكثير من D1
    if (env.COURSES_CACHE) {
      const cached = await env.COURSES_CACHE.get(`session:${sessionData.userId}`, { type: 'json' });
      if (cached && cached.sessionId === sessionData.sessionId) {
        if (cached.role === 'admin' || cached.role === 'instructor' || cached.role === 'assistant') {
          return { id: sessionData.userId, role: cached.role };
        }
        return null;
      }
    }

    // Fallback: لو KV فاضلة نقرأ من D1 (مثلاً أول لوجن قبل ما الكاش يتملى)
    const user = await env.DB.prepare("SELECT id, role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();

    if (!user) return null;
    if (user.session_id !== sessionData.sessionId) return null;
    if (user.role === 'admin' || user.role === 'instructor' || user.role === 'assistant') {
      // نحفظ في KV للمرة الجاية
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

// دالة للتحقق من جلسة الطالب
export async function verifyStudentSession(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return { error: "Unauthorized", status: 401 };

  try {
    const token = authHeader.split(" ")[1];
    const sessionData = await verifyJWT(token, env.JWT_SECRET);

    if (!sessionData || sessionData.exp < Date.now()) {
      return { error: "Session Expired", status: 401 };
    }

    // التحسين: نقرأ من KV أولاً
    if (env.COURSES_CACHE) {
      const cached = await env.COURSES_CACHE.get(`session:${sessionData.userId}`, { type: 'json' });
      if (cached && cached.sessionId === sessionData.sessionId) {
        return { userId: sessionData.userId, role: cached.role };
      }
      // لو الـ session_id مختلف يعني اتسجل من جهاز تاني
      if (cached && cached.sessionId !== sessionData.sessionId) {
        return { error: "تم تسجيل الدخول من جهاز آخر. يرجى تسجيل الدخول مجدداً.", status: 403, invalidSession: true };
      }
    }

    // Fallback: D1 لو KV فاضلة
    const user = await env.DB.prepare("SELECT role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();

    if (!user || user.session_id !== sessionData.sessionId) {
      return { error: "تم تسجيل الدخول من جهاز آخر. يرجى تسجيل الدخول مجدداً.", status: 403, invalidSession: true };
    }

    // نحفظ في KV للمرات الجاية
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

  if (path === "/api/auth/google" && request.method === "POST") {
    const body = await request.json();
    const googleToken = body.credential;

    if (!googleToken) {
      return new Response(JSON.stringify({ error: "التوكن مطلوب" }), {
        status: 400, headers: { "Content-Type": "application/json", ...ch }
      });
    }

    // التحسين: التحقق المحلي من توكن جوجل بدون طلب HTTP خارجي في كل لوجن
    const payload = await verifyGoogleTokenLocally(googleToken, env);

    if (!payload) {
      return new Response(JSON.stringify({ error: "فشل التحقق من هوية جوجل" }), {
        status: 401, headers: { "Content-Type": "application/json", ...ch }
      });
    }

    const email = payload.email;
    const name = payload.name;
    const avatarUrl = payload.picture;
    const googleId = payload.sub;

    const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();

    if (!user) {
      const insertInfo = await env.DB.prepare(
        "INSERT INTO users (google_id, name, email, avatar_url, session_id, wallet_balance) VALUES (?, ?, ?, ?, ?, 0) RETURNING *"
      ).bind(googleId, name, email, avatarUrl, newSessionId).first();
      user = insertInfo;
    } else {
      await env.DB.prepare("UPDATE users SET session_id = ? WHERE id = ?").bind(newSessionId, user.id).run();
      user.session_id = newSessionId;
    }

    // التحسين: نحفظ الجلسة في KV فوراً عند اللوجن لكل الطلبات الجاية
    if (env.COURSES_CACHE) {
      await env.COURSES_CACHE.put(
        `session:${user.id}`,
        JSON.stringify({ sessionId: newSessionId, role: user.role }),
        { expirationTtl: 86400 }
      );
    }

    const sessionToken = await signJWT({
      userId: user.id,
      role: user.role,
      sessionId: newSessionId,
      exp: Date.now() + 86400000
    }, env.JWT_SECRET);

    return new Response(JSON.stringify({ success: true, token: sessionToken, user }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `auth_token=${sessionToken}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly; Secure`,
        ...ch
      }
    });
  }

  return null;
}
