function requireAuth(req, res, next) {
  const isLoginPage = req.path === "/admin" || req.path === "/admin/" || req.originalUrl === "/admin" || req.originalUrl === "/admin/";
  if (!req.session || !req.session.user) {
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
    const isLoginPage = req.path === "/admin" || req.path === "/admin/" || req.originalUrl === "/admin" || req.originalUrl === "/admin/";
    const user = req.session ? req.session.user : null;
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
  requireAuth,
  requireRole,
  isAdminArea
};