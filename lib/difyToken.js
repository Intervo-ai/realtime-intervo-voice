const express = require("express");
const app = express();
// for storing dify token
app.locals.hub = {
  difyResponse: null,
  difyResponseTimer: null,
};

const AI_FLOW_URL = process.env.AI_FLOW_URL;
// authentication token lasts for 60 minutes during which time we can refresh these tokens. To do that, we may have to store the token meta information somewhere.
async function getDifyAuthenticationToken() {
  //Just so there isn't any issue, we switch at 10 minutes itself
  var TEN_MINUTES = 60 * 10 * 1000; /* ms */
  const hub = app.locals.hub;
  if (
    hub.difyResponse &&
    hub.difyResponseTimer &&
    new Date() - hub.difyResponseTimer < TEN_MINUTES
  ) {
    return hub.difyResponse;
  } else {
    const route = "/console/api/login";
    const method = "POST";
    const headers = {
      "Content-Type": "application/json",
    };

    const requestOptions = {
      method,
      headers,
      body: JSON.stringify({
        email: process.env.DIFY_USERNAME,
        password: process.env.DIFY_PASSWORD,
        remember_me: true
      }),
    };

    const url = `${AI_FLOW_URL}${route}`;

    let response = await fetch(url, requestOptions)
      .then((response) => response.json())
      .then((response) => {
        return response;
      })
      .catch((err) => {
        console.log("error", url, err);
        return err;
      });
    if (response?.data) {
      hub.difyResponseTimer = new Date();
      hub.difyResponse = response;
      return response;
    } else
      return {
        error: true,
        message: "Something went wrong",
      };
  }
}

async function getDifyToken() {
  const response = await getDifyAuthenticationToken();
  return response?.data;
}

module.exports = { getDifyToken };
