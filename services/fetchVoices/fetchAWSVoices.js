const { PollyClient, DescribeVoicesCommand } = require("@aws-sdk/client-polly");

async function fetchAWSVoices() {
  const client = new PollyClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    const command = new DescribeVoicesCommand({});
    const response = await client.send(command);

    return response.Voices.map((voice) => ({
      voiceName: voice.Id,
      language: voice.LanguageName,
      gender: voice.Gender.toLowerCase(),
      premium: false,
    }));
  } catch (error) {
    console.error("Error fetching voices from AWS Polly:", error);
    return [];
  }
}

module.exports = fetchAWSVoices;
