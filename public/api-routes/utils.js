// ============================================================================
// utils.js — المتغيرات والدوال المشتركة
// التحسين: CORS ديناميكي من متغير بيئي بدلاً من hardcoded domain
// ============================================================================

export function getCorsHeaders(request, env) {
  const allowedOrigins = (env.ALLOWED_ORIGINS || "https://kollobeit3alem.pages.dev")
    .split(",")
    .map(o => o.trim());
  const origin = (request && request.headers) ? (request.headers.get("Origin") || "") : "";
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,DELETE,PUT",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

// للتوافق مع أي مكان يستخدم corsHeaders مباشرة بدون request (مثل OPTIONS handler)
export const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kollobeit3alem.pages.dev",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,DELETE,PUT",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin",
};
