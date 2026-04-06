import { corsHeaders } from './utils.js';
import { verifyStudentSession } from './auth.js';

export async function handleCourseRoutes(request, env, path, url) {
  
  // جلب الكورسات (ديناميكية: المدير يرى الكل، المعلم يرى كورساته فقط، الطالب يرى الكل من الكاش)
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

    if (isInstructor) {
      // 1. مسار المدرس: يجلب بياناته من الداتا بيز مباشرة (لأنه يحتاج رؤية تعديلاته اللحظية)
      const courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        WHERE c.instructor_id = ? 
        ORDER BY c.id DESC
      `).bind(instId).all();
      
      return new Response(JSON.stringify(courses.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      
    } else {
      // 2. مسار الطلاب والزوار: تطبيق نظام الكاش الخارق ⚡
      
      // أ. محاولة جلب الكورسات من الكاش أولاً
      if (env.COURSES_CACHE) {
        const cachedCourses = await env.COURSES_CACHE.get("all_courses");
        if (cachedCourses) {
          // إذا وجدها في الكاش، يعيدها فوراً في مللي ثانية بدون لمس قاعدة البيانات
          return new Response(cachedCourses, { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }

      // ب. إذا لم يجدها في الكاش، يجلبها من قاعدة البيانات
      const courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        ORDER BY c.id DESC
      `).all();
      
      const coursesJson = JSON.stringify(courses.results);

      // ج. حفظ نسخة في الكاش لمدة 24 ساعة (86400 ثانية) للطلبات القادمة
      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put("all_courses", coursesJson, { expirationTtl: 86400 });
      }

      return new Response(coursesJson, { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
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

  return null;
}
