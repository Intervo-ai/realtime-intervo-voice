const express = require('express');
const passport = require('passport');
const router = express.Router();

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
  (req, res) => {
    // Successful authentication, redirect home.
    res.redirect('http://localhost:3000'); // Update with your frontend domain
  }
);

router.get('/check-session', (req, res) => {
  if (req.isAuthenticated()) {
    res.status(200).json({ user: req.user });
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

module.exports = router;
