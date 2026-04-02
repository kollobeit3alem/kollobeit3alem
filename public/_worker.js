const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,DELETE,PUT",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// دالة التحقق من صلاحيات الإدارة والجلسة الأحادية
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
    
    // التعديل: التحقق من session_id بالإضافة للصلاحيات
    const user = await env.DB.prepare("SELECT id, role, session_id FROM users WHERE id = ?").bind(sessionData.userId).first();
    
    if (!user) return null;
    
    // التحقق من الجلسة الأحادية (طرد الجهاز القديم)
    if (user.session_id !== sessionData.sessionId) {
      return null; // التوكن غير صالح لأن الجلسة تغيرت
    }
    
    if (user.role === 'admin' || user.role === 'instructor') {
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

    let adminUser = null;

    // --- 1. حماية مسارات الإدارة ---
    if (path === "/admin.kollobeit3alem" || path === "/admin.html" || path.startsWith("/admin_") || path.startsWith("/api/admin/")) {
      adminUser = await verifyAdmin(request, env);
      
      if (!adminUser) {
        if (path.startsWith("/api/")) {
          return new Response(JSON.stringify({ error: "Access Denied or Session Invalidated" }), { 
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        } else {
          return Response.redirect(url.origin + "/courses.html", 302);
        }
      }

      // --- تطبيق القيود الصارمة على المعلم (Instructor Constraints) ---
      if (adminUser.role === 'instructor') {
        const restrictedPaths = [
          "/api/admin/codes",
          "/api/admin/users/role"
        ];
        
        const isRestricted = restrictedPaths.some(rp => path.startsWith(rp));
        
        // منع المعلم من حذف أو تعديل المستخدمين (يسمح له فقط بطلب GET للرؤية)
        const isUserModify = path.match(/^\/api\/admin\/users\/\d+$/) && (request.method === "DELETE" || request.method === "PUT");
        
        if (isRestricted || isUserModify) {
          return new Response(JSON.stringify({ error: "Access Denied: هذا الإجراء مخصص للمدير فقط" }), { 
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        }
      }
    }

    // --- 2. مسارات الـ API ---
    if (path.startsWith("/api/")) {
      try {
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

        // ==========================================
        // مسارات لوحة الإدارة (Admin API)
        // ==========================================

        // جلب المستخدمين (المدير يرى الكل، المعلم يرى طلابه فقط)
        if (path === "/api/admin/users" && request.method === "GET") {
          if (adminUser.role === 'instructor') {
            // جلب الطلاب المشتركين في دورات هذا المعلم فقط (بشكل فريد DISTINCT لمنع التكرار)
            const users = await env.DB.prepare(`
              SELECT DISTINCT u.id, u.name, u.email, u.role, u.created_at 
              FROM users u
              JOIN enrollments e ON u.id = e.user_id
              JOIN courses c ON e.course_id = c.id
              WHERE c.instructor_id = ?
              ORDER BY u.created_at DESC
            `).bind(adminUser.id).all();
            return new Response(JSON.stringify(users.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          } else {
            // المدير يرى الكل
            const users = await env.DB.prepare("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC").all();
            return new Response(JSON.stringify(users.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
        }

        // حذف مستخدم (للمدير فقط، ومحمية بالأعلى)
        if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "DELETE") {
          const userId = path.split("/")[4];
          await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // تعديل بيانات مستخدم (للمدير فقط، ومحمية بالأعلى)
        if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "PUT") {
          const userId = path.split("/")[4];
          const body = await request.json();
          await env.DB.prepare("UPDATE users SET name = ?, role = ? WHERE id = ?").bind(body.name, body.role, userId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // جلب تقرير شامل للطالب (فلترة للمعلم)
        if (path.match(/^\/api\/admin\/reports\/\d+$/) && request.method === "GET") {
          const userId = path.split("/")[4];
          
          let enrollmentsQuery = `SELECT c.title, e.enrolled_at FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.user_id = ?`;
          let progressQuery = `SELECT l.title as lesson_title, c.title as course_title, p.completed_at FROM student_progress p JOIN lessons l ON p.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE p.user_id = ?`;
          
          let bindParams = [userId];

          // إذا كان طالباً للتقرير معلماً، نضيف شرط الـ instructor_id
          if (adminUser.role === 'instructor') {
            enrollmentsQuery += ` AND c.instructor_id = ?`;
            progressQuery += ` AND c.instructor_id = ?`;
            bindParams.push(adminUser.id);
          }
          
          const enrollments = await env.DB.prepare(enrollmentsQuery).bind(...bindParams).all();
          const progress = await env.DB.prepare(progressQuery).bind(...bindParams).all();
          
          return new Response(JSON.stringify({ enrollments: enrollments.results, progress: progress.results }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // --- إدارة الكورسات (مع عزل المعلمين) ---

        // إضافة دورة
        if (path === "/api/admin/courses" && request.method === "POST") {
          const body = await request.json();
          const isFree = body.is_free !== undefined ? body.is_free : 1;
          const price = body.price || 0;
          
          // نربط الكورس بالـ ID الخاص بمن قام بإنشائه
          await env.DB.prepare(
            "INSERT INTO courses (title, description, image_url, instructor_contact, is_free, price, instructor_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(body.title, body.description, body.image_url, body.instructor_contact || "", isFree, price, adminUser.id).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // حذف دورة
        if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "DELETE") {
          const courseId = path.split("/")[4];
          
          // حماية: إذا كان معلم، نمنعه من حذف كورسات غيره
          if (adminUser.role === 'instructor') {
            const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(courseId).first();
            if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }

          await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(courseId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // تعديل دورة
        if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "PUT") {
          const courseId = path.split("/")[4];
          
          if (adminUser.role === 'instructor') {
            const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(courseId).first();
            if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }

          const body = await request.json();
          const isFree = body.is_free !== undefined ? body.is_free : 1;
          const price = body.price || 0;

          await env.DB.prepare(
            "UPDATE courses SET title = ?, description = ?, image_url = ?, is_free = ?, price = ? WHERE id = ?"
          ).bind(body.title, body.description, body.image_url, isFree, price, courseId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // --- إدارة الأكواد (للمدير فقط) ---
        if (path === "/api/admin/codes" && request.method === "POST") {
          const body = await request.json();
          const course_id = body.course_id;
          const count = body.count || 1;
          const codes = [];
          
          for (let i = 0; i < count; i++) {
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            await env.DB.prepare("INSERT INTO activation_codes (code, course_id) VALUES (?, ?)").bind(code, course_id).run();
            codes.push(code);
          }
          return new Response(JSON.stringify({ success: true, codes }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        if (path.match(/^\/api\/admin\/codes\/\d+$/) && request.method === "GET") {
          const courseId = path.split("/")[4];
          const codes = await env.DB.prepare("SELECT * FROM activation_codes WHERE course_id = ? ORDER BY id DESC").bind(courseId).all();
          return new Response(JSON.stringify(codes.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // --- إدارة المحاضرات (مع حماية ملكية المعلم) ---

        // إضافة محاضرة
        if (path === "/api/admin/lessons" && request.method === "POST") {
          const body = await request.json();
          
          if (adminUser.role === 'instructor') {
            const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(body.course_id).first();
            if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }

          await env.DB.prepare(
            "INSERT INTO lessons (course_id, title, video_url, order_num) VALUES (?, ?, ?, ?)"
          ).bind(body.course_id, body.title, body.video_url, body.order_num).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // حذف محاضرة
        if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "DELETE") {
          const lessonId = path.split("/")[4];
          
          if (adminUser.role === 'instructor') {
            const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
            const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
            if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }

          await env.DB.prepare("DELETE FROM lessons WHERE id = ?").bind(lessonId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // تعديل محاضرة
        if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "PUT") {
          const lessonId = path.split("/")[4];
          
          if (adminUser.role === 'instructor') {
            const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
            const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
            if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }

          const body = await request.json();
          await env.DB.prepare(
            "UPDATE lessons SET title = ?, video_url = ?, order_num = ? WHERE id = ?"
          ).bind(body.title, body.video_url, body.order_num, lessonId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // قفل/فتح محاضرة
        if (path.match(/^\/api\/admin\/lessons\/\d+\/lock$/) && request.method === "PUT") {
          const lessonId = path.split("/")[4];
          const body = await request.json();
          await env.DB.prepare(
            "UPDATE lessons SET is_admin_locked = ? WHERE id = ?"
          ).bind(body.is_locked, lessonId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // إضافة امتحان
        if (path === "/api/admin/quizzes" && request.method === "POST") {
          const body = await request.json();
          
          if (adminUser.role === 'instructor') {
            const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(body.lesson_id).first();
            const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
            if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }

          await env.DB.prepare(
            "INSERT INTO quizzes (lesson_id, image_url, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(body.lesson_id, body.image_url, body.option_a, body.option_b, body.option_c, body.option_d, body.correct_option).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // --- الإضافة الجديدة: مسار حذف الأسئلة ---
        if (path.match(/^\/api\/admin\/quizzes\/\d+$/) && request.method === "DELETE") {
          const quizId = path.split("/")[4];
          
          // حماية ملكية المعلم: التأكد من أن السؤال تابع لدورة تخص المعلم
          if (adminUser.role === 'instructor') {
            const quiz = await env.DB.prepare("SELECT lesson_id FROM quizzes WHERE id = ?").bind(quizId).first();
            if (quiz) {
               const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(quiz.lesson_id).first();
               const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
               if (!check || check.instructor_id !== adminUser.id) {
                 return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
               }
            }
          }

          await env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quizId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        // ----------------------------------------

        // تعديل رتبة مستخدم 
        if (path === "/api/admin/users/role" && request.method === "PUT") {
          const body = await request.json();
          const result = await env.DB.prepare("UPDATE users SET role = ? WHERE email = ?").bind(body.role, body.email).run();
          if (result.meta.changes === 0) {
             return new Response(JSON.stringify({ error: "المستخدم غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // ==========================================
        // مسارات الطلاب العامة (والمنصة بشكل عام)
        // ==========================================

        // دالة مساعدة داخلية للتحقق من التوكن وصلاحية الجلسة للطلاب
        async function verifyStudentSession(request, env) {
            const authHeader = request.headers.get("Authorization");
            if (!authHeader) return { error: "Unauthorized", status: 401 };
            
            try {
                const token = authHeader.split(" ")[1];
                const sessionData = JSON.parse(atob(token));
                
                if (sessionData.exp < Date.now()) return { error: "Session Expired", status: 401 };

                // التحقق من قاعدة البيانات لمطابقة session_id
                const user = await env.DB.prepare("SELECT session_id FROM users WHERE id = ?").bind(sessionData.userId).first();
                
                if (!user || user.session_id !== sessionData.sessionId) {
                    return { error: "تم تسجيل الدخول من جهاز آخر. يرجى تسجيل الدخول مجدداً.", status: 403, invalidSession: true };
                }

                return { userId: sessionData.userId };
            } catch (e) {
                return { error: "Invalid Token", status: 401 };
            }
        }

        // جلب الكورسات (ديناميكية: المدير يرى الكل، المعلم يرى كورساته فقط، الطالب يرى الكل)
        if (path === "/api/courses" && request.method === "GET") {
          let isInstructor = false;
          let instId = null;
          
          const authH = request.headers.get("Authorization");
          if (authH && authH.startsWith("Bearer ")) {
            try {
              const token = authH.split(" ")[1];
              const sessionData = JSON.parse(atob(token));
              const u = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(sessionData.userId).first();
              if (u && u.role === 'instructor') {
                isInstructor = true;
                instId = u.id;
              }
            } catch(e) {}
          }

          let courses;
          if (isInstructor) {
            courses = await env.DB.prepare("SELECT * FROM courses WHERE instructor_id = ? ORDER BY id DESC").bind(instId).all();
          } else {
            courses = await env.DB.prepare("SELECT * FROM courses ORDER BY id DESC").all();
          }
          
          return new Response(JSON.stringify(courses.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // جلب دروس دورة معينة
        if (path.match(/^\/api\/courses\/\d+\/lessons$/) && request.method === "GET") {
          const courseId = path.split("/")[3];
          const lessons = await env.DB.prepare(
            "SELECT * FROM lessons WHERE course_id = ? ORDER BY order_num ASC"
          ).bind(courseId).all();
          return new Response(JSON.stringify(lessons.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // جلب امتحان خاص بمحاضرة معينة
        if (path.match(/^\/api\/lessons\/\d+\/quiz$/) && request.method === "GET") {
          const lessonId = path.split("/")[3];
          const quiz = await env.DB.prepare(
            "SELECT * FROM quizzes WHERE lesson_id = ?"
          ).bind(lessonId).all();
          
          return new Response(JSON.stringify(quiz.results || []), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // جلب معرفات الكورسات التي اشترك فيها الطالب
        if (path === "/api/my-enrollments" && request.method === "GET") {
          const authCheck = await verifyStudentSession(request, env);
          if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
          
          const enrollments = await env.DB.prepare("SELECT course_id FROM enrollments WHERE user_id = ?").bind(authCheck.userId).all();
          const enrolledCourseIds = enrollments.results.map(e => e.course_id);
          
          return new Response(JSON.stringify(enrolledCourseIds), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // جلب بيانات لوحة تحكم الطالب (Profile Dashboard)
        if (path === "/api/my-dashboard" && request.method === "GET") {
          const authCheck = await verifyStudentSession(request, env);
          if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
          
          const userId = authCheck.userId;

          const enrollments = await env.DB.prepare("SELECT course_id FROM enrollments WHERE user_id = ?").bind(userId).all();
          const totalCourses = enrollments.results.length;

          const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM student_progress WHERE user_id = ?").bind(userId).first();
          const completedLessons = completed.count;

          const coursesQuery = `
            SELECT c.id, c.title, c.image_url,
                   (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) as total_lessons,
                   (SELECT COUNT(*) FROM student_progress p JOIN lessons l ON p.lesson_id = l.id WHERE l.course_id = c.id AND p.user_id = e.user_id) as completed_lessons
            FROM courses c
            JOIN enrollments e ON c.id = e.course_id
            WHERE e.user_id = ?
          `;
          const enrolledCourses = await env.DB.prepare(coursesQuery).bind(userId).all();

          return new Response(JSON.stringify({
            stats: { totalCourses, completedLessons },
            enrolledCourses: enrolledCourses.results
          }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // الاشتراك في كورس
        if (path === "/api/enroll" && request.method === "POST") {
          const authCheck = await verifyStudentSession(request, env);
          if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
          
          const userId = authCheck.userId;
          const body = await request.json();
          const course_id = body.course_id;
          const code = body.code;

          const course = await env.DB.prepare("SELECT is_free FROM courses WHERE id = ?").bind(course_id).first();
          if (!course) return new Response(JSON.stringify({ error: "Course not found" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });

          if (course.is_free === 1) {
            try {
              await env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, course_id).run();
              return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            } catch (e) {
              return new Response(JSON.stringify({ error: "أنت مشترك بالفعل في هذا الكورس" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
            }
          } else {
            if (!code) return new Response(JSON.stringify({ error: "كود التفعيل مطلوب" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
            
            const activationCode = await env.DB.prepare("SELECT * FROM activation_codes WHERE code = ? AND course_id = ? AND is_used = 0").bind(code, course_id).first();
            
            if (!activationCode) {
              return new Response(JSON.stringify({ error: "الكود غير صحيح أو تم استخدامه مسبقاً" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
            }

            await env.DB.prepare("UPDATE activation_codes SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId, activationCode.id).run();
            try {
              await env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, course_id).run();
              return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            } catch (e) {
              return new Response(JSON.stringify({ error: "أنت مشترك بالفعل في هذا الكورس" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
            }
          }
        }

        // حفظ تقدم الطالب (إنهاء المحاضرة)
        if (path === "/api/progress" && request.method === "POST") {
          const authCheck = await verifyStudentSession(request, env);
          if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
          
          const body = await request.json();
          const lessonId = body.lessonId;
          const userId = authCheck.userId;

          await env.DB.prepare(
            "INSERT INTO student_progress (user_id, lesson_id, is_completed, completed_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)"
          ).bind(userId, lessonId).run();

          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // 3. عرض الملفات الثابتة إذا لم يكن الطلب للـ API
    return env.ASSETS.fetch(request);
  }
};
