import { corsHeaders } from './utils.js';

// إعدادات التشفير
const JWT_ALGORITHM = { name: "HMAC", hash: "SHA-256" };

// ==========================================
// دالة مساعدة لتوليد توكن JWT (توقيع رقمي)
// ==========================================
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

// ==========================================
// دالة مساعدة للتحقق من توكن JWT
// ==========================================
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

// ==========================================
// 1. دالة التحقق من صلاحيات الإدارة والجلسة الأحادية (المحدثة)
// ==========================================
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
    // التحقق من التوقيع الرقمي للتوكن باستخدام المفتاح السري
    const sessionData = await verifyJWT(token, env.JWT_SECRET);
    if (!sessionData || sessionData.exp < Date.now()) return null;
    
    // جلب بيانات المستخدم للتأكد من الرتبة ومن أن الجلسة لم تتغير
    const user = await env.DB.prepare("SELECT id, role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();
    
    if (!user) return null;
    
    // حماية الجلسة الأحادية (Single Session)
    if (user.session_id !== sessionData.sessionId) {
      return null; 
    }
    
    // الصلاحيات الإدارية
    if (user.role === 'admin' || user.role === 'instructor' || user.role === 'assistant') {
      return user;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ==========================================
// 2. دالة التحقق من جلسة الطالب (المحدثة)
// ==========================================
export async function verifyStudentSession(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return { error: "Unauthorized", status: 401 };
  
  try {
    const token = authHeader.split(" ")[1];
    
    // التحقق من التوقيع الرقمي للتوكن
    const sessionData = await verifyJWT(token, env.JWT_SECRET);
    
    if (!sessionData || sessionData.exp < Date.now()) {
      return { error: "Session Expired", status: 401 };
    }

    const user = await env.DB.prepare("SELECT role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();
    
    if (!user || user.session_id !== sessionData.sessionId) {
      return { error: "تم تسجيل الدخول من جهاز آخر. يرجى تسجيل الدخول مجدداً.", status: 403, invalidSession: true };
    }

    return { userId: sessionData.userId, role: user.role };
  } catch (e) {
    return { error: "Invalid Token", status: 401 };
  }
}

// ==========================================
// 3. موجه مسارات المصادقة (تأمين تسجيل دخول جوجل)
// ==========================================
export async function handleAuthRoutes(request, env, path, url) {
  
  if (path === "/api/auth/google" && request.method === "POST") {
    const body = await request.json();
    const googleToken = body.credential;
    
    // --- التحقق الأمني من توكن جوجل عبر API جوجل الرسمي ---
    const googleVerifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${googleToken}`);
    if (!googleVerifyRes.ok) {
      return new Response(JSON.stringify({ error: "فشل التحقق من هوية جوجل" }), { 
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    const payload = await googleVerifyRes.json();
    
    // التأكد من أن التوكن موجه فعلاً لتطبيقك (Audience Check)
    const CLIENT_ID = "543687035134-d64j2ncr5bcfuv7s9e61psp7qb2dj276.apps.googleusercontent.com";
    if (payload.aud !== CLIENT_ID) {
       return new Response(JSON.stringify({ error: "توكن غير صالح" }), { 
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    const email = payload.email;
    const name = payload.name;
    const avatarUrl = payload.picture;
    const googleId = payload.sub;

    // توليد معرّف جلسة عشوائي فريد للطرد التلقائي للأجهزة الأخرى
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

    // --- توليد توكن JWT مشفر وموقع رقمياً ---
    const sessionToken = await signJWT({ 
      userId: user.id, 
      role: user.role, // الرتبة هنا محمية بالتوقيع الرقمي ولا يمكن تزويرها
      sessionId: newSessionId,
      exp: Date.now() + 86400000 // صالح لمدة 24 ساعة
    }, env.JWT_SECRET);

    return new Response(JSON.stringify({ success: true, token: sessionToken, user }), {
      headers: { 
        "Content-Type": "application/json",
        "Set-Cookie": `auth_token=${sessionToken}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly; Secure`,
        ...corsHeaders 
      }
    });
  }

  return null;
}
