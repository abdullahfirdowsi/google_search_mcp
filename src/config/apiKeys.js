const path = require('path');
const dotenv = require('dotenv');

// Load from project root .env by default
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getApiKeys() {
  return {
    primary: {
      key: process.env.API_KEY || null,
      cx: process.env.CX_ID || null
    },
    secondary: {
      key: process.env.API_KEY_SECONDARY || null,
      cx: process.env.CX_ID_SECONDARY || null
    }
  };
}

module.exports = {
  getApiKeys
};
