const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.NEXTAUTH_SECRET;

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.cookies.authToken;

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid authentication token" });
  }
};

module.exports = authenticateUser;
