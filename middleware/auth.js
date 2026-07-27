function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/admin");
  }
  next();
}

function requireRole(roles = []) {
  return (req, res, next) => {
    const user = req.session ? req.session.user : null;
    if (!user) return res.redirect("/admin");
    const userRole = String(user.role || "").trim().toUpperCase();
    const allowedRoles = roles.map((r) => String(r).trim().toUpperCase());
    if (!allowedRoles.includes(userRole)) {
      return res.redirect("/admin/dashboard");
    }
    next();
  };
}

function isAdminArea(pathname) {
  return pathname.startsWith("/admin");
}

module.exports = {
  requireAuth,
  requireRole,
  isAdminArea
};