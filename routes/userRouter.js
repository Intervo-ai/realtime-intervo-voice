const express = require('express');
const User = require('../models/User'); // Your User model
const router = express.Router();

// Endpoint to create or update a user using Google ID
router.post('/', async (req, res) => {
  const { email, name, googleId } = req.body;

  try {
    let user = await User.findOne({ 'authProviders.google.id': googleId });

    if (!user) {
      // If user does not exist, create a new one
      user = await new User({
        authProviders: {
          google: { id: googleId },
        },
        displayName: name,
        email: email,
      }).save();
    } else {
      // Optionally update user information here
      user.displayName = name;
      await user.save();
    }

    res.status(200).json({ message: 'User created or updated successfully', userId: user._id });
  } catch (error) {
    console.error('Error creating or updating user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Endpoint to get user information by identifier (either Google ID or MongoDB ObjectId)
router.get('/:identifier', async (req, res) => {
  const identifier = req.params.identifier;

  try {
    let user;

    // Determine if the identifier is a valid MongoDB ObjectId
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(identifier);
    } else {
      user = await User.findOne({ 'authProviders.google.id': identifier });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      displayName: user.displayName,
      email: user.email,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
