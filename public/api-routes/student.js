import { corsHeaders } from './utils.js';
import { verifyStudentSession } from './auth.js';

export async function handleStudentRoutes(request, env, path, url) {
  
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

  return null;
}
