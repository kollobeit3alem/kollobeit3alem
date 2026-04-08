import { getCorsHeaders } from './utils.js';

export async function handleAssistantRoutes(request, env, path, url, adminUser) {
  const ch = getCorsHeaders(request, env);

  // 1. جلب قائمة الطلاب (للقراءة فقط)
  if (path === "/api/admin/users" && request.method === "GET") {
    const page = parseInt(url.searchParams.get("page")) || 1;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const search = url.searchParams.get("search") || "";
    const offset = (page - 1) * limit;

    let baseWhere = `FROM users WHERE role = 'student'`;
    let params = [];
    let countParams = [];

    if (search) {
      baseWhere += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const query = `SELECT id, name, email, phone, role, created_at ${baseWhere} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total ${baseWhere}`;
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

  // 2. عرض تقارير الطلاب (للقراءة فقط + نتائج الامتحانات)
  if (path.match(/^\/api\/admin\/reports\/\d+$/) && request.method === "GET") {
    const studentId = parseInt(path.split("/")[4], 10);
    let enrollments = [];
    let progress = [];
    let quizzes = [];

    try {
      const eRes = await env.DB.prepare(
        "SELECT c.title, e.* FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.user_id = ?"
      ).bind(studentId).all();
      enrollments = eRes.results;
    } catch (e) { console.error(e); }

    try {
      const pRes = await env.DB.prepare(
        "SELECT l.title as lesson_title, c.title as course_title, p.* FROM student_progress p JOIN lessons l ON p.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE p.user_id = ?"
      ).bind(studentId).all();
      progress = pRes.results;
    } catch (e) { console.error(e); }

    try {
      const qRes = await env.DB.prepare(
        "SELECT q.score, q.attempted_at, l.title as lesson_title, c.title as course_title FROM quiz_attempts q JOIN lessons l ON q.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE q.user_id = ? ORDER BY q.attempted_at DESC"
      ).bind(studentId).all();
      quizzes = qRes.results;
    } catch (e) { console.error(e); }

    return new Response(JSON.stringify({ enrollments, progress, quizzes }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  return null;
}
