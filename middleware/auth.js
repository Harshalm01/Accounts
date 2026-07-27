const crypto = require("crypto");

const AUTH_COOKIE_NAME = "3fm_auth";

function readCookie(req, name) {
  const header = (req && req.headers && req.headers.cookie) || "";
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const cookieName = part.slice(0, separatorIndex);
    if (cookieName === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1));
    }
  }
  return null;
}

function verifyAuthPayload(value) {
  if (!value) return null;
  const [data, signature] = String(value).split(".");
  if (!data || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "replace-this-in-production")
    .update(data)
    .digest("base64url");

  if (signature !== expectedSignature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed || !parsed.id || !parsed.username || !parsed.role) return null;
    return {
      id: parsed.id,
      username: parsed.username,
      role: parsed.role,
      teamName: parsed.teamName || null
    };
  } catch (error) {
    return null;
  }
}

function getUserFromReq(req) {
  if (req && req.session && req.session.user) {
    return req.session.user;
  }
  return verifyAuthPayload(readCookie(req, AUTH_COOKIE_NAME));
}

function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (user && req.session && !req.session.user) {
    req.session.user = user;
  }

  const isLoginPage = req.path === "/admin" || req.path === "/admin/" || req.originalUrl === "/admin" || req.originalUrl === "/admin/";
  if (!user) {
    if (isLoginPage) {
      return next();
    }
    const safeTarget = encodeURIComponent(req.originalUrl || "/admin/dashboard");
    return res.redirect(`/admin?redirect=${safeTarget}`);
  }
  next();
}

function requireRole(roles = []) {
  return (req, res, next) => {
    const user = getUserFromReq(req);
    if (user && req.session && !req.session.user) {
      req.session.user = user;
    }

    const isLoginPage = req.path === "/admin" || req.path === "/admin/" || req.originalUrl === "/admin" || req.originalUrl === "/admin/";
    if (!user) {
      if (isLoginPage) {
        return next();
      }
      const safeTarget = encodeURIComponent(req.originalUrl || "/admin/dashboard");
      return res.redirect(`/admin?redirect=${safeTarget}`);
    }

    const userRole = String(user.role || "").trim().toUpperCase();
    const allowedRoles = roles.map((r) => String(r).trim().toUpperCase());
    if (!allowedRoles.includes(userRole)) {
      const isTeamRole = userRole === "TEAM" || userRole === "HEAD";
      const target = isTeamRole ? "/admin/folders" : "/admin/dashboard";
      
      // Stop any self-redirection or endless redirect loops
      if (req.path === target || req.originalUrl === target || req.path.startsWith(target)) {
        return res.status(403).send("Access Denied: Insufficient permissions for this role.");
      }
      return res.redirect(target);
    }
    next();
  };
}

function isAdminArea(pathname) {
  return typeof pathname === "string" && pathname.startsWith("/admin");
}

module.exports = {
  getUserFromReq,
  requireAuth,
  requireRole,
  isAdminArea
};