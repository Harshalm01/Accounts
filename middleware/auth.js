function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.path === "/admin" || req.originalUrl === "/admin") {
      return next();
    }
    return res.redirect("/admin");
  }
  next();
}

function requireRole(roles = []) {
  return (req, res, next) => {
    const user = req.session ? req.session.user : null;
    if (!user) {
      if (req.path === "/admin" || req.originalUrl === "/admin") {
        return next();
      }
      return res.redirect("/admin");
    }
    const userRole = String(user.role || "").trim().toUpperCase();
    const allowedRoles = roles.map((r) => String(r).trim().toUpperCase());
    if (!allowedRoles.includes(userRole)) {
      const isTeamRole = userRole === "TEAM" || userRole === "HEAD";
      const target = isTeamRole ? "/admin/folders" : "/admin/dashboard";
      if (req.path === target || req.originalUrl === target) {
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