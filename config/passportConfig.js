
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');


passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://call-plugin-api.codedesign.app/auth/google/callback", // Must match Google Console
    },
    (accessToken, refreshToken, profile, done) => {
      // Find or create user logic
      User.findOne({ 'authProviders.google.id': profile.id })
        .then((existingUser) => {
          if (existingUser) {
            done(null, existingUser);
          } else {
            new User({
              authProviders: {
                google: { id: profile.id },
              },
              displayName: profile.displayName,
              email: profile.emails[0].value,
            })
              .save()
              .then((user) => done(null, user));
          }
        })
        .catch((err) => done(err, null));
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => done(null, user))
    .catch((err) => done(err, null));
});

module.exports = passport;
