const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
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
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      if (path === "/api/courses" && request.method === "GET") {
        const courses = await env.DB.prepare(
          "SELECT * FROM courses WHERE is_published = 1 ORDER BY created_at DESC"
        ).all();

        return new Response(JSON.stringify(courses.results), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      if (path.startsWith("/api/courses/") && path.endsWith("/lessons") && request.method === "GET") {
        const courseId = path.split("/")[3];
        
        const lessons = await env.DB.prepare(
          "SELECT * FROM lessons WHERE course_id = ? ORDER BY order_num ASC"
        ).bind(courseId).all();

        return new Response(JSON.stringify(lessons.results), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

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
};
