import { corsHeaders } from './utils.js';
import { verifyStudentSession } from './auth.js';

export async function handleStudentRoutes(request, env, path, url) {
  
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

  // مسار تحديث الملف الشخصي (إضافة رقم التليفون للطلاب)
  if (path === "/api/my-profile" && request.method === "PUT") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const body = await request.json();
    if (body.phone !== undefined) {
      await env.DB.prepare("UPDATE users SET phone = ? WHERE id = ?").bind(body.phone, authCheck.userId).run();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // جلب الكورسات (ديناميكية: المدير يرى الكل، المعلم يرى كورساته فقط، الطالب يرى الكل)
  // التعديل هنا: تم دمج جدول الكورسات مع جدول المستخدمين لجلب اسم المحاضر
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
      courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        WHERE c.instructor_id = ? 
        ORDER BY c.id DESC
      `).bind(instId).all();
    } else {
      courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        ORDER BY c.id DESC
      `).all();
    }
    
    return new Response(JSON.stringify(courses.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 💡 جدار الحماية للمحاضرات (يمنع المتطفلين من سحب الفيديوهات)
  if (path.match(/^\/api\/courses\/\d+\/lessons$/) && request.method === "GET") {
    const courseId = path.split("/")[3];
    
    // 1. التوثيق
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    // 2. جدار الاشتراك: منع من ليس لديه اشتراك رسمي (مع إعفاء المدير والمعلم المالك)
    if (authCheck.role === 'student') {
      const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(authCheck.userId, courseId).first();
      if (!isEnrolled) {
        return new Response(JSON.stringify({ error: "Access Denied: يجب الاشتراك في الكورس أولاً." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    } else if (authCheck.role === 'instructor') {
      const isOwner = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND instructor_id = ?").bind(courseId, authCheck.userId).first();
      if (!isOwner) {
        return new Response(JSON.stringify({ error: "Access Denied: غير مصرح لك." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // 3. إرسال الدروس فقط لمن يملك الصلاحية
    const lessons = await env.DB.prepare(
      "SELECT * FROM lessons WHERE course_id = ? ORDER BY order_num ASC"
    ).bind(courseId).all();
    return new Response(JSON.stringify(lessons.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 💡 جدار الحماية للامتحانات
  if (path.match(/^\/api\/lessons\/\d+\/quiz$/) && request.method === "GET") {
    const lessonId = path.split("/")[3];
    
    // 1. التوثيق
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    // جلب الكورس الخاص بالدرس
    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    if (!lesson) return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json", ...corsHeaders } });

    // 2. جدار الاشتراك
    if (authCheck.role === 'student') {
      const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(authCheck.userId, lesson.course_id).first();
      if (!isEnrolled) {
        return new Response(JSON.stringify({ error: "Access Denied: يجب الاشتراك في الكورس أولاً." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    } else if (authCheck.role === 'instructor') {
      const isOwner = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND instructor_id = ?").bind(lesson.course_id, authCheck.userId).first();
      if (!isOwner) {
        return new Response(JSON.stringify({ error: "Access Denied: غير مصرح لك." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    const quiz = await env.DB.prepare(
      "SELECT * FROM quizzes WHERE lesson_id = ?"
    ).bind(lessonId).all();
    
    return new Response(JSON.stringify(quiz.results || []), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  // جلب تقدم الطالب في كورس معين
  if (path.match(/^\/api\/courses\/\d+\/progress$/) && request.method === "GET") {
    const courseId = path.split("/")[3];
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const userId = authCheck.userId;

    const completedLessonsQuery = await env.DB.prepare(`
      SELECT p.lesson_id 
      FROM student_progress p 
      JOIN lessons l ON p.lesson_id = l.id 
      WHERE p.user_id = ? AND l.course_id = ?
    `).bind(userId, courseId).all();
    const completedLessons = completedLessonsQuery.results.map(row => row.lesson_id);

    let completedVideos = [];
    try {
      const completedVideosQuery = await env.DB.prepare(
        "SELECT video_key FROM student_video_progress WHERE user_id = ? AND course_id = ?"
      ).bind(userId, courseId).all();
      completedVideos = completedVideosQuery.results.map(row => row.video_key);
    } catch (e) {
    }

    return new Response(JSON.stringify({ completedLessons, completedVideos }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
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

  // حفظ تقدم الطالب (إنهاء المحاضرة بالكامل)
  if (path === "/api/progress" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const body = await request.json();
    const lessonId = body.lessonId;
    const userId = authCheck.userId;

    const existingProgress = await env.DB.prepare(
      "SELECT id FROM student_progress WHERE user_id = ? AND lesson_id = ?"
    ).bind(userId, lessonId).first();

    if (!existingProgress) {
      await env.DB.prepare(
        "INSERT INTO student_progress (user_id, lesson_id, is_completed, completed_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)"
      ).bind(userId, lessonId).run();
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // حفظ تقدم فيديو معين
  if (path === "/api/progress/video" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const body = await request.json();
    const { courseId, lessonId, videoKey } = body;
    const userId = authCheck.userId;

    try {
      const existingProgress = await env.DB.prepare(
        "SELECT id FROM student_video_progress WHERE user_id = ? AND video_key = ?"
      ).bind(userId, videoKey).first();

      if (!existingProgress) {
        await env.DB.prepare(
          "INSERT INTO student_video_progress (user_id, course_id, lesson_id, video_key, completed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
        ).bind(userId, courseId, lessonId, videoKey).run();
      }
    } catch (e) {
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // في حالة عدم تطابق أي مسار
  return null;
}
