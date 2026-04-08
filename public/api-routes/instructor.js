import { getCorsHeaders } from './utils.js';
import { invalidateCoursesCache } from './courses.js';

export async function handleInstructorRoutes(request, env, path, url, adminUser) {
  const ch = getCorsHeaders(request, env);

  // 1. جلب طلاب المعلم فقط
  if (path === "/api/admin/users" && request.method === "GET") {
    const page = parseInt(url.searchParams.get("page")) || 1;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const search = url.searchParams.get("search") || "";
    const offset = (page - 1) * limit;

    let baseWhere = `FROM users u JOIN enrollments e ON u.id = e.user_id JOIN courses c ON e.course_id = c.id WHERE c.instructor_id = ? AND u.role = 'student'`;
    let params = [adminUser.id];
    let countParams = [adminUser.id];

    if (search) {
      baseWhere += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const query = `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role, u.created_at ${baseWhere} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(DISTINCT u.id) as total ${baseWhere}`;
    params.push(limit, offset);

    const usersList = await env.DB.prepare(query).bind(...params).all();
    const countRes = await env.DB.prepare(countQuery).bind(...countParams).first();

    return new Response(JSON.stringify({
      users: usersList.results,
      total: countRes.total,
      page: page,
      limit: limit
    }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 2. جلب تقارير الطلاب
  if (path.match(/^\/api\/admin\/reports\/\d+$/) && request.method === "GET") {
    const studentId = parseInt(path.split("/")[4], 10);
    let enrollments = [];
    let progress = [];
    let quizzes = [];

    try {
      const eRes = await env.DB.prepare(
        "SELECT c.title, e.* FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.user_id = ? AND c.instructor_id = ?"
      ).bind(studentId, adminUser.id).all();
      enrollments = eRes.results;
    } catch (e) { console.error(e); }

    try {
      const pRes = await env.DB.prepare(
        "SELECT l.title as lesson_title, c.title as course_title, p.* FROM student_progress p JOIN lessons l ON p.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE p.user_id = ? AND c.instructor_id = ?"
      ).bind(studentId, adminUser.id).all();
      progress = pRes.results;
    } catch (e) { console.error(e); }

    try {
      const qRes = await env.DB.prepare(
        "SELECT q.score, q.attempted_at, l.title as lesson_title, c.title as course_title FROM quiz_attempts q JOIN lessons l ON q.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE q.user_id = ? AND c.instructor_id = ? ORDER BY q.attempted_at DESC"
      ).bind(studentId, adminUser.id).all();
      quizzes = qRes.results;
    } catch (e) { console.error(e); }

    return new Response(JSON.stringify({ enrollments, progress, quizzes }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 3. جلب كورسات المدرس
  if (path === "/api/admin/courses" && request.method === "GET") {
    try {
      const coursesRes = await env.DB.prepare(
        "SELECT * FROM courses WHERE instructor_id = ? ORDER BY created_at DESC"
      ).bind(adminUser.id).all();

      return new Response(JSON.stringify(coursesRes.results), {
        headers: { "Content-Type": "application/json", ...ch }
      });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "حدث خطأ أثناء جلب الدورات" }), {
        status: 500, headers: { "Content-Type": "application/json", ...ch }
      });
    }
  }

  // إضافة كورس جديد
  if (path === "/api/admin/courses" && request.method === "POST") {
    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    const price = parseFloat(body.price) || 0;

    if (price < 0) {
      return new Response(JSON.stringify({ error: "السعر لا يمكن أن يكون قيمة سالبة" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
    }

    await env.DB.prepare(
      "INSERT INTO courses (title, description, image_url, instructor_contact, is_free, price, instructor_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.title, body.description, body.image_url, body.instructor_contact || "", isFree, price, adminUser.id, body.metadata || null).run();

    // التحسين: مسح كاش الكورسات فوراً بعد الإضافة
    await invalidateCoursesCache(env);

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // حذف كورس
  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "DELETE") {
    const courseId = path.split("/")[4];
    const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(courseId).first();
    if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(courseId).run();

    // التحسين: مسح كاش الكورسات فوراً بعد الحذف
    await invalidateCoursesCache(env);

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // تعديل كورس
  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "PUT") {
    const courseId = path.split("/")[4];
    const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(courseId).first();
    if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    const price = parseFloat(body.price) || 0;

    if (price < 0) {
      return new Response(JSON.stringify({ error: "السعر لا يمكن أن يكون قيمة سالبة" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
    }

    await env.DB.prepare(
      "UPDATE courses SET title = ?, description = ?, image_url = ?, is_free = ?, price = ?, metadata = ? WHERE id = ?"
    ).bind(body.title, body.description, body.image_url, isFree, price, body.metadata || null, courseId).run();

    // التحسين: مسح كاش الكورسات فوراً بعد التعديل
    await invalidateCoursesCache(env);

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 4. إدارة المحاضرات — إضافة
  if (path === "/api/admin/lessons" && request.method === "POST") {
    const body = await request.json();
    const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(body.course_id).first();
    if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    await env.DB.prepare(
      "INSERT INTO lessons (course_id, title, video_url, order_num) VALUES (?, ?, ?, ?)"
    ).bind(body.course_id, body.title, body.video_url, body.order_num).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // حذف محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "DELETE") {
    const lessonId = path.split("/")[4];
    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
    if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    await env.DB.prepare("DELETE FROM lessons WHERE id = ?").bind(lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // تعديل محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
    if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    const body = await request.json();
    await env.DB.prepare(
      "UPDATE lessons SET title = ?, video_url = ?, order_num = ? WHERE id = ?"
    ).bind(body.title, body.video_url, body.order_num, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // قفل/فتح محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+\/lock$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
    if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    const body = await request.json();
    await env.DB.prepare("UPDATE lessons SET is_admin_locked = ? WHERE id = ?").bind(body.is_locked, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 5. إدارة الامتحانات — إضافة
  if (path === "/api/admin/quizzes" && request.method === "POST") {
    const body = await request.json();
    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(body.lesson_id).first();
    const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
    if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    await env.DB.prepare(
      "INSERT INTO quizzes (lesson_id, image_url, option_a, option_b, option_c, option_d, correct_option, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.lesson_id, body.image_url, body.option_a, body.option_b, body.option_c || null, body.option_d || null, body.correct_option, body.type || 'mcq').run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // حذف امتحان
  if (path.match(/^\/api\/admin\/quizzes\/\d+$/) && request.method === "DELETE") {
    const quizId = path.split("/")[4];
    const quiz = await env.DB.prepare("SELECT lesson_id FROM quizzes WHERE id = ?").bind(quizId).first();
    if (quiz) {
      const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(quiz.lesson_id).first();
      const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
      if (!check || check.instructor_id !== adminUser.id) {
        return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });
      }
    }
    await env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quizId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  return null;
}
