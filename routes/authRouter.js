const express = require('express');
const passport = require('passport');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.NEXTAUTH_SECRET;


// Google authentication route
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// Google callback route
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    try {
      // Find or create the user in the database
      const { id, displayName, email } = req.user;
      console.log(req.user, "user");

      let user = await User.findOne({ 'authProviders.google.id': id });

      if (!user) {
        // If user does not exist, create a new one
        user = await new User({
          authProviders: {
            google: { id },
          },
          displayName: displayName,
          email
        }).save();
      }

      // Generate a JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      
      // Set token in HTTP-only cookie
      res.cookie('authToken', token, {
        httpOnly: true,
        secure: true, // Changed to true since you're using HTTPS
        sameSite:"None",
        maxAge: 3600000, // 1 hour
        path: "/",
        domain: 'codedesign.app' // Add the domain

      });

      // Redirect to frontend
      const redirectUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Error during Google callback:', error);
      res.status(500).send('Server error');
    }
  }
);


router.get('/status', (req, res) => {
  const token = req.cookies.authToken;

  if (!token) {
    return res.status(400).json({ message: 'Authentication token missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.status(200).json({ user: { id: decoded.userId, email: decoded.email } });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});


// Logout route
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

module.exports = router;
