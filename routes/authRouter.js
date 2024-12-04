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

      // Generate access token and refresh token
      const accessToken = jwt.sign(
        { userId: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const refreshToken = jwt.sign(
        { userId: user._id },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Store refresh token in user document
      user.refreshToken = refreshToken;
      await user.save();

      // Clear any existing cookies first
      res.clearCookie('authToken', {
        domain: '.development-api.intervo.ai',
        path: '/'
      });
      res.clearCookie('authToken', {
        domain: '.intervo.ai',
        path: '/'
      });
      res.clearCookie('refreshToken', {
        domain: '.intervo.ai',
        path: '/'
      });

      // Set both cookies
      res.cookie('authToken', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 3600000, // 1 hour
        path: "/",
        domain: 'intervo.ai'
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 3600000, // 7 days
        path: "/",
        domain: 'intervo.ai'
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
  console.log(token, "token");

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

// Add this new route
router.post('/refresh-token', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token missing' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Set new access token cookie
    res.cookie('authToken', newAccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 3600000,
      path: "/",
      domain: 'intervo.ai'
    });

    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

module.exports = router;
