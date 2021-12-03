const dotenv = require("dotenv");

const envFound = dotenv.config();

if (!envFound) {
  throw Error("Can't load important env variables :(");
}

module.exports = {
  test: process.env.TEST,
  port: process.env.PORT,
  auth0Domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENTID,
  apiIdentifier: process.env.AUTH0_API_IDENTIFIER,
};
