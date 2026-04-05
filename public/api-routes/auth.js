// دالة التحقق من صلاحيات الإدارة والجلسة الأحادية
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

// دالة التحقق من جلسة الطالب
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
