const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,DELETE",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// دالة التحقق من صلاحيات الإدارة (حارس البوابة)
async function verifyAdmin(request, env) {
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
    
    const user = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(sessionData.userId).first();
    
    if (user && (user.role === 'admin' || user.role === 'instructor')) {
      return user;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 1. حماية صفحات الإدارة من جهة السيرفر
    if (path === "/admin.html" || path.startsWith("/admin_") || path.startsWith("/api/admin/")) {
      const admin = await verifyAdmin(request, env);
      if (!admin) {
        if (path.startsWith("/api/")) {
          return new Response(JSON.stringify({ error: "Access Denied" }), { 
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        } else {
          // تحويل أي شخص غير أدمن لصفحة تسجيل الدخول إذا حاول فتح الصفحة
          return Response.redirect(url.origin + "/", 302);
        }
      }
    }

    // 2. مسارات الـ API
    if (path.startsWith("/api/")) {
      try {
        // --- مسار تسجيل الدخول بجوجل ---
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

          let user = await env.DB.prepare(
            "SELECT * FROM users WHERE email = ?"
          ).bind(email).first();

          if (!user) {
            const insertInfo = await env.DB.prepare(
              "INSERT INTO users (google_id, name, email, avatar_url) VALUES (?, ?, ?, ?) RETURNING *"
            ).bind(googleId, name, email, avatarUrl).first();
            user = insertInfo;
          }

          const sessionToken = btoa(JSON.stringify({ 
            userId: user.id, 
            role: user.role, 
            exp: Date.now() + 86400000 
          }));

          return new Response(JSON.stringify({ success: true, token: sessionToken, user }), {
            headers: { 
              "Content-Type": "application/json",
              // حفظ التوكن في الكوكيز لحماية صفحات الإدارة
              "Set-Cookie": `auth_token=${sessionToken}; Path=/; Max-Age=86400; SameSite=Lax`,
              ...corsHeaders 
            }
          });
        }

        // --- مسارات الإدارة (إضافة دورة) ---
        if (path === "/api/admin/courses" && request.method === "POST") {
          const body = await request.json();
          await env.DB.prepare(
            "INSERT INTO courses (title, description, image_url, instructor_contact) VALUES (?, ?, ?, ?)"
          ).bind(body.title, body.description, body.image_url, body.instructor_contact || "").run();
          
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // --- مسارات الإدارة (حذف دورة) ---
        if (path.startsWith("/api/admin/courses/") && request.method === "DELETE") {
          const courseId = path.split("/")[4];
          await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(courseId).run();
          
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // --- مسارات الإدارة (إضافة درس) ---
        if (path === "/api/admin/lessons" && request.method === "POST") {
          const body = await request.json();
          await env.DB.prepare(
            "INSERT INTO lessons (course_id, title, video_url, order_num) VALUES (?, ?, ?, ?)"
          ).bind(body.course_id, body.title, body.video_url, body.order_num).run();
          
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // --- مسار جلب الكورسات للطلاب ---
        if (path === "/api/courses" && request.method === "GET") {
          const courses = await env.DB.prepare(
            "SELECT * FROM courses WHERE is_published = 1 ORDER BY created_at DESC"
          ).all();

          return new Response(JSON.stringify(courses.results), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // --- مسار جلب دروس دورة معينة ---
        if (path.startsWith("/api/courses/") && path.endsWith("/lessons") && request.method === "GET") {
          const courseId = path.split("/")[3];
          
          const lessons = await env.DB.prepare(
            "SELECT * FROM lessons WHERE course_id = ? ORDER BY order_num ASC"
          ).bind(courseId).all();

          return new Response(JSON.stringify(lessons.results), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // --- مسار حفظ تقدم الطالب ---
        if (path === "/api/progress" && request.method === "POST") {
          const authHeader = request.headers.get("Authorization");
          if (!authHeader) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { 
              status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } 
            });
          }

          const token = authHeader.split(" ")[1];
          const sessionData = JSON.parse(atob(token));
          
          if (sessionData.exp < Date.now()) {
            return new Response(JSON.stringify({ error: "Session Expired" }), { 
              status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } 
            });
          }

          const body = await request.json();
          const lessonId = body.lessonId;
          const userId = sessionData.userId;

          await env.DB.prepare(
            "INSERT INTO student_progress (user_id, lesson_id, is_completed, completed_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)"
          ).bind(userId, lessonId).run();

          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { 
          status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } 
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }
    }

    // 3. عرض الملفات الثابتة إذا لم يكن الطلب للـ API
    return env.ASSETS.fetch(request);
  }
};
