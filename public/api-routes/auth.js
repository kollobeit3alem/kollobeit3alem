import { corsHeaders } from './utils.js';

// ==========================================
// 1. دالة التحقق من صلاحيات الإدارة والجلسة الأحادية
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
    const sessionData = JSON.parse(atob(token));
    if (sessionData.exp < Date.now()) return null;
    
    // التحقق من session_id بالإضافة للصلاحيات
    const user = await env.DB.prepare("SELECT id, role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();
    
    if (!user) return null;
    
    // التحقق من الجلسة الأحادية (طرد الجهاز القديم)
    if (user.session_id !== sessionData.sessionId) {
      return null; // التوكن غير صالح لأن الجلسة تغيرت
    }
    
    // السماح للمدير، المعلم، والمتابع (المساعد) بالدخول للوحة
    if (user.role === 'admin' || user.role === 'instructor' || user.role === 'assistant') {
      return user;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ==========================================
// 2. دالة التحقق من جلسة الطالب
// ==========================================
export async function verifyStudentSession(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return { error: "Unauthorized", status: 401 };
  
  try {
    const token = authHeader.split(" ")[1];
    const sessionData = JSON.parse(atob(token));
    
    if (sessionData.exp < Date.now()) return { error: "Session Expired", status: 401 };

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
// 3. موجه مسارات المصادقة (التسجيل وإنشاء الجلسة)
// ==========================================
export async function handleAuthRoutes(request, env, path, url) {
  
  // --- مسار تسجيل الدخول بجوجل (إنشاء الجلسة الأحادية) ---
  if (path === "/api/auth/google" && request.method === "POST") {
    const body = await request.json();
    const googleToken = body.credential;
    
    const payloadBase64Url = googleToken.split('.')[1];
    const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(payloadBase64));

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const avatarUrl = payload.picture;

    // توليد معرّف جلسة عشوائي فريد
    const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    let user = await env.DB.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).bind(email).first();

    if (!user) {
      // مستخدم جديد: إدخال البيانات مع الجلسة الجديدة
      const insertInfo = await env.DB.prepare(
        "INSERT INTO users (google_id, name, email, avatar_url, session_id) VALUES (?, ?, ?, ?, ?) RETURNING *"
      ).bind(googleId, name, email, avatarUrl, newSessionId).first();
      user = insertInfo;
    } else {
      // مستخدم موجود: تحديث الجلسة لمعرّف جديد لطرد الجلسة القديمة
      await env.DB.prepare(
        "UPDATE users SET session_id = ? WHERE id = ?"
      ).bind(newSessionId, user.id).run();
      // تحديث بيانات المستخدم المرجعة
      user.session_id = newSessionId; 
    }

    // دمج معرف الجلسة داخل التوكن
    const sessionToken = btoa(JSON.stringify({ 
      userId: user.id, 
      role: user.role,
      sessionId: newSessionId,
      exp: Date.now() + 86400000 
    }));

    return new Response(JSON.stringify({ success: true, token: sessionToken, user }), {
      headers: { 
        "Content-Type": "application/json",
        "Set-Cookie": `auth_token=${sessionToken}; Path=/; Max-Age=86400; SameSite=Lax`,
        ...corsHeaders 
      }
    });
  }

  // في حالة عدم تطابق المسار، نرجع null ليتصرف الموجه الرئيسي
  return null;
}
