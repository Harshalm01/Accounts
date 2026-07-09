function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/admin");
  }
  next();
}

function requireRole(roles = []) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.redirect("/admin");
    if (!roles.includes(user.role)) {
      return res.status(403).send("Forbidden");
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